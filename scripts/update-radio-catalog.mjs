import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const mirrors = [
  "https://de1.api.radio-browser.info/",
  "https://de2.api.radio-browser.info/",
  "https://nl1.api.radio-browser.info/",
];

const outputDir = process.env.RADIO_OUTPUT_DIR
  ? path.resolve(process.env.RADIO_OUTPUT_DIR)
  : path.resolve("radio-catalog-data");

const discoveryConcurrency = Math.max(1, Math.min(12, Number(process.env.RADIO_FETCH_CONCURRENCY || 6)));
const probeConcurrency = Math.max(1, Math.min(64, Number(process.env.RADIO_PROBE_CONCURRENCY || 24)));
const requestTimeoutMs = Math.max(5000, Math.min(60000, Number(process.env.RADIO_REQUEST_TIMEOUT_MS || 20000)));
const probeTimeoutMs = Math.max(3000, Math.min(30000, Number(process.env.RADIO_PROBE_TIMEOUT_MS || 8000)));

function queryPaths(country) {
  const upper = country.toUpperCase();
  const lower = country.toLowerCase();
  return [
    `/json/stations/search?countrycode=${encodeURIComponent(upper)}&hidebroken=false&order=name&reverse=false&limit=100000`,
    `/json/stations/search?countrycode=${encodeURIComponent(lower)}&hidebroken=false&order=name&reverse=false&limit=100000`,
    `/json/stations/bycountrycodeexact/${encodeURIComponent(lower)}?hidebroken=false&order=name&reverse=false&limit=100000`,
    `/json/stations/bycountrycodeexact/${encodeURIComponent(upper)}?hidebroken=false&order=name&reverse=false&limit=100000`,
  ];
}

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      accept: "application/json",
      "user-agent": "OpenHaul-RadioCatalog/2.0 (+https://github.com/NekoSuneProjects/OpenHaul)",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function discoverCountries() {
  const configured = String(process.env.RADIO_COUNTRIES || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value));

  if (configured.length) return [...new Set(configured)].sort();

  for (const mirror of mirrors) {
    try {
      const rows = await fetchJson(new URL("/json/countrycodes?hidebroken=false&order=name&reverse=false", mirror));
      const codes = rows
        .map((row) => String(row?.name || row?.countrycode || "").trim().toUpperCase())
        .filter((value) => /^[A-Z]{2}$/.test(value));
      if (codes.length) return [...new Set(codes)].sort();
    } catch (error) {
      console.warn(`[countries] ${mirror} failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  throw new Error("Unable to discover Radio Browser country codes from any mirror");
}

async function fetchCountry(country) {
  const paths = queryPaths(country);
  const errors = [];

  for (const mirror of mirrors) {
    for (const queryPath of paths) {
      try {
        const rows = await fetchJson(new URL(queryPath, mirror));
        if (Array.isArray(rows)) {
          console.log(`[${country}] discovered ${rows.length} stations via ${mirror}`);
          return rows;
        }
      } catch (error) {
        errors.push(`${mirror}${queryPath}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  console.warn(`[${country}] discovery failed${errors.length ? " (" + errors.at(-1) + ")" : ""}`);
  return [];
}

function cleanStation(row, fallbackCountry) {
  const url = String(row?.url_resolved || row?.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".local")
  ) return null;

  const tags = String(row?.tags || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const country = String(row?.countrycode || row?.country || fallbackCountry || "")
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{2}$/.test(country)) return null;

  const type = String(row?.type || tags[0] || row?.codec || "Other").trim() || "Other";

  return {
    name: String(row?.name || "Unknown station").trim(),
    url,
    country,
    type,
    tags,
    codec: String(row?.codec || "").trim() || null,
    bitrate: Number.isFinite(Number(row?.bitrate)) ? Number(row.bitrate) : null,
    language: String(row?.language || "").trim() || null,
    favicon: String(row?.favicon || "").trim() || null,
    homepage: String(row?.homepage || "").trim() || null,
    stationUuid: String(row?.stationUuid || row?.stationuuid || "").trim() || null,
  };
}

async function readJsonArray(filePath) {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function existingCountryStations(country) {
  const dir = path.join(outputDir, country);
  const [active, dead] = await Promise.all([
    readJsonArray(path.join(dir, "active.json")),
    readJsonArray(path.join(dir, "dead.json")),
  ]);
  return [...active, ...dead]
    .map((row) => cleanStation(row, country))
    .filter(Boolean);
}

function stationKey(station) {
  return station.stationUuid || station.url.toLowerCase();
}

async function probeStation(station) {
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(station.url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(probeTimeoutMs),
      headers: {
        accept: "audio/*,application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.5",
        "icy-metadata": "1",
        range: "bytes=0-2047",
        "user-agent": "OpenHaul-RadioProbe/2.0 (+https://github.com/NekoSuneProjects/OpenHaul)",
      },
    });

    const status = response.status;
    const contentType = response.headers.get("content-type") || null;
    try {
      await response.body?.cancel();
    } catch {}

    if (response.ok) {
      return {
        active: true,
        station: {
          ...station,
          checkedAt,
          lastActiveAt: checkedAt,
          status,
          contentType,
        },
      };
    }

    return {
      active: false,
      station: {
        ...station,
        checkedAt,
        status,
        contentType,
        lastFailure: `HTTP ${status}`,
      },
    };
  } catch (error) {
    return {
      active: false,
      station: {
        ...station,
        checkedAt,
        status: null,
        contentType: null,
        lastFailure: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function mapConcurrent(values, concurrency, fn) {
  const results = new Array(values.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await fn(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function existingCountryFolders() {
  try {
    const entries = await readdir(outputDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && /^[A-Z]{2}$/.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const discoveredCountries = await discoverCountries();
  const previousCountries = await existingCountryFolders();
  const countries = [...new Set([...discoveredCountries, ...previousCountries])].sort();

  console.log(`Scanning ${countries.length} countries`);

  const manifestCountries = [];

  for (let countryIndex = 0; countryIndex < countries.length; countryIndex += discoveryConcurrency) {
    const batch = countries.slice(countryIndex, countryIndex + discoveryConcurrency);

    await Promise.all(batch.map(async (country) => {
      const [discoveredRows, previous] = await Promise.all([
        fetchCountry(country),
        existingCountryStations(country),
      ]);

      const merged = new Map();

      for (const row of discoveredRows) {
        const station = cleanStation(row, country);
        if (station) merged.set(stationKey(station), station);
      }

      for (const station of previous) {
        const key = stationKey(station);
        if (!merged.has(key)) merged.set(key, station);
      }

      const stations = [...merged.values()].sort((a, b) =>
        a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
      );

      console.log(`[${country}] probing ${stations.length} unique stations`);
      const probed = await mapConcurrent(stations, probeConcurrency, probeStation);

      const active = [];
      const dead = [];

      for (const result of probed) {
        if (result.active) active.push(result.station);
        else dead.push(result.station);
      }

      const countryDir = path.join(outputDir, country);
      await mkdir(countryDir, { recursive: true });
      await Promise.all([
        writeFile(path.join(countryDir, "active.json"), JSON.stringify(active, null, 2) + "\n", "utf8"),
        writeFile(path.join(countryDir, "dead.json"), JSON.stringify(dead, null, 2) + "\n", "utf8"),
      ]);

      manifestCountries.push({
        country,
        active: `${country}/active.json`,
        dead: `${country}/dead.json`,
        activeCount: active.length,
        deadCount: dead.length,
        totalCount: active.length + dead.length,
        updatedAt: new Date().toISOString(),
      });

      console.log(`[${country}] active=${active.length} dead=${dead.length}`);
    }));
  }

  manifestCountries.sort((a, b) => a.country.localeCompare(b.country));

  const manifest = {
    version: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    branch: "radio-catalog",
    mirrors,
    countries: manifestCountries,
    totals: {
      active: manifestCountries.reduce((sum, row) => sum + row.activeCount, 0),
      dead: manifestCountries.reduce((sum, row) => sum + row.deadCount, 0),
      all: manifestCountries.reduce((sum, row) => sum + row.totalCount, 0),
    },
  };

  await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(
    `Catalog complete: active=${manifest.totals.active} dead=${manifest.totals.dead} total=${manifest.totals.all}`
  );
}

await main();
