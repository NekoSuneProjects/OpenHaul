import { spawn } from "node:child_process";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const DEFAULT_RADIO_BROWSER_URL = "https://de1.api.radio-browser.info";
const DEFAULT_CHSL_SOURCE_URL =
  "https://stingray.leanstream.co/CHSLFM?args=web_01&aw_0_req.gdpr=true&gdpr=true";
const DEFAULT_INTERNET_RADIO_URL = "https://www.internet-radio.com";
const DEFAULT_XIPH_DIRECTORY_URL = "https://dir.xiph.org";
const DEFAULT_LAUTFM_API_URL = "https://api.laut.fm";
const directoryCache = new Map<string, { expiresAt: number; value: RadioStation[] }>();

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
  bitrateKbps: number;
  genre?: string;
  city?: string;
  language?: string;
  homepage?: string;
  favicon?: string;
  codec?: string;
  source: "builtin" | "configured" | "official" | "radio-browser" | "internet-radio" | "xiph" | "lautfm" | "shoutcast";
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

const configuredStationSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  name: z.string().min(1).max(120),
  sourceUrl: z.string().url().refine((value) => /^https?:\/\//i.test(value), "HTTP(S) URL required"),
  country: z.string().length(2).transform((value) => value.toUpperCase()).optional(),
  region: z.string().min(1).max(80).optional(),
  bitrateKbps: z.coerce.number().int().min(64).max(320).default(128),
  genre: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  language: z.string().max(80).optional(),
  homepage: z.string().url().optional(),
  favicon: z.string().url().optional(),
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

function normalizedStreamKey(value: string) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/+$/, "").toLowerCase();
    return `${url.hostname.toLowerCase()}${pathname}`;
  } catch {
    return value.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

export async function lookupRadioCountryByUrl(sourceUrl: string, app?: FastifyInstance) {
  const key = normalizedStreamKey(sourceUrl);

  // First use OpenHaul's known stations and any public-directory results that
  // have already been loaded into the short-lived directory cache.
  const known = [
    ...builtInStations(),
    ...officialProviderStations(),
    ...(app ? parseConfiguredStations(app) : []),
    ...[...directoryCache.values()].flatMap((entry) => entry.value),
  ];

  const cachedMatch = known.find((station) =>
    station.country && normalizedStreamKey(station.sourceUrl) === key
  );
  if (cachedMatch?.country) {
    return {
      country: cachedMatch.country.toUpperCase(),
      source: cachedMatch.source,
      stationId: cachedMatch.id,
      stationName: cachedMatch.name,
    };
  }

  // Radio Browser supports reverse lookup by stream URL. Try both the complete
  // imported URL and a query-free URL because .sii files often contain tracking
  // parameters that public directories omit.
  const candidates = new Set<string>([sourceUrl]);
  try {
    const parsed = new URL(sourceUrl);
    parsed.search = "";
    parsed.hash = "";
    candidates.add(parsed.toString());
  } catch {
    // Invalid URLs are handled by the scanner's normal URL validation.
  }

  for (const candidate of candidates) {
    try {
      const rows = await fetchRadioBrowser(
        "/json/stations/byurl",
        new URLSearchParams({ url: candidate }),
        7_000,
      ) as RadioBrowserStation[];

      const exact = rows.find((row) => {
        const rowUrl = String(row.url_resolved || row.url || "").trim();
        return Boolean(rowUrl) && normalizedStreamKey(rowUrl) === key;
      }) ?? rows.find((row) => Boolean(row.countrycode));

      if (exact?.countrycode) {
        return {
          country: String(exact.countrycode).toUpperCase(),
          source: "radio-browser" as const,
          stationId: exact.stationuuid ? `rb-${exact.stationuuid}` : null,
          stationName: exact.name ? String(exact.name) : null,
        };
      }
    } catch {
      // Directory matching is best-effort; provider rules/geo probing still run.
    }
  }

  return null;
}

function getRadioBrowserBase() {
  return cleanBaseUrl(process.env.RADIO_BROWSER_API_URL ?? DEFAULT_RADIO_BROWSER_URL);
}

function parseConfiguredStations(app: FastifyInstance): RadioStation[] {
  const raw = process.env.RADIO_PROXY_STATIONS_JSON?.trim();
  if (!raw || raw === "[]") return [];
  try {
    return z.array(configuredStationSchema).max(250).parse(JSON.parse(raw)).map((row) => ({
      ...row,
      source: "configured" as const,
    }));
  } catch (error) {
    app.log.error({ error }, "RADIO_PROXY_STATIONS_JSON is invalid; custom stations were ignored");
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
    bitrateKbps: Number.isFinite(bitrate) ? Math.max(64, Math.min(320, bitrate)) : 128,
    genre: "Classic Hits",
    city: "Slave Lake, Alberta",
    language: "EN",
    source: "builtin",
  }];
}

