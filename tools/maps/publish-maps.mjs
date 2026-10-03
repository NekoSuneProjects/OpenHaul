import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, open, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../../", import.meta.url));
function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function gh(args, allowFailure = false) {
  const result = spawnSync("gh", args, { encoding: "utf8", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(result.stderr || `gh exited with ${result.status}`);
  return result;
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log("Usage: npm run map:publish -- [--ets2 <file>] [--ats <file>] [--repo owner/repo] [--prepare-only]\nDefaults: data-runtime/maps/{ets2,ats}.pmtiles; NekoSuneProjects/OpenHaul. Both maps are required.\n--prepare-only validates and stages files without publishing to GitHub.");
    return;
  }
  const repository = argument("--repo", "NekoSuneProjects/OpenHaul");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("--repo must be owner/repository");
  const directory = path.resolve(argument("--output", path.join(root, "data-runtime", "map-release")));
  await mkdir(directory, { recursive: true });

  // Keep the local release staging directory aligned with the rolling GitHub release.
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (entry.name === "maps.json" || entry.name.endsWith(".pmtiles") || entry.name.endsWith(".staging")) {
      await rm(path.join(directory, entry.name), { force: true });
    }
  }

  const manifest = {
    version: 1,
    publishedAt: new Date().toISOString(),
    maps: {},
  };
  const files = [];
  for (const game of ["ets2", "ats"]) {
    const source = path.resolve(argument(`--${game}`, path.join(root, "data-runtime", "maps", `${game}.pmtiles`)));
    const info = await stat(source);
    if (!info.isFile() || info.size < 127 || info.size >= 2 ** 31) throw new Error(`${game}: expected a PMTiles archive under 2 GiB`);
    // Stage a snapshot so a simultaneous local rebuild cannot change the upload.
    const staged = path.join(directory, `${game}.staging`);
    await copyFile(source, staged);
    const handle = await open(staged, "r");
    try {
      const header = Buffer.alloc(8);
      await handle.read(header, 0, 8, 0);
      if (header.subarray(0, 7).toString() !== "PMTiles" || header[7] !== 3) throw new Error(`${game}: expected PMTiles v3`);
    } finally { await handle.close(); }
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(staged)) hash.update(chunk);
    const sha256 = hash.digest("hex");
    const name = `${game}-${sha256}.pmtiles`;
    const output = path.join(directory, name);
    await rename(staged, output);
    const size = (await stat(output)).size;
    manifest.maps[game] = {
      url: `https://github.com/${repository}/releases/download/map-data/${name}`,
      size, sha256,
    };
    files.push(output);
  }
  const manifestFile = path.join(directory, "maps.json");
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  if (process.argv.includes("--prepare-only")) {
    console.log(`Validated and staged current ETS2/ATS maps in ${directory}. Nothing published.`);
    return;
  }
  const existing = gh(["release", "view", "map-data", "--repo", repository, "--json", "assets"], true);
  let assets = [];
  if (existing.status === 0) {
    assets = JSON.parse(existing.stdout).assets ?? [];
  } else {
    gh([
      "release", "create", "map-data",
      "--repo", repository,
      "--draft",
      "--latest=false",
      "--title", "OpenHaul map data",
      "--notes", "Rolling maintainer-built ETS2 and ATS PMTiles. OpenHaul automatically checks maps.json for updates.",
    ]);
  }

  const currentAssetNames = new Set(files.map((file) => path.basename(file)));

  // Upload both current archives before publishing the manifest. Existing
  // clients therefore continue to have a valid old manifest until the new
  // archives are fully available.
  for (const file of files) {
    const name = path.basename(file);
    if (!assets.some((asset) => asset.name === name)) {
      gh(["release", "upload", "map-data", file, "--repo", repository]);
    }
  }

  // Publish the manifest last so it can only point at fully uploaded assets.
  gh(["release", "upload", "map-data", manifestFile, "--clobber", "--repo", repository]);
  gh(["release", "edit", "map-data", "--draft=false", "--latest=false", "--repo", repository]);

  // The map-data release is a rolling channel. Once the new manifest is live,
  // remove old content-addressed PMTiles that are no longer referenced.
  const refreshed = gh(["release", "view", "map-data", "--repo", repository, "--json", "assets"]);
  const refreshedAssets = JSON.parse(refreshed.stdout).assets ?? [];
  const removed = [];

  for (const asset of refreshedAssets) {
    const name = String(asset.name ?? "");
    if (!name.endsWith(".pmtiles") || currentAssetNames.has(name)) continue;

    gh([
      "release", "delete-asset", "map-data", name,
      "--repo", repository,
      "--yes",
    ]);
    removed.push(name);
  }

  console.log(`Published https://github.com/${repository}/releases/tag/map-data`);
  console.log(`Current map assets: ${[...currentAssetNames].join(", ")}`);
  if (removed.length) {
    console.log(`Removed ${removed.length} stale GitHub map asset(s): ${removed.join(", ")}`);
  } else {
    console.log("No stale GitHub map assets needed removal.");
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
