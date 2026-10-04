import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { spawn } from "node:child_process";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const DEFAULT_NEKOROUTE_URL = "https://proxyweb.nekosunevr.co.uk";
const publicHostCache = new Map<string, number>();

function envInt(name: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function fastRadioInputArgs() {
  return [
    "-fflags", "nobuffer",
    "-flags", "low_delay",
    "-probesize", String(envInt("RADIO_FFMPEG_PROBESIZE", 65536, 32768, 1048576)),
    "-analyzeduration", String(envInt("RADIO_FFMPEG_ANALYZEDURATION_US", 250000, 0, 5000000)),
    "-rw_timeout", String(envInt("RADIO_FFMPEG_RW_TIMEOUT_US", 8000000, 1000000, 30000000)),
  ];
}

type RelayPayload = {
  url: string;
  proxy: boolean;
  country?: string;
};

const scanBodySchema = z.object({
  stations: z.array(z.object({
    id: z.string().min(1).max(160),
    url: z.string().min(1).max(4096),
    preferredCountry: z.string().length(2).transform((value) => value.toUpperCase()).optional(),
  })).min(1).max(250),
});

function cleanBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function relaySecret() {
  return process.env.RADIO_RELAY_SIGNING_SECRET
    ?? process.env.SESSION_SECRET
    ?? process.env.JWT_SECRET
    ?? "openhaul-radio-relay-v1";
}

function isPrivateAddress(address: string) {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)/i.test(address.replace(/:/g, ""))) return true;

  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }
  return false;
}

async function assertPublicRadioUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid radio URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP/HTTPS radio URLs are supported");
  }
  if (!parsed.hostname || parsed.hostname === "localhost" || parsed.hostname.endsWith(".local")) {
    throw new Error("Local/private radio targets are not allowed");
  }

  const now = Date.now();
  const cachedUntil = publicHostCache.get(parsed.hostname);
  if (!cachedUntil || cachedUntil <= now) {
    const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((row) => isPrivateAddress(row.address))) {
      throw new Error("Local/private radio targets are not allowed");
    }
    publicHostCache.set(parsed.hostname, now + 5 * 60_000);
  }
  return parsed.toString();
}

function signRelayPayload(payload: RelayPayload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", relaySecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyRelayPayload(token: string): RelayPayload {
  const [data, sig] = token.split(".");
  if (!data || !sig) throw new Error("Invalid relay token");

  const expected = createHmac("sha256", relaySecret()).update(data).digest();
  const actual = Buffer.from(sig, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Invalid relay token");
  }

  const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  return z.object({
    url: z.string().url(),
    proxy: z.boolean(),
    country: z.string().length(2).optional(),
  }).parse(parsed);
}

async function createResidentialSession(sourceUrl: string, country?: string) {
  const base = cleanBaseUrl(process.env.NEKOROUTE_API_URL ?? DEFAULT_NEKOROUTE_URL);
  const response = await fetch(`${base}/api/v1/preview/session`, {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "OpenHaul-RadioHealth/1.0 (+https://github.com/NekoSuneProjects/OpenHaul)",
    },
    body: JSON.stringify({
      url: sourceUrl,
      networkType: "residential",
      ...(country ? { country } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`NekoRoute returned HTTP ${response.status}`);
  }

  const data = await response.json() as {
    sessionId?: string;
    node?: {
      country?: string;
      protocol?: string;
      city?: string | null;
      network?: { isHomeResidential?: boolean | null };
    };
  };

  if (!data.sessionId) throw new Error("NekoRoute did not return a sessionId");
  if (data.node?.network?.isHomeResidential !== true) {
    throw new Error("NekoRoute route was not residential");
  }
  if (country && data.node?.country && data.node.country !== country) {
    throw new Error(`NekoRoute returned ${data.node.country} instead of ${country}`);
  }

  return {
    inputUrl: `${base}/api/preview-runtime/${encodeURIComponent(data.sessionId)}?kind=media&url=${encodeURIComponent(sourceUrl)}`,
    node: data.node ?? null,
  };
}

async function probeCodec(inputUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v", "error",
      ...fastRadioInputArgs(),
      "-select_streams", "a:0",
      "-show_entries", "stream=codec_name",
      "-of", "default=noprint_wrappers=1:nokey=1",
      inputUrl,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Radio probe timed out"));
    }, 10_000);

    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) resolve(stdout.trim().toLowerCase());
      else reject(new Error(stderr.trim().slice(0, 240) || `ffprobe exited ${code}`));
    });
  });
}

function relayUrl(request: any, payload: RelayPayload) {
  const explicit = cleanBaseUrl(process.env.OPENHAUL_PUBLIC_API_URL ?? "");
  const base = explicit || `${request.protocol}://${request.headers.host}`;
  return `${base}/api/v1/public/radio/repair/${signRelayPayload(payload)}.mp3`;
}

