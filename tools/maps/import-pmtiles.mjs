import { mkdir, open, copyFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const game = argument("--game");
const source = argument("--file");
const outputRoot = argument("--output") ?? process.env.OPENHAUL_MAP_DATA_DIR ?? "./data-runtime/maps";

if (game !== "ets2" && game !== "ats") {
  console.error("Usage: npm run map:import -- --game ets2|ats --file <map.pmtiles> [--output ./data-runtime/maps]");
  process.exit(2);
}

if (!source) {
  console.error("--file is required.");
  process.exit(2);
}

const sourcePath = path.resolve(source);
const destinationDirectory = path.resolve(outputRoot);
const destinationPath = path.join(destinationDirectory, `${game}.pmtiles`);

const handle = await open(sourcePath, "r");
try {
  const magic = Buffer.alloc(7);
  const { bytesRead } = await handle.read(magic, 0, magic.length, 0);
  if (bytesRead !== 7 || magic.toString("ascii") !== "PMTiles") {
    throw new Error("The input file is not a PMTiles archive.");
  }
} finally {
  await handle.close();
}

await mkdir(destinationDirectory, { recursive: true });

const temporaryPath = destinationPath + ".updating";
await rm(temporaryPath, { force: true });
await copyFile(sourcePath, temporaryPath);

const temporaryInfo = await stat(temporaryPath);
if (!temporaryInfo.isFile() || temporaryInfo.size <= 7) {
  await rm(temporaryPath, { force: true });
  throw new Error("Copied PMTiles update is invalid.");
}

const temporaryHandle = await open(temporaryPath, "r");
try {
  const magic = Buffer.alloc(7);
  const { bytesRead } = await temporaryHandle.read(magic, 0, magic.length, 0);
  if (bytesRead !== 7 || magic.toString("ascii") !== "PMTiles") {
    throw new Error("Copied PMTiles update failed validation.");
  }
} finally {
  await temporaryHandle.close();
}

await rm(destinationPath, { force: true });
await rename(temporaryPath, destinationPath);

const info = await stat(destinationPath);
console.log(`Imported ${game.toUpperCase()} map: ${destinationPath}`);
console.log(`Size: ${(info.size / 1024 / 1024).toFixed(1)} MiB`);
