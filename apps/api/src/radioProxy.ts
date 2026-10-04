import { spawn } from "node:child_process";
import type { FastifyInstance } from "fastify";

const DEFAULT_SOURCE_URL =
  "https://stingray.leanstream.co/CHSLFM?args=web_01&aw_0_req.gdpr=true&gdpr=true";
const DEFAULT_NEKOROUTE_URL = "https://proxyweb.nekosunevr.co.uk";

type OutputFormat = {
  contentType: string;
  extension: "mp3" | "ogg" | "aac";
  ffmpegArgs: (bitrateKbps: number) => string[];
};

const formats: Record<string, OutputFormat> = {
  mp3: {
    contentType: "audio/mpeg",
    extension: "mp3",
    ffmpegArgs: (bitrateKbps) => ["-c:a", "libmp3lame", "-b:a", `${bitrateKbps}k`, "-f", "mp3"],
  },
  ogg: {
    contentType: "audio/ogg",
    extension: "ogg",
    ffmpegArgs: (bitrateKbps) => ["-c:a", "libvorbis", "-b:a", `${bitrateKbps}k`, "-f", "ogg"],
  },
  aac: {
    contentType: "audio/aac",
    extension: "aac",
    ffmpegArgs: (bitrateKbps) => ["-c:a", "aac", "-b:a", `${bitrateKbps}k`, "-f", "adts"],
  },
};

function cleanBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function getBitrateKbps() {
  const parsed = Number.parseInt(process.env.RADIO_CHSL_BITRATE_KBPS ?? "128", 10);
  return Number.isFinite(parsed) ? Math.max(64, Math.min(320, parsed)) : 128;
}