function officialProviderStations(): RadioStation[] {
  return [
    {
      id: "capital-uk",
      name: "Capital UK",
      sourceUrl: "https://media-ssl.musicradio.com/CapitalUK",
      country: "GB",
      bitrateKbps: 48,
      genre: "Pop, Contemporary Hits",
      city: "London",
      language: "EN",
      homepage: "https://www.capitalfm.com/",
      codec: "AAC",
      source: "official",
    },
    {
      id: "capital-dance",
      name: "Capital Dance",
      sourceUrl: "https://media-ssl.musicradio.com/CapitalDance",
      country: "GB",
      bitrateKbps: 48,
      genre: "Dance",
      city: "London",
      language: "EN",
      homepage: "https://www.capitaldance.com/",
      codec: "AAC",
      source: "official",
    },
  ];
}

function stationRegistry(app: FastifyInstance) {
  const byId = new Map<string, RadioStation>();
  for (const station of [...builtInStations(), ...officialProviderStations(), ...parseConfiguredStations(app)]) {
    byId.set(station.id.toLowerCase(), station);
  }
  return byId;
}

async function getRadioBrowserServers() {
  const configured = (process.env.RADIO_BROWSER_API_URLS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(cleanBaseUrl);

  if (configured.length) return configured;

  const primary = cleanBaseUrl(process.env.RADIO_BROWSER_API_URL ?? DEFAULT_RADIO_BROWSER_URL);
  try {
    const response = await fetch("https://all.api.radio-browser.info/json/servers", {
      signal: AbortSignal.timeout(5_000),
      headers: { accept: "application/json", "user-agent": "OpenHaul/1.2 (+https://github.com/NekoSuneProjects/OpenHaul)" },
    });
    if (!response.ok) return [primary];

    const rows = await response.json() as Array<{ name?: string }>;
    const discovered = rows
      .map((row) => String(row.name ?? "").trim())
      .filter(Boolean)
      .map((host) => `https://${host}`);
    return [...new Set([primary, ...discovered])].slice(0, 8);
  } catch {
    return [primary];
  }
}

async function fetchRadioBrowser(path: string, params: URLSearchParams, timeoutMs = 10_000) {
  const servers = await getRadioBrowserServers();
  let lastError: unknown = null;

  for (const base of servers) {
    try {
      const url = `${base}${path}?${params.toString()}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: "application/json",
          "user-agent": "OpenHaul/1.2 (+https://github.com/NekoSuneProjects/OpenHaul)",
        },
      });
      if (!response.ok) {
        lastError = new Error(`Radio Browser ${base} returned HTTP ${response.status}`);
        continue;
      }
      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All Radio Browser mirrors failed");
}

async function resolveRadioBrowserStation(stationUuid: string): Promise<RadioBrowserStation | null> {
  const data = await fetchRadioBrowser(
    `/json/stations/byuuid/${encodeURIComponent(stationUuid)}`,
    new URLSearchParams(),
  ) as RadioBrowserStation[];
  return data[0] ?? null;
}

function radioBrowserToStation(row: RadioBrowserStation): RadioStation | null {
  const stationUuid = String(row.stationuuid ?? "").trim();
  const sourceUrl = String(row.url_resolved || row.url || "").trim();
  if (!stationUuid || !/^https?:\/\//i.test(sourceUrl)) return null;

  const country = row.countrycode ? String(row.countrycode).toUpperCase() : undefined;
  const bitrate = Number(row.bitrate || 128);
  return {
    id: `rb-${stationUuid}`,
    stationUuid,
    name: String(row.name || "Unknown station").trim(),
    sourceUrl,
    country,
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

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, value) => String.fromCharCode(Number(value)));
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

async function resolvePlaylistUrl(value: string) {
  try {
    const response = await fetch(value, {
      signal: AbortSignal.timeout(7_000),
      headers: { "user-agent": "OpenHaul/1.2 (+https://github.com/NekoSuneProjects/OpenHaul)" },
    });
    if (!response.ok) return null;
    const text = await response.text();
    const candidates = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .map((line) => line.match(/^File\d+=(https?:\/\/.*)$/i)?.[1] ?? line)
      .filter((line) => /^https?:\/\//i.test(line));
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

async function withDirectoryCache(key: string, loader: () => Promise<RadioStation[]>) {
  const now = Date.now();
  const cached = directoryCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = await loader();
  directoryCache.set(key, { expiresAt: now + 5 * 60_000, value });
  return value;
}

async function fetchInternetRadioStations(query: string, country: string) {
  if (!query.trim()) return [];
  const base = cleanBaseUrl(process.env.INTERNET_RADIO_DIRECTORY_URL ?? DEFAULT_INTERNET_RADIO_URL);
  const cacheKey = `internet-radio:${country}:${query.toLowerCase()}`;

  return withDirectoryCache(cacheKey, async () => {
    const url = `${base}/search/?radio=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        accept: "text/html",
        "user-agent": "OpenHaul/1.2 (+https://github.com/NekoSuneProjects/OpenHaul)",
      },
    });
    if (!response.ok) return [];

    const html = await response.text();
    const blocks = [...html.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>([\s\S]*?)(?=<h4|$)/gi)].slice(0, 25);
    const results: Array<RadioStation | null> = await Promise.all(blocks.map(async (match, index): Promise<RadioStation | null> => {
      const name = stripHtml(match[1] ?? "");
      const body = match[2] ?? "";
      if (!name) return null;

      const hrefs = [...body.matchAll(/href=["']([^"']+)["']/gi)].map((row) => decodeHtml(row[1] ?? ""));
      const playlistHref = hrefs.find((href) => /(?:\.m3u|\.pls)(?:\?|$)/i.test(href) || /playlist/i.test(href));
      if (!playlistHref) return null;

      const playlistUrl = new URL(playlistHref, base).toString();
      const streamUrl = await resolvePlaylistUrl(playlistUrl);
      if (!streamUrl) return null;

      const genreMatch = body.match(/Genres?:\s*([^<]+)/i);
      return {
        id: `internet-radio-${index}-${Buffer.from(streamUrl).toString("base64url").slice(0, 20)}`,
        name,
        sourceUrl: streamUrl,
        country: country !== "ALL" ? country : undefined,
        bitrateKbps: 128,
        genre: genreMatch ? stripHtml(genreMatch[1]) : undefined,
        language: undefined,
        source: "internet-radio" as const,
      } satisfies RadioStation;
    }));

    return results.filter((station): station is RadioStation => station !== null);
  });
}

