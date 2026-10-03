import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const gameSchema = z.enum(["ets2", "ats"]);

function mapDirectory() {
  return path.resolve(process.env.OPENHAUL_MAP_DATA_DIR ?? "./data-runtime/maps");
}

function mapPath(game: "ets2" | "ats") {
  return path.join(mapDirectory(), `${game}.pmtiles`);
}

async function assetInfo(game: "ets2" | "ats") {
  try {
    const file = await stat(mapPath(game));
    if (!file.isFile()) throw new Error("not a file");

    return {
      available: true,
      size: file.size,
      updatedAt: file.mtime.toISOString(),
      url: `/api/v1/public/map/${game}.pmtiles`,
    };
  } catch {
    return {
      available: false,
      size: 0,
      updatedAt: null,
      url: `/api/v1/public/map/${game}.pmtiles`,
    };
  }
}

function parseRange(value: string | undefined, size: number) {
  if (!value) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return null;

  const rawStart = match[1];
  const rawEnd = match[2];

  let start: number;
  let end: number;

  if (!rawStart && rawEnd) {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}

export async function registerMapAssetRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/map/assets", async () => ({
    ets2: await assetInfo("ets2"),
    ats: await assetInfo("ats"),
  }));

  app.head("/api/v1/public/map/:game.pmtiles", async (request, reply) => {
    const { game } = z.object({ game: gameSchema }).parse(request.params);
    const filePath = mapPath(game);

    try {
      const file = await stat(filePath);
      if (!file.isFile()) throw new Error("not a file");

      reply.headers({
        "accept-ranges": "bytes",
        "content-length": file.size,
        "content-type": "application/vnd.pmtiles",
        "cache-control": "public, max-age=300",
      });

      return reply.code(200).send();
    } catch {
      return reply.code(404).send();
    }
  });

  app.get("/api/v1/public/map/:game.pmtiles", async (request, reply) => {
    const { game } = z.object({ game: gameSchema }).parse(request.params);
    const filePath = mapPath(game);

    let file;
    try {
      file = await stat(filePath);
      if (!file.isFile()) throw new Error("not a file");
    } catch {
      return reply.code(404).send({ error: "map_asset_not_found", game });
    }

    const rangeHeader = Array.isArray(request.headers.range)
      ? request.headers.range[0]
      : request.headers.range;

    const range = parseRange(rangeHeader, file.size);

    if (rangeHeader && !range) {
      reply.header("content-range", `bytes */${file.size}`);
      return reply.code(416).send();
    }

    const headers: Record<string, string | number> = {
      "accept-ranges": "bytes",
      "content-type": "application/vnd.pmtiles",
      "cache-control": "public, max-age=300",
    };

    if (!range) {
      headers["content-length"] = file.size;
      reply.headers(headers);
      return reply.send(createReadStream(filePath));
    }

    headers["content-length"] = range.end - range.start + 1;
    headers["content-range"] = `bytes ${range.start}-${range.end}/${file.size}`;

    reply.headers(headers);
    return reply.code(206).send(
      createReadStream(filePath, {
        start: range.start,
        end: range.end,
      }),
    );
  });
}