async function createResidentialCanadaSession(sourceUrl: string) {
  const base = cleanBaseUrl(process.env.NEKOROUTE_API_URL ?? DEFAULT_NEKOROUTE_URL);
  const response = await fetch(`${base}/api/v1/preview/session`, {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "OpenHaul-RadioProxy/1.0 (+https://github.com/NekoSuneProjects/OpenHaul)",
    },
    body: JSON.stringify({
      url: sourceUrl,
      country: "CA",
      networkType: "residential",
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`NekoRoute session failed with HTTP ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`);
  }

  const data = await response.json() as {
    sessionId?: string;
    node?: {
      country?: string;
      countryName?: string;
      protocol?: string;
      city?: string | null;
      network?: { isHomeResidential?: boolean | null };
    };
  };

  if (!data.sessionId) throw new Error("NekoRoute did not return a sessionId");
  if (data.node?.country && data.node.country !== "CA") throw new Error("NekoRoute returned a non-Canadian route");
  if (data.node?.network?.isHomeResidential !== true) {
    throw new Error("NekoRoute returned a route that is not classified as residential");
  }

  return {
    base,
    sessionId: data.sessionId,
    node: data.node ?? null,
  };
}

export async function registerRadioProxyRoutes(app: FastifyInstance) {
  const sourceUrl = process.env.RADIO_CHSL_SOURCE_URL ?? DEFAULT_SOURCE_URL;
  const bitrateKbps = getBitrateKbps();

  app.get("/api/v1/public/radio/canada/chsl", async (_request, reply) => {
    const publicBase = cleanBaseUrl(process.env.OPENHAUL_PUBLIC_API_URL ?? "");
    const prefix = publicBase || "";

    reply.header("cache-control", "public, max-age=30");
    return {
      station: {
        callSign: "CHSL-FM",
        name: "Boom 92.7",
        city: "Slave Lake",
        province: "Alberta",
        country: "CA",
      },
      routing: {
        provider: "NekoRoute",
        country: "CA",
        networkType: "residential",
        api: cleanBaseUrl(process.env.NEKOROUTE_API_URL ?? DEFAULT_NEKOROUTE_URL),
      },
      source: {
        codec: "AAC/auto-detect",
        urlConfigured: Boolean(process.env.RADIO_CHSL_SOURCE_URL),
      },
      outputs: {
        mp3: `${prefix}/api/v1/public/radio/canada/chsl.mp3`,
        ogg: `${prefix}/api/v1/public/radio/canada/chsl.ogg`,
        aac: `${prefix}/api/v1/public/radio/canada/chsl.aac`,
      },
      recommendedForTruckSimulator: "mp3",
      bitrateKbps,
    };
  });

  for (const format of Object.values(formats)) {
    const routeUrl = `/api/v1/public/radio/canada/chsl.${format.extension}`;

    app.route({
      method: ["GET", "HEAD"],
      url: routeUrl,
      handler: async (request, reply) => {
        if (request.method === "HEAD") {
          reply
            .header("content-type", format.contentType)
            .header("cache-control", "no-store")
            .header("icy-name", "Boom 92.7 (CHSL-FM) via OpenHaul")
            .header("icy-genre", "Classic Hits")
            .header("icy-br", String(bitrateKbps));
          return reply.code(200).send();
        }

        let session: Awaited<ReturnType<typeof createResidentialCanadaSession>>;
        try {
          session = await createResidentialCanadaSession(sourceUrl);
        } catch (error) {
          app.log.warn({ error }, "Unable to create Canadian residential NekoRoute session for CHSL-FM");
          return reply.code(503).send({
            error: "radio_proxy_unavailable",
            message: error instanceof Error ? error.message : String(error),
          });
        }

        const relayUrl =
          `${session.base}/api/preview-runtime/${encodeURIComponent(session.sessionId)}` +
          `?kind=media&url=${encodeURIComponent(sourceUrl)}`;

        const ffmpeg = spawn("ffmpeg", [
          "-hide_banner",
          "-loglevel", "warning",
          "-nostdin",
          "-reconnect", "1",
          "-reconnect_streamed", "1",
          "-reconnect_delay_max", "5",
          "-i", relayUrl,
          "-vn",
          "-ac", "2",
          "-ar", "44100",
          ...format.ffmpegArgs(bitrateKbps),
          "pipe:1",
        ], {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let closed = false;
        const stop = () => {
          if (closed) return;
          closed = true;
          if (!ffmpeg.killed) ffmpeg.kill("SIGKILL");
        };

        request.raw.once("aborted", stop);
        request.raw.once("close", stop);
        reply.raw.once("close", stop);

        ffmpeg.stderr.on("data", (chunk) => {
          const message = String(chunk).trim();
          if (message) app.log.debug({ message, format: format.extension }, "CHSL-FM ffmpeg");
        });

        ffmpeg.once("error", (error) => {
          app.log.error({ error }, "Unable to start ffmpeg for CHSL-FM");
          if (!reply.raw.headersSent) {
            reply.raw.writeHead(500, { "content-type": "application/json" });
            reply.raw.end(JSON.stringify({ error: "ffmpeg_unavailable" }));
          } else if (!reply.raw.destroyed) {
            reply.raw.destroy(error);
          }
        });

        ffmpeg.once("spawn", () => {
          if (closed || reply.raw.destroyed) {
            stop();
            return;
          }

          reply.hijack();
          reply.raw.writeHead(200, {
            "content-type": format.contentType,
            "cache-control": "no-store, no-cache, must-revalidate",
            "icy-name": "Boom 92.7 (CHSL-FM) via OpenHaul",
            "icy-genre": "Classic Hits",
            "icy-br": String(bitrateKbps),
            "x-openhaul-radio-country": "CA",
            "x-openhaul-radio-network": "residential",
            "x-openhaul-radio-proxy-city": session.node?.city ?? "",
            "x-openhaul-radio-proxy-protocol": session.node?.protocol ?? "",
          });

          ffmpeg.stdout.pipe(reply.raw);
        });

        ffmpeg.once("exit", (code, signal) => {
          if (!closed && code !== 0) {
            app.log.warn({ code, signal, format: format.extension }, "CHSL-FM ffmpeg exited");
          }
          if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
          closed = true;
        });

        return reply;
      },
    });
  }
}