async function fetchXiphStations(query: string) {
  if (!query.trim()) return [];
  const base = cleanBaseUrl(process.env.XIPH_DIRECTORY_URL ?? DEFAULT_XIPH_DIRECTORY_URL);
  const cacheKey = `xiph:${query.toLowerCase()}`;

  return withDirectoryCache(cacheKey, async () => {
    const response = await fetch(`${base}/search?search=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "text/html", "user-agent": "OpenHaul/1.2 (+https://github.com/NekoSuneProjects/OpenHaul)" },
    });
    if (!response.ok) return [];

    const html = await response.text();
    const anchors = [...html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const stations: RadioStation[] = [];
    for (const [index, match] of anchors.entries()) {
      const sourceUrl = decodeHtml(match[1] ?? "");
      const name = stripHtml(match[2] ?? "");
      if (!name || !sourceUrl || !name.toLowerCase().includes(query.toLowerCase())) continue;
      stations.push({
        id: `xiph-${index}-${Buffer.from(sourceUrl).toString("base64url").slice(0, 20)}`,
        name,
        sourceUrl,
        bitrateKbps: 128,
        source: "xiph",
      });
      if (stations.length >= 25) break;
    }
    return stations;
  });
}

async function fetchLautFmStations(query: string) {
  if (!query.trim()) return [];
  const base = cleanBaseUrl(process.env.LAUTFM_API_URL ?? DEFAULT_LAUTFM_API_URL);
  const cacheKey = `lautfm:${query.toLowerCase()}`;

  return withDirectoryCache(cacheKey, async () => {
    try {
      const response = await fetch(`${base}/stations`, {
        signal: AbortSignal.timeout(10_000),
        headers: { accept: "application/json", "user-agent": "OpenHaul/1.2 (+https://github.com/NekoSuneProjects/OpenHaul)" },
      });
      if (!response.ok) return [];
      const payload = await response.json() as any;
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.stations) ? payload.stations : [];
      const results: Array<RadioStation | null> = rows
        .filter((row: any) => String(row?.name ?? "").toLowerCase().includes(query.toLowerCase()))
        .slice(0, 25)
        .map((row: any, index: number): RadioStation | null => {
          const name = String(row.name ?? "").trim();
          const streamUrl = String(row.stream_url ?? row.streamUrl ?? row.url ?? "").trim();
          if (!name || !/^https?:\/\//i.test(streamUrl)) return null;
          return {
            id: `lautfm-${index}-${String(row.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
            name,
            sourceUrl: streamUrl,
            country: "DE",
            bitrateKbps: Number(row.bitrate ?? 128) || 128,
            genre: Array.isArray(row.genres) ? row.genres.join(", ") : undefined,
            homepage: row.website ? String(row.website) : undefined,
            source: "lautfm" as const,
          } satisfies RadioStation;
        });
      return results.filter((station): station is RadioStation => station !== null);
    } catch {
      return [];
    }
  });
}

