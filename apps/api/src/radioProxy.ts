import { spawn } from "node:child_process";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const DEFAULT_NEKOROUTE_URL = "https://proxyweb.nekosunevr.co.uk";
const DEFAULT_RADIO_BROWSER_URL = "https://de1.api.radio-browser.info";
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
  networkType?: "residential";
  forceProxy?: boolean;
  bitrateKbps: number;
  genre?: string;
  city?: string;
  language?: string;
  homepage?: string;
  favicon?: string;
  codec?: string;
  source: "builtin" | "configured" | "radio-browser";
  stationUuid?: string;
};

type RadioBrowserStation = {
  stationuuid?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  homepage?: string;
  favicon?: string;
  tags?: string;
  countrycode?: string;
  state?: string;
  language?: string;
  codec?: string;
  bitrate?: number;
  votes?: number;
  clickcount?: number;
  lastcheckok?: number | boolean;
};

type GeoRule = {
  stationUuid?: string;
  country?: string;
  region?: string;
};

const configuredStationSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  name: z.string().min(1).max(120),
  sourceUrl: z.string().url().refine((value) => /^https?:\/\//i.test(value), "HTTP(S) URL required"),
  country: z.string().length(2).transform((value) => value.toUpperCase()).optional(),
  region: z.string().min(1).max(80).optional(),
  forceProxy: z.boolean().default(false),
  networkType: z.literal("residential").optional(),
  bitrateKbps: z.coerce.number().int().min(64).max(320).default(128),
  genre: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  language: z.string().max(80).optional(),
  homepage: z.string().url().optional(),
  favicon: z.string().url().optional(),
}).refine((station) => !station.forceProxy || Boolean(station.country || station.region), {
  message: "Proxy-enabled stations need a country or region",
});

const geoRuleSchema = z.object({
  stationUuid: z.string().min(1).max(120),
  country: z.string().length(2).transform((value) => value.toUpperCase()).optional(),
  region: z.string().min(1).max(80).optional(),
}).refine((rule) => Boolean(rule.country || rule.region), {
  message: "Geo rules need a target country or region",
});

const directoryQuerySchema = z.object({
  country: z.string().transform((value) => value.toUpperCase()).refine((value) => value === "ALL" || /^[A-Z]{2}$/.test(value), "Country must be a 2-letter code or ALL").default("CA"),
  q: z.string().max(120).optional(),
  tag: z.string().max(80).optional(),
  codec: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
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

function publicBase() {
  return cleanBaseUrl(process.env.OPENHAUL_PUBLIC_API_URL ?? "");
}

function getRadioBrowserBase() {
  return cleanBaseUrl(process.env.RADIO_BROWSER_API_URL ?? DEFAULT_RADIO_BROWSER_URL);
}

async function canReadAudioDirectly(sourceUrl: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn("ffprobe", [
      "-v", "error",
      ...fastRadioInputArgs(),
      "-select_streams", "a:0",
      "-show_entries", "stream=codec_name",
      "-of", "default=noprint_wrappers=1:nokey=1",
      sourceUrl,
    ], { stdio: ["ignore", "pipe", "ignore"] });

    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, 10_000);

    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0 && Boolean(stdout.trim()));
    });
  });
}

function allowDirectProxyFallback() {
  return !["0", "false", "no", "off"].includes(
    String(process.env.RADIO_PROXY_ALLOW_DIRECT_FALLBACK ?? "true").trim().toLowerCase(),
  );
}

function parseConfiguredStations(app: FastifyInstance): RadioStation[] {
  const raw = process.env.RADIO_PROXY_STATIONS_JSON?.trim();
  if (!raw || raw === "[]") return [];
  try {
    return z.array(configuredStationSchema).max(250).parse(JSON.parse(raw)).map((row) => ({
      ...row,
      networkType: row.forceProxy ? "residential" : undefined,
      source: "configured" as const,
    }));
  } catch (error) {
    app.log.error({ error }, "RADIO_PROXY_STATIONS_JSON is invalid; custom stations were ignored");
    return [];
  }
}