async function scanOne(request: any, row: z.infer<typeof scanBodySchema>["stations"][number]) {
  const url = await assertPublicRadioUrl(row.url);

  try {
    const codec = await probeCodec(url);
    if (codec === "mp3") {
      return {
        id: row.id,
        status: "working",
        route: "direct",
        codec,
        originalUrl: url,
        replacementUrl: null,
        changed: false,
      };
    }

    return {
      id: row.id,
      status: "repaired",
      route: "direct-transcode",
      codec,
      originalUrl: url,
      replacementUrl: relayUrl(request, { url, proxy: false }),
      changed: true,
      reason: `Direct stream works but codec is ${codec}; OpenHaul MP3 relay recommended for ETS2/ATS.`,
    };
  } catch (directError) {
    try {
      const session = await createResidentialSession(url, row.preferredCountry);
      const codec = await probeCodec(session.inputUrl);
      return {
        id: row.id,
        status: "repaired",
        route: "residential-proxy",
        codec,
        originalUrl: url,
        replacementUrl: relayUrl(request, { url, proxy: true, country: row.preferredCountry }),
        changed: true,
        proxy: {
          country: session.node?.country ?? row.preferredCountry ?? null,
          protocol: session.node?.protocol ?? null,
          city: session.node?.city ?? null,
        },
        reason: "Direct stream failed, but it works through a residential NekoRoute exit.",
      };
    } catch (proxyError) {
      return {
        id: row.id,
        status: "broken",
        route: "none",
        codec: null,
        originalUrl: url,
        replacementUrl: null,
        changed: false,
        reason: proxyError instanceof Error ? proxyError.message : String(proxyError),
        directError: directError instanceof Error ? directError.message : String(directError),
      };
    }
  }
}

export async function registerRadioHealthRoutes(app: FastifyInstance) {
  app.post("/api/v1/public/radio/scan", async (request, reply) => {
    const body = scanBodySchema.parse(request.body);
    // The web editor sends small batches. Probe each small batch concurrently so
    // a large live_streams.sii scan stays practical without spawning hundreds
    // of ffprobe processes at once.
    const results = await Promise.all(body.stations.map(async (station) => {
      try {
        return await scanOne(request, station);
      } catch (error) {
        return {
          id: station.id,
          status: "broken",
          route: "none",
          codec: null,
          originalUrl: station.url,
          replacementUrl: null,
          changed: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }));

    return {
      total: results.length,
      working: results.filter((row) => row.status === "working").length,
      repaired: results.filter((row) => row.status === "repaired").length,
      broken: results.filter((row) => row.status === "broken").length,
      results,
    };
  });

  app.route({
    method: ["GET", "HEAD"],
    url: "/api/v1/public/radio/repair/:token.mp3",
    handler: async (request, reply) => {
      const { token } = z.object({ token: z.string().min(20).max(8192) }).parse(request.params);
      let payload: RelayPayload;
      try {
        payload = verifyRelayPayload(token);
        payload.url = await assertPublicRadioUrl(payload.url);
      } catch (error) {
        return reply.code(400).send({
          error: "invalid_radio_relay",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      if (request.method === "HEAD") {
        return reply
          .header("content-type", "audio/mpeg")
          .header("cache-control", "no-store")
          .code(200)
          .send();
      }

      let inputUrl = payload.url;
      let proxyProtocol = "";
      if (payload.proxy) {
        try {
          const session = await createResidentialSession(payload.url, payload.country);
          inputUrl = session.inputUrl;
          proxyProtocol = session.node?.protocol ?? "";
        } catch (error) {
          return reply.code(503).send({
            error: "radio_proxy_unavailable",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const ffmpeg = spawn("ffmpeg", [
        "-hide_banner", "-loglevel", "warning", "-nostdin",
        ...fastRadioInputArgs(),
        "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_at_eof", "1", "-reconnect_delay_max", "2",
        "-i", inputUrl,
        "-vn", "-ac", "2", "-ar", "44100",
        "-c:a", "libmp3lame", "-compression_level", "0", "-b:a", "128k",
        "-flush_packets", "1", "-write_xing", "0", "-f", "mp3",
        "pipe:1",
      ], { stdio: ["ignore", "pipe", "pipe"] });

      let closed = false;
      const stop = () => {
        if (closed) return;
        closed = true;
        if (!ffmpeg.killed) ffmpeg.kill("SIGKILL");
      };
      request.raw.once("aborted", stop);
      request.raw.once("close", stop);
      reply.raw.once("close", stop);

      ffmpeg.once("spawn", () => {
        if (closed || reply.raw.destroyed) return stop();
        reply.hijack();
        reply.raw.writeHead(200, {
          "content-type": "audio/mpeg",
          "cache-control": "no-store, no-cache, must-revalidate, no-transform",
          "x-accel-buffering": "no",
          "icy-br": "128",
          "x-openhaul-radio-route": payload.proxy ? "residential-proxy" : "direct-transcode",
          "x-openhaul-radio-proxy-protocol": proxyProtocol,
        });
        ffmpeg.stdout.pipe(reply.raw);
      });

      ffmpeg.once("error", (error) => {
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { "content-type": "application/json" });
          reply.raw.end(JSON.stringify({ error: "ffmpeg_unavailable" }));
        } else if (!reply.raw.destroyed) {
          reply.raw.destroy(error);
        }
      });

      ffmpeg.once("exit", () => {
        if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
        closed = true;
      });

      return reply;
    },
  });
}
