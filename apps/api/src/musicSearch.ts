import type { FastifyInstance } from "fastify";
import { z } from "zod";

type MusicSearchResult = {
  id: string;
  provider: "youtube" | "soundcloud" | "bilibili" | "yandex";
  title: string;
  artist?: string;
  url: string;
};

const cache = new Map<string, { expiresAt: number; value: MusicSearchResult[] }>();
const regionCache = new Map<string, { expiresAt: number; countryCode: string }>();
const inFlightSearches = new Map<string, Promise<MusicSearchResult[]>>();
const providerCooldownUntil = new Map<MusicSearchResult["provider"], number>();

const querySchema = z.object({
  q: z.string().min(2).max(160),
  limit: z.coerce.number().int().min(1).max(30).default(12),
  country: z.string().length(2).transform((value) => value.toUpperCase()).optional(),
});

const CIS_COUNTRIES = new Set(["RU", "BY", "KZ", "KG", "AM", "AZ", "UZ", "TJ", "MD"]);

function providerPriority(countryCode: string) {
  if (countryCode === "CN") return ["bilibili", "yandex", "youtube", "soundcloud"] as const;
  if (CIS_COUNTRIES.has(countryCode)) return ["yandex", "youtube", "soundcloud", "bilibili"] as const;
  return ["youtube", "soundcloud", "yandex", "bilibili"] as const;
}

function headerCountry(request: any) {
  const candidates = [
    request.headers["cf-ipcountry"],
    request.headers["x-vercel-ip-country"],
    request.headers["x-country-code"],
    request.headers["x-geo-country"],
  ];
  for (const value of candidates) {
    const code = Array.isArray(value) ? value[0] : value;
    if (typeof code === "string" && /^[A-Za-z]{2}$/.test(code)) return code.toUpperCase();
  }
  return "";
}

function clientIp(request: any) {
  const forwarded = request.headers["cf-connecting-ip"]
    ?? request.headers["x-real-ip"]
    ?? request.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = typeof raw === "string" ? raw.split(",")[0].trim() : request.ip;
  return String(first ?? "").replace(/^::ffff:/, "");
}

function isPublicIpCandidate(value: string) {
  if (!value || value === "::1" || value === "127.0.0.1") return false;
  if (/^10\./.test(value) || /^192\.168\./.test(value) || /^169\.254\./.test(value)) return false;
  const match172 = value.match(/^172\.(\d+)\./);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return false;
  return true;
}

async function resolveCountryCode(request: any) {
  const fromHeader = headerCountry(request);
  if (fromHeader) return { countryCode: fromHeader, source: "edge-header" as const };

  const ip = clientIp(request);
  if (!isPublicIpCandidate(ip)) return { countryCode: "ZZ", source: "unknown" as const };

  const cached = regionCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    return { countryCode: cached.countryCode, source: "ip-cache" as const };
  }

  try {
    const response = await fetch(
      "https://ipwho.is/" + encodeURIComponent(ip) + "?fields=success,country_code",
      { signal: AbortSignal.timeout(3500), headers: { accept: "application/json" } },
    );
    if (!response.ok) throw new Error("region lookup failed");
    const data = await response.json() as { success?: boolean; country_code?: string };
    const code = typeof data.country_code === "string" && /^[A-Za-z]{2}$/.test(data.country_code)
      ? data.country_code.toUpperCase()
      : "ZZ";
    regionCache.set(ip, { countryCode: code, expiresAt: Date.now() + 60 * 60_000 });
    return { countryCode: code, source: "ip-country" as const };
  } catch {
    return { countryCode: "ZZ", source: "unknown" as const };
  }
}

