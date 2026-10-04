import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { spawn } from "node:child_process";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

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
};

const geoProbeSchema = z.object({
  url: z.string().min(1).max(4096),
});

const scanBodySchema = z.object({
  stations: z.array(z.object({
    id: z.string().min(1).max(160),
    url: z.string().min(1).max(4096),
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
  return z.object({ url: z.string().url() }).parse(parsed);
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
  return `${base}/api/v1/public/radio/repair.mp3?token=${encodeURIComponent(signRelayPayload(payload))}`;
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
      replacementUrl: relayUrl(request, { url }),
      changed: true,
      reason: `Direct stream works but codec is ${codec}; optional MP3 transcode available for legacy SCS radio imports.`,
    };
  } catch (error) {
    return {
      id: row.id,
      status: "broken",
      route: "none",
      codec: null,
      originalUrl: url,
      replacementUrl: null,
      changed: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function registerRadioHealthRoutes(app: FastifyInstance) {
  app.post("/api/v1/public/radio/geo-probe", async (request) => {
    const body = geoProbeSchema.parse(request.body);
    const url = await assertPublicRadioUrl(body.url);

    try {
      const codec = await probeCodec(url);
      return {
        url,
        classification: "direct",
        direct: { ok: true, codec },
        countries: [],
        note: "Regional proxy probing has been removed. OpenHaul tests the original station URL directly.",
      };
    } catch (error) {
      return {
        url,
        classification: "unavailable",
        direct: { ok: false, error: error instanceof Error ? error.message : String(error) },
        countries: [],
        note: "Regional proxy probing has been removed. OpenHaul tests the original station URL directly.",
      };
    }
  });

  app.post("/api/v1/public/radio/scan", async (request) => {
    const body = scanBodySchema.parse(request.body);
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

  async function handleRepairStream(request: any, reply: any, token: string) {
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

    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "warning", "-nostdin",
      ...fastRadioInputArgs(),
      "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_at_eof", "1", "-reconnect_delay_max", "2",
      "-i", payload.url,
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
        "x-openhaul-radio-route": "direct-transcode",
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
  }

  app.route({
    method: ["GET", "HEAD"],
    url: "/api/v1/public/radio/repair.mp3",
    handler: async (request, reply) => {
      const { token } = z.object({ token: z.string().min(20).max(8192) }).parse(request.query);
      return handleRepairStream(request, reply, token);
    },
  });

  app.route({
    method: ["GET", "HEAD"],
    url: "/api/v1/public/radio/repair/:token.mp3",
    handler: async (request, reply) => {
      const { token } = z.object({ token: z.string().min(20).max(8192) }).parse(request.params);
      return handleRepairStream(request, reply, token);
    },
  });
}
