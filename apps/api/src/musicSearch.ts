import type { FastifyInstance } from "fastify";
import { z } from "zod";

type MusicSearchResult = {
  id: string;
  provider: "youtube" | "soundcloud";
  title: string;
  artist?: string;
  url: string;
};

const cache = new Map<string, { expiresAt: number; value: MusicSearchResult[] }>();

const querySchema = z.object({
  q: z.string().min(2).max(160),
  limit: z.coerce.number().int().min(1).max(30).default(12),
});

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

export async function registerMusicSearchRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/music/search", async (request, reply) => {
    const { q, limit } = querySchema.parse(request.query);
    const key = q.trim().toLowerCase() + ":" + limit;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      reply.header("cache-control", "public, max-age=120");
      return { query: q, count: cached.value.length, results: cached.value };
    }

    const perProvider = Math.max(3, Math.ceil(limit / 2));
    const [youtube, soundcloud] = await Promise.allSettled([
      searchYouTube(q, perProvider),
      searchSoundCloud(q, perProvider),
    ]);

    const merged = [
      ...(youtube.status === "fulfilled" ? youtube.value : []),
      ...(soundcloud.status === "fulfilled" ? soundcloud.value : []),
    ].slice(0, limit);

    cache.set(key, { expiresAt: Date.now() + 5 * 60_000, value: merged });
    reply.header("cache-control", "public, max-age=120, stale-if-error=600");

    return {
      query: q,
      count: merged.length,
      providers: {
        youtube: youtube.status === "fulfilled",
        soundcloud: soundcloud.status === "fulfilled",
      },
      results: merged,
    };
  });
}
