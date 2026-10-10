/**
 * Metadata-only probing: fetch enough audio to reach one ICY metadata block.
 * Never proxy full streams into RAM or assume that every MP3 stream has metadata.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const blockedIp = (ip: string) => {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") ||
      v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") ||
      v.startsWith("2001:db8") || v.startsWith("::ffff:");
  }
  const x = ip.split(".").map(Number);
  return x.length !== 4 || x[0] === 0 || x[0] === 10 || x[0] === 127 ||
    x[0] >= 224 || x[0] === 169 && x[1] === 254 ||
    x[0] === 172 && x[1] >= 16 && x[1] <= 31 ||
    x[0] === 192 && x[1] === 168 || x[0] === 100 && x[1] >= 64 && x[1] <= 127 ||
    x[0] === 192 && x[1] === 0 || x[0] === 198 && (x[1] === 18 || x[1] === 19);
};
async function validatePublicUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.port && !["80", "443", "8000", "8001", "8080", "8443"].includes(url.port))) {
    throw new Error("Unsupported radio stream URL");
  }
  if (url.hostname.toLowerCase() === "localhost") throw new Error("Private station host");
  if (isIP(url.hostname)) {
    if (blockedIp(url.hostname)) throw new Error("Private station host");
  } else {
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some((address) => blockedIp(address.address))) {
      throw new Error("Private station host");
    }
  }
  return url;
}
export type StreamNowPlaying = {
  title: string | null;
  artist: string | null;
  song: string | null;
  source: "icy" | "unavailable";
  stationName: string | null;
  bitrateKbps: number | null;
  checkedAt: string;
};
export function parseIcyTitle(metadata: string): string | null {
  const match = /(?:^|;)\s*StreamTitle=(['"])(.*?)\1\s*;?/is.exec(metadata);
  return match?.[2]?.trim() || null;
}
export async function probeStreamNowPlaying(streamUrl: string): Promise<StreamNowPlaying> {
  const checkedAt = new Date().toISOString();
  let current = streamUrl;
  let response: Response | null = null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    for (let redirect = 0; redirect < 4; redirect++) {
      await validatePublicUrl(current);
      response = await fetch(current, {
        headers: { "Icy-MetaData": "1", "User-Agent": "OpenHaul-Radio/2.0", "Accept": "*/*" },
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error("Radio redirect without location");
        current = new URL(location, current).toString();
        continue;
      }
      break;
    }
    if (!response || !response.ok) throw new Error("Radio stream unavailable");
    const stationName = response.headers.get("icy-name");
    const parsedBitrate = Number(response.headers.get("icy-br"));
    const bitrateKbps = Number.isFinite(parsedBitrate) && parsedBitrate > 0 ? parsedBitrate : null;
    const interval = Number(response.headers.get("icy-metaint") || 0);
    const unavailable = (): StreamNowPlaying => ({
      title: null, artist: null, song: null, source: "unavailable", stationName,
      bitrateKbps, checkedAt,
    });
    if (!Number.isSafeInteger(interval) || interval < 1 || interval > 1024 * 1024 || !response.body) {
      return unavailable();
    }
    const reader = response.body.getReader();
    let pending = new Uint8Array(0);
    async function readExact(length: number): Promise<Uint8Array> {
      const output = new Uint8Array(length);
      let offset = 0;
      while (offset < length) {
        if (pending.length) {
          const count = Math.min(pending.length, length - offset);
          output.set(pending.subarray(0, count), offset);
          pending = pending.subarray(count);
          offset += count;
        } else {
          const part = await reader.read();
          if (part.done) throw new Error("Stream closed before metadata");
          pending = part.value;
        }
      }
      return output;
    }
    try {
      await readExact(interval);
      const length = (await readExact(1))[0] * 16;
      if (length === 0) return unavailable();
      const raw = new TextDecoder("utf-8").decode(await readExact(length)).replace(/\0+$/g, "");
      const song = parseIcyTitle(raw);
      if (!song) return unavailable();
      const separator = song.indexOf(" - ");
      return {
        title: separator >= 0 ? song.slice(separator + 3).trim() : song,
        artist: separator >= 0 ? song.slice(0, separator).trim() : null,
        song, source: "icy", stationName, bitrateKbps, checkedAt,
      };
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  } finally {
    controller.abort();
    clearTimeout(timeout);
    await response?.body?.cancel().catch(() => undefined);
  }
}
const cache = new Map<string, { expires: number; value: StreamNowPlaying }>();
const inFlight = new Map<string, Promise<StreamNowPlaying>>();
export async function getStreamNowPlaying(url: string): Promise<StreamNowPlaying> {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.value;
  const pending = inFlight.get(url);
  if (pending) return pending;
  const task = probeStreamNowPlaying(url)
    .then((value) => {
      cache.set(url, { expires: Date.now() + (value.song ? 15000 : 30000), value });
      if (cache.size > 500) cache.delete(cache.keys().next().value!);
      return value;
    })
    .finally(() => inFlight.delete(url));
  inFlight.set(url, task);
  return task;
}
