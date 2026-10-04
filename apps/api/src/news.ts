import type { FastifyInstance } from "fastify";

const releasesUrl =
  "https://api.github.com/repos/NekoSuneProjects/OpenHaul/releases?per_page=8";

const scsFeedUrl = process.env.SCS_NEWS_FEED_URL ?? "https://blog.scssoft.com/feeds/posts/default?alt=rss";
const truckersMpFeedUrl = process.env.TRUCKERSMP_NEWS_FEED_URL ?? "https://truckersmp.com/rss/news";

function decodeEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value: string) {
  return decodeEntities(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function rssItems(xml: string, source: string, sourceUrl: string) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0, 8).map((match, index) => {
    const item = match[0];
    const pick = (name: string) => {
      const found = item.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)<\\/" + name + ">", "i"));
      return found ? decodeEntities(found[1]).trim() : "";
    };
    return {
      id: source.toLowerCase().replace(/\W+/g, "-") + "-" + index + "-" + pick("guid"),
      source,
      title: stripTags(pick("title")) || source + " update",
      body: excerpt(stripTags(pick("description"))),
      publishedAt: pick("pubDate") || null,
      url: stripTags(pick("link")) || sourceUrl,
    };
  });
}

async function fetchExternalFeed(url: string, source: string, sourceUrl: string) {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "OpenHaul/1.0 (+https://github.com/NekoSuneProjects/OpenHaul)" },
      cache: "no-store",
    });
    if (!response.ok) return [];
    return rssItems(await response.text(), source, sourceUrl);
  } catch {
    return [];
  }
}

let cache:
  | {
      expiresAt: number;
      value: {
        source: string;
        fetchedAt: string;
        items: Array<{
          id: number;
          title: string;
          tag: string;
          body: string;
          publishedAt: string | null;
          url: string;
        }>;
      };
    }
  | null = null;

function excerpt(value: unknown) {
  const text = String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[#>*_`~-]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length <= 360) return text;
  return text.slice(0, 357).trimEnd() + "…";
}

export async function registerNewsRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/news", async (_request, reply) => {
    if (cache && cache.expiresAt > Date.now()) {
      reply.header("cache-control", "public, max-age=120");
      return cache.value;
    }

    const response = await fetch(releasesUrl, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "OpenHaul/1.0 (+https://github.com/NekoSuneProjects/OpenHaul)",
      },
    });

    if (!response.ok) {
      if (cache) return cache.value;
      return reply.code(502).send({ error: "openhaul_news_unavailable" });
    }

    const releases = (await response.json()) as Array<Record<string, unknown>>;
    const items = releases
      .filter((release) => !release.draft)
      .map((release) => ({
        id: Number(release.id ?? 0),
        title: String(release.name ?? release.tag_name ?? "OpenHaul update"),
        tag: String(release.tag_name ?? ""),
        body: excerpt(release.body),
        publishedAt:
          typeof release.published_at === "string" ? release.published_at : null,
        url: String(release.html_url ?? "https://github.com/NekoSuneProjects/OpenHaul/releases"),
      }))
      .slice(0, 6);

    const value = {
      source: "GitHub Releases",
      fetchedAt: new Date().toISOString(),
      items,
    };

    cache = {
      expiresAt: Date.now() + 5 * 60 * 1000,
      value,
    };

    reply.header("cache-control", "public, max-age=120");
    return value;
  });

  app.get("/api/v1/public/news/external", async (_request, reply) => {
    const [scs, truckersmp] = await Promise.all([
      fetchExternalFeed(scsFeedUrl, "SCS Software", "https://blog.scssoft.com/"),
      fetchExternalFeed(truckersMpFeedUrl, "TruckersMP", "https://truckersmp.com/blog"),
    ]);
    reply.header("cache-control", "public, max-age=300");
    return {
      fetchedAt: new Date().toISOString(),
      sources: [
        { name: "SCS Software", url: "https://blog.scssoft.com/", items: scs },
        { name: "TruckersMP", url: "https://truckersmp.com/blog", items: truckersmp },
      ],
    };
  });
}
