import { spawn } from "node:child_process";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const DEFAULT_NEKOROUTE_URL = "https://proxyweb.nekosunevr.co.uk";
const DEFAULT_CHSL_SOURCE_URL =
  "https://stingray.leanstream.co/CHSLFM?args=web_01&aw_0_req.gdpr=true&gdpr=true";

type OutputFormat = {
  contentType: string;
  extension: "mp3" | "ogg" | "aac";
  ffmpegArgs: (bitrateKbps: number) => string[];
};

type RadioStation = {
  id: string;
  name: string;
  sourceUrl: string;
  country?: string;
  region?: string;
  networkType: "residential";
  bitrateKbps: number;
  genre?: string;
  city?: string;
  language?: string;
};

const stationSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  name: z.string().min(1).max(120),
  sourceUrl: z.string().url().refine((value) => /^https?:\/\//i.test(value), "HTTP(S) URL required"),
  country: z.string().length(2).transform((value) => value.toUpperCase()).optional(),
  region: z.string().min(1).max(80).optional(),
  networkType: z.literal("residential").default("residential"),
  bitrateKbps: z.coerce.number().int().min(64).max(320).default(128),
  genre: z.string().max(80).optional(),
  city: z.string().max(120).optional(),
  language: z.string().max(40).optional(),
}).refine((station) => Boolean(station.country || station.region), {
  message: "Each radio station needs a country or region so NekoRoute can select the correct residential exit",
});

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

function builtInStations(): RadioStation[] {
  const bitrate = Number.parseInt(process.env.RADIO_CHSL_BITRATE_KBPS ?? "128", 10);
  return [{
    id: "chsl",
    name: "Boom 92.7 (CHSL-FM)",
    sourceUrl: process.env.RADIO_CHSL_SOURCE_URL ?? DEFAULT_CHSL_SOURCE_URL,
    country: "CA",
    networkType: "residential",
    bitrateKbps: Number.isFinite(bitrate) ? Math.max(64, Math.min(320, bitrate)) : 128,
    genre: "Classic Hits",
    city: "Slave Lake, Alberta",
    language: "EN",
  }];
}

function configuredStations(app: FastifyInstance): RadioStation[] {
  const raw = process.env.RADIO_PROXY_STATIONS_JSON?.trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const rows = z.array(stationSchema).max(250).parse(parsed);
    return rows as RadioStation[];
  } catch (error) {
    app.log.error({ error }, "RADIO_PROXY_STATIONS_JSON is invalid; custom radio stations were ignored");
    return [];
  }
}

function stationRegistry(app: FastifyInstance) {
  const byId = new Map<string, RadioStation>();
  for (const station of [...builtInStations(), ...configuredStations(app)]) {
    byId.set(station.id.toLowerCase(), station);
  }
  return byId;
}

