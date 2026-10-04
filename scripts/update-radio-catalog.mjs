import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const mirrors = [
  "https://de1.api.radio-browser.info/",
  "https://de2.api.radio-browser.info/",
  "https://nl1.api.radio-browser.info/",
];

const outputPath = process.env.RADIO_OUTPUT
  ?? path.resolve("apps/web/public/data/radio-stations.json");

const concurrency = Math.max(1, Math.min(12, Number(process.env.RADIO_FETCH_CONCURRENCY || 6)));
const requestTimeoutMs = Math.max(5000, Math.min(60000, Number(process.env.RADIO_REQUEST_TIMEOUT_MS || 20000)));

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
      "user-agent": "OpenHaul-RadioCatalog/1.0 (+https://github.com/NekoSuneProjects/OpenHaul)",
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
        if (Array.isArray(rows) && rows.length) {
          console.log(`[${country}] ${rows.length} stations via ${mirror}`);
          return rows;
        }
      } catch (error) {
        errors.push(`${mirror}${queryPath}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  console.warn(`[${country}] no stations found${errors.length ? " (" + errors.at(-1) + ")" : ""}`);
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

  const country = String(row?.countrycode || fallbackCountry || "")
    .trim()
    .toUpperCase();

  const type = tags[0] || String(row?.codec || "").trim() || "Other";

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
    stationUuid: String(row?.stationuuid || "").trim() || null,
  };
}

async function main() {
  const countries = await discoverCountries();
  console.log(`Discovered ${countries.length} country codes`);

  const rawByCountry = new Map();
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= countries.length) return;
      const country = countries[index];
      rawByCountry.set(country, await fetchCountry(country));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const dedupe = new Map();
  for (const country of countries) {
    for (const row of rawByCountry.get(country) || []) {
      const station = cleanStation(row, country);
      if (!station) continue;
      const key = station.stationUuid || station.url.toLowerCase();
      if (!dedupe.has(key)) dedupe.set(key, station);
    }
  }

  const stations = [...dedupe.values()].sort((a, b) =>
    a.country.localeCompare(b.country) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    mirrors,
    countries,
    count: stations.length,
    stations,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${stations.length} stations to ${outputPath}`);
}

await main();