function parseGeoRules(app: FastifyInstance): GeoRule[] {
  const raw = process.env.RADIO_GEO_RULES_JSON?.trim();
  if (!raw || raw === "[]") return [];
  try {
    return z.array(geoRuleSchema).max(500).parse(JSON.parse(raw));
  } catch (error) {
    app.log.error({ error }, "RADIO_GEO_RULES_JSON is invalid; geo rules were ignored");
    return [];
  }
}

function builtInStations(): RadioStation[] {
  const bitrate = Number.parseInt(process.env.RADIO_CHSL_BITRATE_KBPS ?? "128", 10);
  return [{
    id: "chsl",
    name: "Boom 92.7 (CHSL-FM)",
    sourceUrl: process.env.RADIO_CHSL_SOURCE_URL ?? DEFAULT_CHSL_SOURCE_URL,
    country: "CA",
    forceProxy: true,
    networkType: "residential",
    bitrateKbps: Number.isFinite(bitrate) ? Math.max(64, Math.min(320, bitrate)) : 128,
    genre: "Classic Hits",
    city: "Slave Lake, Alberta",
    language: "EN",
    source: "builtin",
  }];
}

function stationRegistry(app: FastifyInstance) {
  const byId = new Map<string, RadioStation>();
  for (const station of [...builtInStations(), ...parseConfiguredStations(app)]) {
    byId.set(station.id.toLowerCase(), station);
  }
  return byId;
}

