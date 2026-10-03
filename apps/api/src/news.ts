import type { FastifyInstance } from "fastify";

const releasesUrl =
  "https://api.github.com/repos/NekoSuneProjects/OpenHaul/releases?per_page=8";

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
}