async function fetchShoutcastStations(query: string) {
  const apiKey = process.env.SHOUTCAST_API_KEY?.trim();
  if (!apiKey || !query.trim()) return [];

  const base = cleanBaseUrl(process.env.SHOUTCAST_API_URL ?? "https://api.shoutcast.com");
  const cacheKey = `shoutcast:${query.toLowerCase()}`;

  return withDirectoryCache(cacheKey, async () => {
    try {
      const params = new URLSearchParams({
        k: apiKey,
        search: query,
        f: "json",
      });

      // SHOUTcast's official directory API requires a developer/partner key.
      const response = await fetch(`${base}/station/advancedsearch?${params}`, {
        signal: AbortSignal.timeout(10_000),
        headers: {
          accept: "application/json",
          "user-agent": "OpenHaul/1.2 (+https://github.com/NekoSuneProjects/OpenHaul)",
        },
      });
      if (!response.ok) return [];

      const payload = await response.json() as any;
      const rows = Array.isArray(payload?.response?.data?.stationlist?.station)
        ? payload.response.data.stationlist.station
        : Array.isArray(payload?.stationlist?.station)
          ? payload.stationlist.station
          : Array.isArray(payload?.station)
            ? payload.station
            : [];

      const results: Array<RadioStation | null> = await Promise.all(rows.slice(0, 50).map(async (row: any, index: number): Promise<RadioStation | null> => {
        const id = String(row?.id ?? "").trim();
        const name = String(row?.name ?? "").trim();
        if (!id || !name) return null;

        const playlistUrl = `https://yp.shoutcast.com/sbin/tunein-station.pls?id=${encodeURIComponent(id)}`;
        const sourceUrl = await resolvePlaylistUrl(playlistUrl);
        if (!sourceUrl) return null;

        const bitrate = Number(row?.br ?? row?.bitrate ?? 128);
        return {
          id: `shoutcast-${id || index}`,
          name,
          sourceUrl,
          bitrateKbps: Number.isFinite(bitrate) && bitrate > 0 ? Math.max(32, Math.min(320, bitrate)) : 128,
          genre: String(row?.genre ?? "").trim() || undefined,
          codec: String(row?.mt ?? row?.mime ?? "").toUpperCase() || undefined,
          source: "shoutcast" as const,
        } satisfies RadioStation;
      }));

      return results.filter((station): station is RadioStation => station !== null);
    } catch {
      return [];
    }
  });
}

function dedupeStations(stations: RadioStation[]) {
  const seen = new Set<string>();
  return stations.filter((station) => {
    const key = `${station.sourceUrl.toLowerCase()}|${station.name.toLowerCase()}|${station.country ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const ephemeralDirectorySource = ["internet-radio", "xiph", "lautfm", "shoutcast"].includes(station.source);
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
    playback: {
      browser: station.sourceUrl,
      direct: station.sourceUrl,
      gameMp3: ephemeralDirectorySource ? station.sourceUrl : `${base}.mp3`,
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
        .header("x-openhaul-radio-route", "direct");
      return reply.code(200).send();
    }

    const inputUrl = station.sourceUrl;

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
        "x-openhaul-radio-route": "direct",
        "x-openhaul-radio-country": station.country ?? "",
        "x-openhaul-radio-region": station.region ?? "",
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
      .map((row) => radioBrowserToStation(row))
      .filter((station): station is RadioStation => Boolean(station));

    const extraSources = query.page === 1 && query.q
      ? (await Promise.all([
          fetchInternetRadioStations(query.q, query.country),
          fetchXiphStations(query.q),
          fetchLautFmStations(query.q),
          fetchShoutcastStations(query.q),
        ])).flat()
      : [];

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
      stations: dedupeStations([...custom, ...radioBrowserStations, ...extraSources]).map(stationPublicJson),
      directory: "OpenHaul multi-source directory",
      sources: [
        "OpenHaul official/curated providers",
        "Radio Browser",
        "Internet-Radio.com",
        "Xiph/Icecast",
        "laut.fm",
        ...(process.env.SHOUTCAST_API_KEY ? ["SHOUTcast Directory API"] : [])
      ],
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
    const station = row ? radioBrowserToStation(row) : null;
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
      const station = row ? radioBrowserToStation(row) : null;
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
