import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Transform, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

export const defaultManifestUrl = "https://github.com/NekoSuneProjects/OpenHaul/releases/download/map-data/maps.json";
export function mapDirectory() {
  return process.env.OPENHAUL_MAP_DATA_DIR
    ? path.resolve(process.env.OPENHAUL_MAP_DATA_DIR)
    : fileURLToPath(new URL("../../../data-runtime/maps", import.meta.url));
}

const assetSchema = z.object({
  url: z.string().url().refine((value) => new URL(value).protocol === "https:"),
  size: z.number().int().min(127).max(2 ** 31 - 1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const manifestSchema = z.object({
  version: z.literal(1),
  maps: z.object({ ets2: assetSchema.optional(), ats: assetSchema.optional() }),
});

export async function syncMaps(options: {
  directory: string;
  manifestUrl: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  onError?: (game: string, error: unknown) => void;
}) {
  const fetcher = options.fetcher ?? fetch;
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(60 * 60 * 1000)])
    : AbortSignal.timeout(60 * 60 * 1000);
  const response = await fetcher(options.manifestUrl, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Map manifest download failed: HTTP ${response.status}`);
  const manifest = manifestSchema.parse(await response.json());
  await mkdir(options.directory, { recursive: true });
  const updated: string[] = [];
  for (const game of ["ets2", "ats"] as const) {
    const asset = manifest.maps[game];
    if (!asset) continue;
    const destination = path.join(options.directory, `${game}.pmtiles`);
    const temporary = `${destination}.${randomUUID()}.download`;
    const receipt = `${destination}.sha256`;
    try {
      // Only trust the receipt when the local file has not changed since verification.
      const local = await stat(destination).catch(() => null);
      const expectedReceipt = `${asset.sha256}:${local?.size}:${local?.mtimeMs}`;
      if (local?.size === asset.size && await readFile(receipt, "utf8").catch(() => "") === expectedReceipt) continue;
      if (local?.size === asset.size) {
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(destination)) hash.update(chunk);
        if (hash.digest("hex") === asset.sha256) {
          await writeFile(receipt, expectedReceipt);
          continue;
        }
      }
      const download = await fetcher(asset.url, { signal });
      if (!download.ok || !download.body) throw new Error(`Map download failed: HTTP ${download.status}`);
      let size = 0;
      const hash = createHash("sha256");
      const verify = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          size += chunk.length;
          if (size > asset.size) return callback(new Error("Map exceeds manifest size"));
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(download.body as Parameters<typeof Readable.fromWeb>[0]), verify,
        createWriteStream(temporary, { flags: "wx" }), { signal });
      if (size !== asset.size || hash.digest("hex") !== asset.sha256) throw new Error("Map checksum or size mismatch");
      const handle = await open(temporary, "r");
      try {
        const header = Buffer.alloc(8);
        await handle.read(header, 0, 8, 0);
        if (header.subarray(0, 7).toString() !== "PMTiles" || header[7] !== 3) throw new Error("Expected PMTiles v3 archive");
      } finally { await handle.close(); }
      // Same-directory rename keeps the last good map available until verification succeeds.
      await rename(temporary, destination);
      const installed = await stat(destination);
      await writeFile(receipt, `${asset.sha256}:${installed.size}:${installed.mtimeMs}`);
      updated.push(game);
    } catch (error) {
      if (!options.onError) throw error;
      options.onError(game, error);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return updated;
}

export function startMapSync(app: FastifyInstance) {
  if (process.env.OPENHAUL_MAP_AUTO_UPDATE === "false") return;
  const manifestUrl = process.env.OPENHAUL_MAP_MANIFEST_URL || defaultManifestUrl;
  const configuredHours = Number(process.env.OPENHAUL_MAP_UPDATE_HOURS ?? 6);
  const hours = Number.isFinite(configuredHours) && configuredHours >= 1 && configuredHours <= 168 ? configuredHours : 6;
  const controller = new AbortController();
  let running: Promise<void> | undefined;
  const run = () => {
    if (running) return;
    running = syncMaps({ directory: mapDirectory(), manifestUrl, signal: controller.signal,
      onError: (game, err) => app.log.warn({ err, game }, "Map update failed; retaining installed map"),
    }).then((updated) => {
      if (updated.length) app.log.info({ games: updated }, "Installed published map updates");
    }).catch((err) => app.log.warn({ err }, "Map update unavailable; retaining installed maps"))
      .finally(() => { running = undefined; });
  };
  const timer = setInterval(run, hours * 60 * 60 * 1000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    controller.abort();
    await running;
  });
  run();
}