class ProviderRateLimitedError extends Error {
  constructor(public provider: MusicSearchResult["provider"], public retryAfterMs: number) {
    super(provider + " rate limited");
  }
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return 5 * 60_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(15_000, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(15_000, date - Date.now()) : 5 * 60_000;
}

function noteProviderResponse(provider: MusicSearchResult["provider"], response: Response) {
  if (response.status === 429) {
    const until = Date.now() + retryAfterMs(response);
    providerCooldownUntil.set(provider, until);
    throw new ProviderRateLimitedError(provider, until - Date.now());
  }
}

function providerCoolingDown(provider: MusicSearchResult["provider"]) {
  return (providerCooldownUntil.get(provider) ?? 0) > Date.now();
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/\\\//g, "/");
}

async function searchYouTube(query: string, limit: number): Promise<MusicSearchResult[]> {
  const response = await fetch("https://www.youtube.com/results?search_query=" + encodeURIComponent(query), {
    signal: AbortSignal.timeout(10_000),
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-GB,en;q=0.8",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    },
  });
  noteProviderResponse("youtube", response);
  if (!response.ok) return [];

  const html = await response.text();
  const results: MusicSearchResult[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{6,20})"([\s\S]{0,2400}?)(?="videoRenderer"|$)/g)) {
    const videoId = match[1];
    if (!videoId || seen.has(videoId)) continue;
    const block = match[2] ?? "";

    const titleMatch = block.match(/"title":\{"runs":\[\{"text":"([^"]+)"/)
      ?? block.match(/"title":\{"simpleText":"([^"]+)"/);
    if (!titleMatch?.[1]) continue;

    const ownerMatch = block.match(/"ownerText":\{"runs":\[\{"text":"([^"]+)"/)
      ?? block.match(/"shortBylineText":\{"runs":\[\{"text":"([^"]+)"/);

    seen.add(videoId);
    results.push({
      id: "youtube-" + videoId,
      provider: "youtube",
      title: decodeHtml(titleMatch[1]),
      artist: ownerMatch?.[1] ? decodeHtml(ownerMatch[1]) : undefined,
      url: "https://www.youtube.com/watch?v=" + videoId,
    });
    if (results.length >= limit) break;
  }

  return results;
}

async function searchSoundCloud(query: string, limit: number): Promise<MusicSearchResult[]> {
  const response = await fetch("https://soundcloud.com/search/sounds?q=" + encodeURIComponent(query), {
    signal: AbortSignal.timeout(10_000),
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-GB,en;q=0.8",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    },
  });
  noteProviderResponse("soundcloud", response);
  if (!response.ok) return [];

  const html = decodeHtml(await response.text());
  const results: MusicSearchResult[] = [];
  const seen = new Set<string>();

  const candidates = [
    ...html.matchAll(/https:\/\/soundcloud\.com\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)(?=["'?#<\\])/g),
    ...html.matchAll(/"permalink_url":"(https:\/\/soundcloud\.com\/[^"]+)"/g),
  ];

  for (const match of candidates) {
    const rawUrl = match[0].startsWith("http") ? match[0] : match[1];
    if (!rawUrl) continue;

    const clean = rawUrl
      .replace(/["'<].*$/, "")
      .replace(/[?#].*$/, "")
      .replace(/\/$/, "");

    let parsed: URL;
    try {
      parsed = new URL(clean);
    } catch {
      continue;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) continue;
    if (["discover", "search", "you", "stream", "upload"].includes(parts[0].toLowerCase())) continue;

    const key = parsed.toString().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const artist = parts[0].replace(/[-_]+/g, " ");
    const title = parts[1].replace(/[-_]+/g, " ");

    results.push({
      id: "soundcloud-" + Buffer.from(key).toString("base64url").slice(0, 24),
      provider: "soundcloud",
      title,
      artist,
      url: parsed.toString(),
    });
    if (results.length >= limit) break;
  }

  return results;
}

async function searchBilibili(query: string, limit: number): Promise<MusicSearchResult[]> {
  const response = await fetch("https://search.bilibili.com/all?keyword=" + encodeURIComponent(query), {
    signal: AbortSignal.timeout(10_000),
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    },
  });
  noteProviderResponse("bilibili", response);
  if (!response.ok) return [];

  const html = decodeHtml(await response.text());
  const results: MusicSearchResult[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/(?:https?:\/\/www\.bilibili\.com)?\/video\/(BV[A-Za-z0-9]+)/g)) {
    const bvid = match[1];
    if (!bvid || seen.has(bvid)) continue;
    seen.add(bvid);

    const around = html.slice(Math.max(0, (match.index ?? 0) - 800), (match.index ?? 0) + 1800);
    const titleMatch = around.match(/title=["']([^"']+)["']/i)
      ?? around.match(/<h3[^>]*>([^<]+)<\/h3>/i);
    const authorMatch = around.match(/(?:author|up-name|bili-video-card__info--author)[^>]*>([^<]+)</i);

    results.push({
      id: "bilibili-" + bvid,
      provider: "bilibili",
      title: titleMatch?.[1] ? decodeHtml(titleMatch[1]).replace(/<[^>]+>/g, "").trim() : bvid,
      artist: authorMatch?.[1] ? decodeHtml(authorMatch[1]).replace(/<[^>]+>/g, "").trim() : undefined,
      url: "https://www.bilibili.com/video/" + bvid + "/",
    });
    if (results.length >= limit) break;
  }

  return results;
}

async function searchYandexMusic(query: string, limit: number): Promise<MusicSearchResult[]> {
  const response = await fetch("https://music.yandex.ru/search?text=" + encodeURIComponent(query), {
    signal: AbortSignal.timeout(10_000),
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "ru,en;q=0.8",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    },
  });
  noteProviderResponse("yandex", response);
  if (!response.ok) return [];

  const html = decodeHtml(await response.text());
  const results: MusicSearchResult[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/\/album\/(\d+)\/track\/(\d+)/g)) {
    const albumId = match[1];
    const trackId = match[2];
    if (!albumId || !trackId) continue;
    const key = albumId + ":" + trackId;
    if (seen.has(key)) continue;
    seen.add(key);

    const around = html.slice(Math.max(0, (match.index ?? 0) - 1200), (match.index ?? 0) + 1800);
    const titleMatch = around.match(/(?:title|aria-label)=["']([^"']+)["']/i);
    const artistMatch = around.match(/(?:artist|artists)[^>]*>([^<]+)</i);

    results.push({
      id: "yandex-" + trackId,
      provider: "yandex",
      title: titleMatch?.[1] ? decodeHtml(titleMatch[1]).replace(/<[^>]+>/g, "").trim() : "Yandex Music track " + trackId,
      artist: artistMatch?.[1] ? decodeHtml(artistMatch[1]).replace(/<[^>]+>/g, "").trim() : undefined,
      url: "https://music.yandex.ru/album/" + albumId + "/track/" + trackId,
    });
    if (results.length >= limit) break;
  }

  return results;
}

export async function registerMusicSearchRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/region", async (request, reply) => {
    const region = await resolveCountryCode(request);
    const priority = providerPriority(region.countryCode);

    reply.header("cache-control", "private, max-age=300");
    return {
      countryCode: region.countryCode,
      source: region.source,
      musicProviderPriority: priority,
    };
  });
  app.get("/api/v1/public/music/search", async (request, reply) => {
    const { q, limit, country } = querySchema.parse(request.query);
    const detected = country ? { countryCode: country, source: "query" as const } : await resolveCountryCode(request);
    const countryCode = detected.countryCode;
    const key = q.trim().toLowerCase() + ":" + limit + ":" + countryCode;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      reply.header("cache-control", "public, max-age=120");
      return { query: q, count: cached.value.length, results: cached.value };
    }

    const priority = providerPriority(countryCode);
    const perProvider = Math.max(4, Math.ceil(limit / 2));

    const runSearch = async () => {
      const providerResults: Record<MusicSearchResult["provider"], MusicSearchResult[]> = {
        youtube: [],
        soundcloud: [],
        bilibili: [],
        yandex: [],
      };

      const searchers: Record<MusicSearchResult["provider"], () => Promise<MusicSearchResult[]>> = {
        youtube: () => searchYouTube(q, perProvider),
        soundcloud: () => searchSoundCloud(q, perProvider),
        bilibili: () => searchBilibili(q, perProvider),
        yandex: () => searchYandexMusic(q, perProvider),
      };

      // Search preferred providers first instead of hammering all four sites at once.
      // Continue to fallbacks only when there are not enough results.
      for (const provider of priority) {
        if (providerCoolingDown(provider)) continue;

        try {
          providerResults[provider] = await searchers[provider]();
        } catch (error) {
          if (!(error instanceof ProviderRateLimitedError)) {
            app.log.warn({ provider, error }, "Music search provider failed");
          }
        }

        const total = priority.reduce((sum, name) => sum + providerResults[name].length, 0);
        if (total >= limit) break;
      }

      return priority.flatMap((provider) => providerResults[provider]).slice(0, limit);
    };

    let pending = inFlightSearches.get(key);
    if (!pending) {
      pending = runSearch().finally(() => inFlightSearches.delete(key));
      inFlightSearches.set(key, pending);
    }

    const merged = await pending;
    cache.set(key, { expiresAt: Date.now() + 10 * 60_000, value: merged });
    reply.header("cache-control", "public, max-age=120, stale-if-error=600");

    return {
      query: q,
      countryCode,
      regionSource: detected.source,
      providerPriority: priority,
      count: merged.length,
      providers: Object.fromEntries(
        priority.map((provider) => [provider, {
          available: !providerCoolingDown(provider),
          cooldownUntil: providerCooldownUntil.get(provider) ?? null,
        }]),
      ),
      results: merged,
    };
  });
}