async function createResidentialSession(station: RadioStation) {
  const base = cleanBaseUrl(process.env.NEKOROUTE_API_URL ?? DEFAULT_NEKOROUTE_URL);
  const selector = station.country
    ? { country: station.country, networkType: "residential" }
    : { region: station.region, networkType: "residential" };

  const response = await fetch(`${base}/api/v1/preview/session`, {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "OpenHaul-RadioProxy/1.1 (+https://github.com/NekoSuneProjects/OpenHaul)",
    },
    body: JSON.stringify({
      url: station.sourceUrl,
      ...selector,
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
      region?: string;
      protocol?: string;
      city?: string | null;
      network?: { isHomeResidential?: boolean | null };
    };
  };

  if (!data.sessionId) throw new Error("NekoRoute did not return a sessionId");
  if (station.country && data.node?.country && data.node.country !== station.country) {
    throw new Error(`NekoRoute returned ${data.node.country} instead of requested ${station.country}`);
  }
  if (station.region && data.node?.region && data.node.region !== station.region) {
    throw new Error(`NekoRoute returned region ${data.node.region} instead of requested ${station.region}`);
  }
  if (data.node?.network?.isHomeResidential !== true) {
    throw new Error("NekoRoute returned a route that is not classified as home/residential");
  }

  return {
    base,
    sessionId: data.sessionId,
    node: data.node ?? null,
  };
}

function stationPublicJson(station: RadioStation) {
  const publicBase = cleanBaseUrl(process.env.OPENHAUL_PUBLIC_API_URL ?? "");
  const prefix = publicBase || "";
  const base = `${prefix}/api/v1/public/radio/stations/${encodeURIComponent(station.id)}`;

  return {
    station: {
      id: station.id,
      name: station.name,
      genre: station.genre ?? null,
      city: station.city ?? null,
      language: station.language ?? null,
    },
    routing: {
      provider: "NekoRoute",
      country: station.country ?? null,
      region: station.region ?? null,
      networkType: "residential",
    },
    outputs: {
      mp3: `${base}.mp3`,
      ogg: `${base}.ogg`,
      aac: `${base}.aac`,
    },
    recommendedForTruckSimulator: "mp3",
    bitrateKbps: station.bitrateKbps,
  };
}

export async function registerRadioProxyRoutes(app: FastifyInstance) {
  const stations = stationRegistry(app);

  app.get("/api/v1/public/radio/stations", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=30");
    return {
      count: stations.size,
      stations: [...stations.values()].map(stationPublicJson),
      routing: {
        provider: "NekoRoute",
        networkType: "residential",
        supportsCountrySelection: true,
        supportsRegionSelection: true,
      },
      formats: Object.keys(formats),
    };
  });

  app.get("/api/v1/public/radio/stations/:stationId", async (request, reply) => {
    const { stationId } = z.object({ stationId: z.string().min(1).max(64) }).parse(request.params);
    const station = stations.get(stationId.toLowerCase());
    if (!station) return reply.code(404).send({ error: "radio_station_not_found" });
    reply.header("cache-control", "public, max-age=30");
    return stationPublicJson(station);
  });

  app.route({
    method: ["GET", "HEAD"],
    url: "/api/v1/public/radio/stations/:stationId.:format",
    handler: async (request, reply) => {
      const params = z.object({
        stationId: z.string().min(1).max(64),
        format: z.enum(["mp3", "ogg", "aac"]),
      }).parse(request.params);

      const station = stations.get(params.stationId.toLowerCase());
      if (!station) return reply.code(404).send({ error: "radio_station_not_found" });

      const format = formats[params.format];
      if (!format) return reply.code(404).send({ error: "radio_format_not_found" });

      if (request.method === "HEAD") {
        reply
          .header("content-type", format.contentType)
          .header("cache-control", "no-store")
          .header("icy-name", station.name)
          .header("icy-genre", station.genre ?? "Radio")
          .header("icy-br", String(station.bitrateKbps))
          .header("x-openhaul-radio-network", "residential")
          .header("x-openhaul-radio-country", station.country ?? "")
          .header("x-openhaul-radio-region", station.region ?? "");
        return reply.code(200).send();
      }

      let session: Awaited<ReturnType<typeof createResidentialSession>>;
      try {
        session = await createResidentialSession(station);
      } catch (error) {
        app.log.warn({ error, stationId: station.id }, "Unable to create residential NekoRoute radio session");
        return reply.code(503).send({
          error: "radio_proxy_unavailable",
          stationId: station.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      const relayUrl =
        `${session.base}/api/preview-runtime/${encodeURIComponent(session.sessionId)}` +
        `?kind=media&url=${encodeURIComponent(station.sourceUrl)}`;

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
        ...format.ffmpegArgs(station.bitrateKbps),
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
        if (message) app.log.debug({ message, stationId: station.id, format: format.extension }, "radio ffmpeg");
      });

      ffmpeg.once("error", (error) => {
        app.log.error({ error, stationId: station.id }, "Unable to start ffmpeg for radio station");
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
          "icy-name": station.name,
          "icy-genre": station.genre ?? "Radio",
          "icy-br": String(station.bitrateKbps),
          "x-openhaul-radio-country": station.country ?? session.node?.country ?? "",
          "x-openhaul-radio-region": station.region ?? session.node?.region ?? "",
          "x-openhaul-radio-network": "residential",
          "x-openhaul-radio-proxy-country": session.node?.country ?? "",
          "x-openhaul-radio-proxy-city": session.node?.city ?? "",
          "x-openhaul-radio-proxy-protocol": session.node?.protocol ?? "",
        });

        ffmpeg.stdout.pipe(reply.raw);
      });

      ffmpeg.once("exit", (code, signal) => {
        if (!closed && code !== 0) {
          app.log.warn({ code, signal, stationId: station.id, format: format.extension }, "radio ffmpeg exited");
        }
        if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
        closed = true;
      });

      return reply;
    },
  });

  // Backward-compatible aliases for the first CHSL implementation.
  app.get("/api/v1/public/radio/canada/chsl", async (_request, reply) => {
    const station = stations.get("chsl");
    if (!station) return reply.code(404).send({ error: "radio_station_not_found" });
    return stationPublicJson(station);
  });

  for (const ext of ["mp3", "ogg", "aac"] as const) {
    app.get(`/api/v1/public/radio/canada/chsl.${ext}`, async (_request, reply) => {
      const base = cleanBaseUrl(process.env.OPENHAUL_PUBLIC_API_URL ?? "");
      return reply.redirect(`${base}/api/v1/public/radio/stations/chsl.${ext}`);
    });
  }
}
