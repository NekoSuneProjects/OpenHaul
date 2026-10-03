import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import { syncMaps } from "../src/mapSync.js";
import { registerMapAssetRoutes } from "../src/mapAssets.js";

function archive(value = 1) {
  const bytes = Buffer.alloc(128, value);
  bytes.write("PMTiles");
  bytes[7] = 3;
  return bytes;
}
function manifest(bytes: Buffer) {
  return { version: 1, maps: { ets2: {
    url: "https://example.com/ets2.pmtiles", size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  } } };
}
async function temporary(t: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "openhaul-maps-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("downloads, skips unchanged archives, repairs changed local files and installs updates", async (t) => {
  const directory = await temporary(t);
  let bytes = archive();
  let downloads = 0;
  const fetcher = (async (url: string) => {
    if (url.endsWith("maps.json")) return Response.json(manifest(bytes));
    downloads++;
    return new Response(bytes);
  }) as typeof fetch;
  const options = { directory, manifestUrl: "https://example.com/maps.json", fetcher };
  assert.deepEqual(await syncMaps(options), ["ets2"]);
  assert.deepEqual(await readFile(path.join(directory, "ets2.pmtiles")), bytes);
  assert.deepEqual(await syncMaps(options), []);
  assert.equal(downloads, 1);
  await writeFile(path.join(directory, "ets2.pmtiles"), "damaged");
  assert.deepEqual(await syncMaps(options), ["ets2"]);
  bytes = archive(2);
  assert.deepEqual(await syncMaps(options), ["ets2"]);
  assert.deepEqual(await readFile(path.join(directory, "ets2.pmtiles")), bytes);
});

for (const failure of ["checksum", "truncated", "oversized", "header", "http"]) {
  test(`${failure} failure preserves installed map and removes temporary download`, async (t) => {
    const directory = await temporary(t);
    const old = archive();
    await writeFile(path.join(directory, "ets2.pmtiles"), old);
    const next = archive(2);
    if (failure === "header") next[0] = 0;
    const fetcher = (async (url: string) => {
      if (url.endsWith("maps.json")) return Response.json(manifest(next));
      if (failure === "http") return new Response("Unavailable", { status: 503 });
      const data = failure === "checksum" ? archive(3)
        : failure === "truncated" ? next.subarray(0, 64)
        : failure === "oversized" ? Buffer.concat([next, next]) : next;
      return new Response(data);
    }) as typeof fetch;
    await assert.rejects(syncMaps({ directory, manifestUrl: "https://example.com/maps.json", fetcher }));
    assert.deepEqual(await readFile(path.join(directory, "ets2.pmtiles")), old);
    assert.deepEqual(await readdir(directory), ["ets2.pmtiles"]);
  });
}

test("one failed game does not prevent the other game updating", async (t) => {
  const directory = await temporary(t);
  const bytes = archive();
  const data = manifest(bytes);
  const both = { ...data, maps: { ...data.maps, ats: { ...data.maps.ets2, url: "https://example.com/ats.pmtiles" } } };
  const errors: string[] = [];
  const fetcher = (async (url: string) => url.endsWith("maps.json") ? Response.json(both)
    : url.includes("ets2") ? new Response(null, { status: 503 }) : new Response(bytes)) as typeof fetch;
  assert.deepEqual(await syncMaps({ directory, manifestUrl: "https://example.com/maps.json", fetcher,
    onError: (game) => errors.push(game) }), ["ats"]);
  assert.deepEqual(errors, ["ets2"]);
});

test("unpublished manifest fails without changing installed maps", async (t) => {
  const directory = await temporary(t);
  await writeFile(path.join(directory, "ets2.pmtiles"), archive());
  await assert.rejects(syncMaps({ directory, manifestUrl: "https://example.com/maps.json",
    fetcher: (async () => new Response(null, { status: 404 })) as typeof fetch }), /HTTP 404/);
  assert.deepEqual(await readFile(path.join(directory, "ets2.pmtiles")), archive());
});

test("publisher stages a checksum manifest consumed by the downloader without publishing", async (t) => {
  const directory = await temporary(t);
  const source = path.join(directory, "fixture.pmtiles");
  const output = path.join(directory, "release");
  const bytes = archive();
  await writeFile(source, bytes);
  const result = execFileSync(process.execPath, [
    fileURLToPath(new URL("../../../tools/maps/publish-maps.mjs", import.meta.url)),
    "--ets2", source, "--ats", source, "--output", output, "--prepare-only",
  ], { encoding: "utf8" });
  assert.match(result, /Nothing published/);
  const data = JSON.parse(await readFile(path.join(output, "maps.json"), "utf8"));
  const fetcher = (async (url: string) => url.endsWith("maps.json") ? Response.json(data)
    : new Response(await readFile(path.join(output, path.basename(url))))) as typeof fetch;
  assert.deepEqual(await syncMaps({ directory: path.join(directory, "download"),
    manifestUrl: "https://example.com/maps.json", fetcher }), ["ets2", "ats"]);
});

test("cached maps remain available through metadata, HEAD and byte ranges", async (t) => {
  const directory = await temporary(t);
  const originalDirectory = process.env.OPENHAUL_MAP_DATA_DIR;
  const originalAuto = process.env.OPENHAUL_MAP_AUTO_UPDATE;
  process.env.OPENHAUL_MAP_DATA_DIR = directory;
  process.env.OPENHAUL_MAP_AUTO_UPDATE = "false";
  const app = Fastify();
  t.after(async () => {
    await app.close();
    if (originalDirectory === undefined) delete process.env.OPENHAUL_MAP_DATA_DIR;
    else process.env.OPENHAUL_MAP_DATA_DIR = originalDirectory;
    if (originalAuto === undefined) delete process.env.OPENHAUL_MAP_AUTO_UPDATE;
    else process.env.OPENHAUL_MAP_AUTO_UPDATE = originalAuto;
  });
  const bytes = archive();
  await writeFile(path.join(directory, "ets2.pmtiles"), bytes);
  await registerMapAssetRoutes(app);
  const metadata = (await app.inject("/api/v1/public/map/assets")).json();
  assert.equal(metadata.ets2.available, true);
  assert.equal(metadata.ats.available, false);
  const head = await app.inject({ method: "HEAD", url: "/api/v1/public/map/ets2.pmtiles" });
  assert.equal(head.statusCode, 200);
  assert.equal(head.headers["content-length"], "128");
  const range = await app.inject({ url: "/api/v1/public/map/ets2.pmtiles", headers: { range: "bytes=0-7" } });
  assert.equal(range.statusCode, 206);
  assert.deepEqual(range.rawPayload, bytes.subarray(0, 8));
  assert.equal((await app.inject({ url: "/api/v1/public/map/ets2.pmtiles", headers: { range: "bytes=999-" } })).statusCode, 416);
});