async function fetchRadioBrowser(path: string, params: URLSearchParams, timeoutMs = 10_000) {
  const url = `${getRadioBrowserBase()}${path}?${params.toString()}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: "application/json",
      "user-agent": "OpenHaul/1.1 (+https://github.com/NekoSuneProjects/OpenHaul)",
    },
  });
  if (!response.ok) throw new Error(`Radio Browser returned HTTP ${response.status}`);
  return response.json();
}

async function resolveRadioBrowserStation(stationUuid: string): Promise<RadioBrowserStation | null> {
  const data = await fetchRadioBrowser(
    `/json/stations/byuuid/${encodeURIComponent(stationUuid)}`,
    new URLSearchParams(),
  ) as RadioBrowserStation[];
  return data[0] ?? null;
}

function geoRuleFor(stationUuid: string, rules: GeoRule[]) {
  return rules.find((rule) => rule.stationUuid === stationUuid) ?? null;
}

function radioBrowserToStation(row: RadioBrowserStation, rules: GeoRule[]): RadioStation | null {
  const stationUuid = String(row.stationuuid ?? "").trim();
  const sourceUrl = String(row.url_resolved || row.url || "").trim();
  if (!stationUuid || !/^https?:\/\//i.test(sourceUrl)) return null;

  const rule = geoRuleFor(stationUuid, rules);
  const bitrate = Number(row.bitrate || 128);
  return {
    id: `rb-${stationUuid}`,
    stationUuid,
    name: String(row.name || "Unknown station").trim(),
    sourceUrl,
    country: rule?.country ?? (row.countrycode ? String(row.countrycode).toUpperCase() : undefined),
    region: rule?.region,
    forceProxy: Boolean(rule),
    networkType: rule ? "residential" : undefined,
    bitrateKbps: Number.isFinite(bitrate) && bitrate > 0 ? Math.max(64, Math.min(320, bitrate)) : 128,
    genre: String(row.tags || "").split(",").filter(Boolean).slice(0, 3).join(", ") || undefined,
    city: row.state ? String(row.state) : undefined,
    language: row.language ? String(row.language) : undefined,
    homepage: row.homepage || undefined,
    favicon: row.favicon || undefined,
    codec: row.codec ? String(row.codec).toUpperCase() : undefined,
    source: "radio-browser",
  };
}

async function createRegionalProxySession(station: RadioStation) {
  if (!station.country && !station.region) throw new Error("Geo-routed station has no country or region");
  const base = cleanBaseUrl(process.env.NEKOROUTE_API_URL ?? DEFAULT_NEKOROUTE_URL);

  const requestSession = async (networkType: "residential" | "hosting") => {
    const selector = station.country
      ? { country: station.country, networkType }
      : { region: station.region, networkType };

    const response = await fetch(`${base}/api/v1/preview/session`, {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "OpenHaul-RadioProxy/1.3 (+https://github.com/NekoSuneProjects/OpenHaul)",
      },
      body: JSON.stringify({ url: station.sourceUrl, ...selector }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`NekoRoute ${networkType} session failed with HTTP ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`);
    }

    const data = await response.json() as {
      sessionId?: string;
      node?: {
        country?: string;
        countryName?: string;
        region?: string;
        protocol?: string;
        city?: string | null;
        network?: {
          connectionType?: string | null;
          isHomeResidential?: boolean | null;
          isHostingProvider?: boolean | null;
        };
      };
    };

    if (!data.sessionId) throw new Error("NekoRoute did not return a sessionId");
    if (station.country && data.node?.country && data.node.country !== station.country) {
      throw new Error(`NekoRoute returned ${data.node.country} instead of requested ${station.country}`);
    }
    if (station.region && data.node?.region && data.node.region !== station.region) {
      throw new Error(`NekoRoute returned region ${data.node.region} instead of requested ${station.region}`);
    }
    if (networkType === "residential" && data.node?.network?.isHomeResidential !== true) {
      throw new Error("NekoRoute returned a route that is not classified as home/residential");
    }
    if (networkType === "hosting" && data.node?.network?.isHostingProvider !== true && data.node?.network?.connectionType !== "hosting") {
      throw new Error("NekoRoute returned a route that is not classified as hosting/VPS");
    }

    return {
      base,
      sessionId: data.sessionId,
      node: data.node ?? null,
      routeMode: networkType === "residential" ? "residential-proxy" : "hosting-proxy",
    };
  };

  try {
    return await requestSession("residential");
  } catch (residentialError) {
    try {
      return await requestSession("hosting");
    } catch (hostingError) {
      throw new Error(
        `No usable regional NekoRoute proxy. Residential: ${residentialError instanceof Error ? residentialError.message : String(residentialError)}; ` +
        `Hosting/VPS: ${hostingError instanceof Error ? hostingError.message : String(hostingError)}`,
      );
    }
  }
}

function stationOutputBase(station: RadioStation) {
  const prefix = publicBase();
  if (station.source === "radio-browser" && station.stationUuid) {
    return `${prefix}/api/v1/public/radio/browser/${encodeURIComponent(station.stationUuid)}`;
  }
  return `${prefix}/api/v1/public/radio/stations/${encodeURIComponent(station.id)}`;
}

function stationPublicJson(station: RadioStation) {
  const base = stationOutputBase(station);
  const directPlayable = !station.forceProxy;
  return {
    id: station.id,
    stationUuid: station.stationUuid ?? null,
    name: station.name,
    country: station.country ?? null,
    region: station.region ?? null,
    state: station.city ?? null,
    language: station.language ?? null,
    genre: station.genre ?? null,
    codec: station.codec ?? null,
    bitrateKbps: station.bitrateKbps,
    homepage: station.homepage ?? null,
    favicon: station.favicon ?? null,
    source: station.source,
    routing: {
      mode: station.forceProxy ? "residential-then-hosting-proxy" : "direct",
      proxyRequired: Boolean(station.forceProxy),
      provider: station.forceProxy ? "NekoRoute" : null,
      country: station.forceProxy ? station.country ?? null : null,
      region: station.forceProxy ? station.region ?? null : null,
      networkType: station.forceProxy ? "residential-preferred-hosting-fallback" : null,
      protocol: station.forceProxy ? "auto" : null,
      supportedProtocols: station.forceProxy ? ["http", "https", "socks4", "socks5"] : [],
    },
    playback: {
      browser: directPlayable ? station.sourceUrl : `${base}.mp3`,
      direct: directPlayable ? station.sourceUrl : null,
      gameMp3: `${base}.mp3`,
      ogg: `${base}.ogg`,
      aac: `${base}.aac`,
    },
  };
}

function streamStation(app: FastifyInstance, station: RadioStation, format: OutputFormat, request: any, reply: any) {
  return (async () => {
    if (request.method === "HEAD") {
      reply
        .header("content-type", format.contentType)
        .header("cache-control", "no-store")
        .header("icy-name", station.name)
        .header("icy-genre", station.genre ?? "Radio")
        .header("icy-br", String(station.bitrateKbps))
        .header("x-openhaul-radio-route", station.forceProxy ? "residential-proxy" : "direct");
      return reply.code(200).send();
    }

    let inputUrl = station.sourceUrl;
    let proxyNode: Awaited<ReturnType<typeof createRegionalProxySession>>["node"] | null = null;
    let actualRoute = station.forceProxy ? "residential-proxy" : "direct";

    if (station.forceProxy) {
      try {
        const session = await createRegionalProxySession(station);
        proxyNode = session.node;
        inputUrl =
          `${session.base}/api/preview-runtime/${encodeURIComponent(session.sessionId)}` +
          `?kind=media&url=${encodeURIComponent(station.sourceUrl)}`;
        actualRoute = session.routeMode;
      } catch (error) {
        app.log.warn({ error, stationId: station.id }, "Unable to create residential or hosting radio route");

        if (!allowDirectProxyFallback() || !(await canReadAudioDirectly(station.sourceUrl))) {
          return reply.code(503).send({
            error: "radio_proxy_unavailable",
            stationId: station.id,
            message: error instanceof Error ? error.message : String(error),
            fallback: "Direct source was unavailable or direct fallback is disabled.",
          });
        }

        actualRoute = "direct-fallback";
        inputUrl = station.sourceUrl;
        app.log.warn(
          { stationId: station.id },
          "No healthy residential or hosting proxy matched; direct radio fallback is working and will be used",
        );
      }
    }

    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "warning", "-nostdin",
      ...fastRadioInputArgs(),
      "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_at_eof", "1", "-reconnect_delay_max", "2",
      "-i", inputUrl,
      "-vn", "-ac", "2", "-ar", "44100",
      ...format.ffmpegArgs(station.bitrateKbps),
      "-flush_packets", "1",
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

    ffmpeg.stderr.on("data", (chunk) => {
      const message = String(chunk).trim();
      if (message) app.log.debug({ message, stationId: station.id, format: format.extension }, "radio ffmpeg");
    });

    ffmpeg.once("error", (error) => {
      app.log.error({ error, stationId: station.id }, "Unable to start ffmpeg for radio station");
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { "content-type": "application/json" });
        reply.raw.end(JSON.stringify({ error: "ffmpeg_unavailable" }));
      } else if (!reply.raw.destroyed) reply.raw.destroy(error);
    });

    ffmpeg.once("spawn", () => {
      if (closed || reply.raw.destroyed) return stop();
      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": format.contentType,
        "cache-control": "no-store, no-cache, must-revalidate, no-transform",
          "x-accel-buffering": "no",
        "icy-name": station.name,
        "icy-genre": station.genre ?? "Radio",
        "icy-br": String(station.bitrateKbps),
        "x-openhaul-radio-route": actualRoute,
        "x-openhaul-radio-country": station.country ?? "",
        "x-openhaul-radio-region": station.region ?? "",
        "x-openhaul-radio-proxy-country": proxyNode?.country ?? "",
        "x-openhaul-radio-proxy-city": proxyNode?.city ?? "",
        "x-openhaul-radio-proxy-protocol": proxyNode?.protocol ?? "",
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
  })();
}

export async function registerRadioProxyRoutes(app: FastifyInstance) {
  const stations = stationRegistry(app);
  const geoRules = parseGeoRules(app);

  app.get("/api/v1/public/radio/directory", async (request, reply) => {
    const query = directoryQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.pageSize;

    const params = new URLSearchParams({
      hidebroken: "true",
      order: "votes",
      reverse: "true",
      offset: String(offset),
      limit: String(query.pageSize),
    });
    if (query.country !== "ALL") params.set("countrycode", query.country);
    if (query.q) params.set("name", query.q);
    if (query.tag) params.set("tag", query.tag);
    if (query.codec) params.set("codec", query.codec);

    const rows = await fetchRadioBrowser("/json/stations/search", params) as RadioBrowserStation[];
    const radioBrowserStations = rows
      .map((row) => radioBrowserToStation(row, geoRules))
      .filter((station): station is RadioStation => Boolean(station));

    const custom = query.page === 1
      ? [...stations.values()].filter((station) =>
          (query.country === "ALL" || station.country === query.country) &&
          (!query.q || station.name.toLowerCase().includes(query.q.toLowerCase())) &&
          (!query.tag || (station.genre ?? "").toLowerCase().includes(query.tag.toLowerCase())) &&
          (!query.codec || (station.codec ?? "").toLowerCase().includes(query.codec.toLowerCase()))
        )
      : [];

    reply.header("cache-control", "public, max-age=30, stale-if-error=300");
    return {
      country: query.country,
      page: query.page,
      pageSize: query.pageSize,
      hasNext: rows.length === query.pageSize,
      stations: [...custom, ...radioBrowserStations].map(stationPublicJson),
      directory: "Radio Browser",
    };
  });

  app.get("/api/v1/public/radio/countries", async (_request, reply) => {
    const rows = await fetchRadioBrowser("/json/countrycodes", new URLSearchParams({
      hidebroken: "true",
      order: "stationcount",
      reverse: "true",
    })) as Array<{ name?: string; stationcount?: number | string }>;

    reply.header("cache-control", "public, max-age=3600, stale-if-error=86400");
    return {
      countries: rows
        .map((row) => ({ code: String(row.name || "").toUpperCase(), count: Number(row.stationcount || 0) }))
        .filter((row) => /^[A-Z]{2}$/.test(row.code) && row.count > 0),
    };
  });

  app.get("/api/v1/public/radio/stations", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=30");
    return {
      count: stations.size,
      stations: [...stations.values()].map(stationPublicJson),
      note: "Configured/built-in stations. Use /api/v1/public/radio/directory for the worldwide directory.",
    };
  });

  app.get("/api/v1/public/radio/stations/:stationId", async (request, reply) => {
    const { stationId } = z.object({ stationId: z.string().min(1).max(64) }).parse(request.params);
    const station = stations.get(stationId.toLowerCase());
    if (!station) return reply.code(404).send({ error: "radio_station_not_found" });
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
      return streamStation(app, station, formats[params.format], request, reply);
    },
  });

  app.get("/api/v1/public/radio/browser/:stationUuid", async (request, reply) => {
    const { stationUuid } = z.object({ stationUuid: z.string().min(1).max(120) }).parse(request.params);
    const row = await resolveRadioBrowserStation(stationUuid);
    const station = row ? radioBrowserToStation(row, geoRules) : null;
    if (!station) return reply.code(404).send({ error: "radio_station_not_found" });
    return stationPublicJson(station);
  });

  app.route({
    method: ["GET", "HEAD"],
    url: "/api/v1/public/radio/browser/:stationUuid.:format",
    handler: async (request, reply) => {
      const params = z.object({
        stationUuid: z.string().min(1).max(120),
        format: z.enum(["mp3", "ogg", "aac"]),
      }).parse(request.params);
      const row = await resolveRadioBrowserStation(params.stationUuid);
      const station = row ? radioBrowserToStation(row, geoRules) : null;
      if (!station) return reply.code(404).send({ error: "radio_station_not_found" });
      return streamStation(app, station, formats[params.format], request, reply);
    },
  });

  // Compatibility aliases kept for the original CHSL URL.
  app.get("/api/v1/public/radio/canada/chsl", async (_request, reply) => {
    const station = stations.get("chsl");
    if (!station) return reply.code(404).send({ error: "radio_station_not_found" });
    return stationPublicJson(station);
  });
  for (const ext of ["mp3", "ogg", "aac"] as const) {
    app.get(`/api/v1/public/radio/canada/chsl.${ext}`, async (_request, reply) => {
      return reply.redirect(`${publicBase()}/api/v1/public/radio/stations/chsl.${ext}`);
    });
  }
}
