"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { gameCoordsToLonLat, isValidLonLat, lonLatToGameCoords } from "../lib/gameProjection";

type Driver = {
  driverId: string;
  username: string;
  game: "ets2" | "ats";
  vtcId?: number | null;
  vtcName?: string | null;
  vtcTag?: string | null;
  x: number;
  y?: number;
  z: number;
  heading: number;
  speedKph: number;
  truck?: string | null;
  cargo?: string | null;
  sourceCity?: string | null;
  destinationCity?: string | null;
  sourceCompany?: string | null;
  destinationCompany?: string | null;
  rpm?: number | null;
  fuel?: number | null;
  odometerKm?: number | null;
  navigationDistanceM?: number | null;
  navigationTimeS?: number | null;
  speedLimitKph?: number | null;
  truckDamagePercent?: number | null;
  engineDamagePercent?: number | null;
  transmissionDamagePercent?: number | null;
  cabinDamagePercent?: number | null;
  chassisDamagePercent?: number | null;
  wheelDamagePercent?: number | null;
  trailerDamagePercent?: number | null;
  trailerChassisDamagePercent?: number | null;
  cargoDamagePercent?: number | null;
  specialJob?: boolean | null;
  cargoLoaded?: boolean | null;
  server?: string | null;
  network?: "openhaul" | "truckersmp";
  truckersMpId?: string | null;
  truckersMpPlayerId?: string | null;
  truckersMpVtcId?: number | null;
  trackerServerId?: number | null;
  trackerMapId?: number | null;
  updatedAt: string;
};

type LiveMessage =
  | { type: "snapshot"; drivers: Driver[] }
  | { type: "driver.position"; driver: Driver }
  | { type: "driver.offline"; driverId: string };

type GameFilter = "all" | "ets2" | "ats";
type MapMode = "road" | "satellite" | "xray";
type CameraMode = "map" | "third" | "first";

type MapAsset = {
  available: boolean;
  size: number;
  updatedAt: string | null;
  url: string;
};

type MapAssets = {
  ets2: MapAsset;
  ats: MapAsset;
};

type VtcOption = {
  id: number;
  name: string;
  tag?: string | null;
  memberCount?: number;
};

type InterpolatedDriver = Driver & {
  _fromX?: number;
  _fromZ?: number;
  _fromHeading?: number;
  _toX?: number;
  _toZ?: number;
  _toHeading?: number;
  _startedAt?: number;
  _durationMs?: number;
  _targetVersion?: string;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "";
const roadTileUrl =
  process.env.NEXT_PUBLIC_MAP_ROAD_TILE_URL ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const satelliteTileUrl =
  process.env.NEXT_PUBLIC_MAP_SATELLITE_TILE_URL ??
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_INTERPOLATION_MS = 1000;
const FRAME_INTERVAL_MS = 33;

type TrackerServer = {
  id: number;
  map: number;
  name: string;
  game: string;
  status: boolean;
  players: number;
};

const FALLBACK_TRACKER_SERVERS: TrackerServer[] = [
  { id: 4, map: 2, name: "ETS2 - Simulation 1", game: "ets2", status: true, players: 0 },
  { id: 8, map: 7, name: "ETS2 - Arcade", game: "ets2", status: true, players: 0 },
  { id: 9, map: 8, name: "ATS - Simulation", game: "ats", status: true, players: 0 },
  { id: 11, map: 10, name: "ATS - [US] Simulation", game: "ats", status: true, players: 0 },
  { id: 30, map: 15, name: "ETS2 - [US] Simulation", game: "ets2", status: true, players: 0 },
  { id: 31, map: 50, name: "ETS2 - ProMods", game: "promods", status: true, players: 0 },
  { id: 32, map: 51, name: "ETS2 - ProMods Arcade", game: "promods", status: true, players: 0 },
  { id: 35, map: 30, name: "ETS2 - [Asia] Simulation", game: "ets2", status: true, players: 0 },
  { id: 38, map: 45, name: "ATS - [US] Arcade", game: "ats", status: true, players: 0 },
  { id: 41, map: 41, name: "ETS2 - Simulation 2", game: "ets2", status: true, players: 0 },
];

function trackerRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ["Data", "data", "Players", "players", "Drivers", "drivers", "Results", "results"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function trackerValue(row: any, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function normalizeTrackerHeadingClient(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) <= Math.PI * 2 + 0.01) {
    const turns = value / (Math.PI * 2);
    return ((turns % 1) + 1) % 1;
  }
  if (Math.abs(value) <= 1.01) return ((value % 1) + 1) % 1;
  const turns = value / 360;
  return ((turns % 1) + 1) % 1;
}

function parseTrackerRowsClient(payload: any, server: TrackerServer, game: "ets2" | "ats"): Driver[] {
  return trackerRows(payload).flatMap((row: any) => {
    const x = Number(trackerValue(row, "X", "x", "PosX", "posX"));
    const z = Number(trackerValue(row, "Y", "y", "Z", "z", "PosY", "posY", "PosZ", "posZ"));
    if (!Number.isFinite(x) || !Number.isFinite(z)) return [];

    const mpId = String(trackerValue(row, "MpId", "mpId", "TMPId", "tmpId", "Id", "id") ?? "");
    const playerId = String(trackerValue(row, "PlayerId", "playerId", "SteamId", "steamId") ?? "");
    const name = String(trackerValue(row, "Name", "name", "Username", "username") ?? mpId ?? playerId ?? "TruckersMP player");
    const unique = mpId || playerId || name + ":" + Math.round(x) + ":" + Math.round(z);

    return [{
      driverId: "tmp:" + server.map + ":" + unique,
      username: name,
      game,
      x,
      y: 0,
      z,
      heading: normalizeTrackerHeadingClient(Number(trackerValue(row, "Heading", "heading", "Rotation", "rotation") ?? 0)),
      speedKph: Number(trackerValue(row, "Speed", "speed", "SpeedKph", "speedKph") ?? 0),
      server: server.name,
      truck: "TruckersMP",
      network: "truckersmp" as const,
      truckersMpId: mpId || null,
      truckersMpPlayerId: playerId || null,
      truckersMpVtcId: Number.isFinite(Number(trackerValue(row, "VtcId", "vtcId"))) ? Number(trackerValue(row, "VtcId", "vtcId")) : null,
      trackerServerId: server.id,
      trackerMapId: server.map,
      updatedAt: new Date().toISOString(),
    }];
  });
}

async function loadTrackerServersDirect(): Promise<TrackerServer[]> {
  try {
    const response = await fetch("https://truckersmp.krashnz.com/servers", {
      cache: "no-store",
      mode: "cors",
      credentials: "omit",
    });
    if (!response.ok) throw new Error("server list HTTP " + response.status);
    const payload = await response.json();
    const rows = [
      ...(Array.isArray(payload?.servers) ? payload.servers : []),
      ...(Array.isArray(payload?.events) ? payload.events : []),
    ];
    const servers = rows.flatMap((server: any) => {
      const id = Number(server.id);
      const map = Number(server.map);
      if (!Number.isFinite(id) || !Number.isFinite(map)) return [];
      return [{
        id,
        map,
        name: String(server.name ?? "TruckersMP"),
        game: String(server.game ?? "").toLowerCase(),
        status: server.status !== false,
        players: Number(server.players ?? 0),
      }];
    });
    return servers.length ? servers : FALLBACK_TRACKER_SERVERS;
  } catch {
    return FALLBACK_TRACKER_SERVERS;
  }
}

async function loadTrackerAreaDirect(
  game: "ets2" | "ats",
  area: { x1: number; y1: number; x2: number; y2: number },
) {
  const servers = (await loadTrackerServersDirect()).filter((server) =>
    server.status &&
    (game === "ats"
      ? server.game === "ats"
      : server.game === "ets2" || server.game === "promods")
  );

  const left = Math.min(area.x1, area.x2);
  const right = Math.max(area.x1, area.x2);
  const top = Math.max(area.y1, area.y2);
  const bottom = Math.min(area.y1, area.y2);

  const results = await Promise.allSettled(servers.map(async (server) => {
    const qs = new URLSearchParams({
      x1: String(Math.round(left)),
      y1: String(Math.round(top)),
      x2: String(Math.round(right)),
      y2: String(Math.round(bottom)),
      server: String(server.map),
    });
    const response = await fetch("https://tracker.ets2map.com/v3/area?" + qs.toString(), {
      cache: "no-store",
      mode: "cors",
      credentials: "omit",
      headers: { Accept: "*/*" },
      referrer: "https://map.truckersmp.com/",
    });
    if (!response.ok) throw new Error(server.name + " HTTP " + response.status);
    return parseTrackerRowsClient(await response.json(), server, game);
  }));

  const drivers: Driver[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") drivers.push(...result.value);
  }

  return {
    drivers,
    servers,
    totalOnline: servers.reduce((sum, server) => sum + server.players, 0),
  };
}

const GAME_FOCUS_BOUNDS = {
  ets2: [[-16, 31], [45, 72]] as [[number, number], [number, number]],
  ats: [[-130, 22], [-65, 56]] as [[number, number], [number, number]],
  all: [[-135, 20], [45, 72]] as [[number, number], [number, number]],
};

function toWsUrl(base: string) {
  if (base.startsWith("https://")) return "wss://" + base.slice(8);
  if (base.startsWith("http://")) return "ws://" + base.slice(7);

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return protocol + "//" + window.location.host;
  }

  return "";
}

function absoluteApiUrl(relative: string) {
  if (typeof window !== "undefined") {
    const base = api ? new URL(api, window.location.origin).toString() : window.location.origin + "/";
    return new URL(relative, base).toString();
  }

  const fallback = api || "http://localhost:3000";
  return new URL(relative, fallback.endsWith("/") ? fallback : fallback + "/").toString();
}

const pmtilesSourceLayerCache = new Map<string, Promise<string>>();

async function detectPmtilesSourceLayer(
  sourceUrl: string,
  game: "ets2" | "ats",
) {
  const cacheKey = game + ":" + sourceUrl;
  const cached = pmtilesSourceLayerCache.get(cacheKey);
  if (cached) return cached;

  const request = (async () => {
    try {
      const pmtiles = await import("pmtiles");
      const archive = new pmtiles.PMTiles(sourceUrl);
      const metadata = await archive.getMetadata() as {
        vector_layers?: Array<{ id?: string }>;
      };

      const ids = (metadata.vector_layers ?? [])
        .map((layer) => String(layer.id ?? ""))
        .filter(Boolean);

      const preferred =
        game === "ats"
          ? ["ats", "usa"]
          : ["ets2", "europe"];

      return preferred.find((id) => ids.includes(id)) ?? ids[0] ?? game;
    } catch {
      return game;
    }
  })();

  pmtilesSourceLayerCache.set(cacheKey, request);
  return request;
}

function defaultMapStyle() {
  return {
    version: 8 as const,
    sources: {
      "openhaul-road-base": {
        type: "raster" as const,
        tiles: [roadTileUrl],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
      "openhaul-satellite-base": {
        type: "raster" as const,
        tiles: [satelliteTileUrl],
        tileSize: 256,
        attribution: "Esri World Imagery",
      },
    },
    layers: [
      {
        id: "openhaul-background",
        type: "background" as const,
        paint: {
          "background-color": "#06110c",
        },
      },
      {
        id: "openhaul-road-base",
        type: "raster" as const,
        source: "openhaul-road-base",
        layout: { visibility: "visible" as const },
        paint: {
          "raster-opacity": 0.74,
          "raster-saturation": -0.32,
          "raster-brightness-max": 0.76,
        },
      },
      {
        id: "openhaul-satellite-base",
        type: "raster" as const,
        source: "openhaul-satellite-base",
        layout: { visibility: "none" as const },
        paint: {
          "raster-opacity": 0.84,
          "raster-saturation": -0.16,
          "raster-contrast": 0.12,
        },
      },
    ],
  };
}

function setBaseMapMode(map: any, mode: MapMode) {
  if (map.getLayer("openhaul-road-base")) {
    map.setLayoutProperty(
      "openhaul-road-base",
      "visibility",
      mode === "road" ? "visible" : "none",
    );
  }

  if (map.getLayer("openhaul-satellite-base")) {
    map.setLayoutProperty(
      "openhaul-satellite-base",
      "visibility",
      mode === "satellite" ? "visible" : "none",
    );
  }

  if (map.getLayer("openhaul-background")) {
    map.setPaintProperty(
      "openhaul-background",
      "background-color",
      mode === "xray" ? "#020805" : "#06110c",
    );
  }
}

function shortestHeading(from: number, to: number) {
  let delta = ((to - from + 0.5) % 1) - 0.5;
  if (delta < -0.5) delta += 1;
  return from + delta;
}

function interpolate(from: number, to: number, t: number) {
  const smooth = t * t * (3 - 2 * t);
  return from + (to - from) * smooth;
}

function driverFeatureCollection(drivers: Driver[], staff: Array<{ driverId: string; role?: string; source?: string }> = []) {
  const staffMap = new Map(staff.map((item) => [String(item.driverId), item]));
  return {
    type: "FeatureCollection" as const,
    features: drivers.flatMap((driver) => {
      const position = gameCoordsToLonLat(driver.game, driver.x, driver.z);
      if (!isValidLonLat(position)) return [];

      const staffEntry = staffMap.get(driver.driverId);
      return [{
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: position,
        },
        properties: {
          driverId: driver.driverId,
          username: driver.username,
          game: driver.game,
          rotation: -driver.heading * 360,
          speedKph: driver.speedKph,
          truck: driver.truck ?? "",
          cargo: driver.cargo ?? "",
          route: driver.sourceCity && driver.destinationCity
            ? driver.sourceCity + " → " + driver.destinationCity
            : "",
          server: driver.server ?? "",
          rpm: driver.rpm ?? 0,
          fuel: driver.fuel ?? 0,
          odometerKm: driver.odometerKm ?? 0,
          navigationDistanceM: driver.navigationDistanceM ?? 0,
          navigationTimeS: driver.navigationTimeS ?? 0,
          speedLimitKph: driver.speedLimitKph ?? 0,
          truckDamagePercent: driver.truckDamagePercent ?? 0,
          trailerDamagePercent: driver.trailerDamagePercent ?? 0,
          cargoDamagePercent: driver.cargoDamagePercent ?? 0,
          specialJob: driver.specialJob ? 1 : 0,
          cargoLoaded: driver.cargoLoaded ? 1 : 0,
          vtc: driver.vtcName ?? "Independent",
          vtcTag: driver.vtcTag ?? "",
          staffSource: staffEntry?.source ?? "",
          staffRole: staffEntry?.role ?? "",
          network: driver.network ?? "openhaul",
          truckersMpId: driver.truckersMpId ?? "",
          truckersMpPlayerId: driver.truckersMpPlayerId ?? "",
          truckersMpVtcId: driver.truckersMpVtcId ?? 0,
          trackerServerId: driver.trackerServerId ?? 0,
          trackerMapId: driver.trackerMapId ?? 0,
        },
      }];
    }),
  };
}

function trafficServerTag(server: string, game: string) {
  const value = server.trim();
  if (!value) return game === "ats" ? "ATS" : "ETS2";

  const normalized = value
    .replace(/^ETS2\s*-\s*/i, "")
    .replace(/^ATS\s*-\s*/i, "")
    .replace(/\[US\]/gi, "US")
    .replace(/\[SGP\]/gi, "SGP")
    .trim();

  return normalized
    .replace(/Simulation\s*1/i, "SIM 1")
    .replace(/Simulation\s*2/i, "SIM 2")
    .replace(/Simulation/i, "SIM")
    .replace(/Arcade/i, "ARCADE")
    .replace(/ProMods/i, "PROMODS")
    .toUpperCase();
}

function trafficFeatureCollection(traffic: any[]) {
  return {
    type: "FeatureCollection" as const,
    features: (traffic ?? []).flatMap((jam: any) => {
      const position = gameCoordsToLonLat(jam.game, Number(jam.x), Number(jam.z));
      if (!isValidLonLat(position)) return [];

      const server = String(jam.server ?? "");
      const game = String(jam.game ?? "").toLowerCase();

      return [{
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: position },
        properties: {
          id: String(jam.id ?? ""),
          severity: String(jam.severity ?? "low"),
          drivers: Number(jam.drivers ?? 0),
          averageSpeedKph: Number(jam.averageSpeedKph ?? 0),
          server,
          serverTag: trafficServerTag(server, game),
          game,
          source: String(jam.source ?? (server ? "truckersmp" : "openhaul")),
        },
      }];
    }),
  };
}

function externalDriverList(rows: any[]): Driver[] {
  return (rows ?? []).flatMap((row: any) => {
    if ((row.game !== "ets2" && row.game !== "ats") || !row.driverId) return [];
    return [{
      driverId: String(row.driverId),
      username: String(row.username ?? row.driverId),
      game: row.game,
      x: Number(row.x),
      y: Number(row.y ?? 0),
      z: Number(row.z),
      heading: Number(row.heading ?? 0),
      speedKph: Number(row.speedKph ?? 0),
      server: row.server ? String(row.server) : "TruckersMP",
      truck: row.source === "openhaul-client" ? "OpenHaul client · TruckersMP position" : "TruckersMP",
      network: row.source === "openhaul-client" ? "openhaul" : "truckersmp",
      truckersMpId: row.mpId ? String(row.mpId) : null,
      truckersMpPlayerId: row.playerId ? String(row.playerId) : null,
      truckersMpVtcId: Number.isFinite(Number(row.vtcId)) ? Number(row.vtcId) : null,
      trackerServerId: Number.isFinite(Number(row.trackerServerId)) ? Number(row.trackerServerId) : null,
      trackerMapId: Number.isFinite(Number(row.trackerMapId)) ? Number(row.trackerMapId) : null,
      updatedAt: String(row.updatedAt ?? Date.now()),
    }];
  });
}

function jobMarkerFeatureCollection(markers: any[]) {
  return {
    type: "FeatureCollection" as const,
    features: (markers ?? []).flatMap((marker: any) => {
      const position = gameCoordsToLonLat(marker.game, Number(marker.x), Number(marker.z));
      if (!isValidLonLat(position)) return [];
      return [{
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: position },
        properties: {
          id: String(marker.id ?? ""),
          driverId: String(marker.driverId ?? ""),
          markerType: String(marker.type ?? ""),
          city: String(marker.city ?? ""),
        },
      }];
    }),
  };
}

function convoyFeatureCollection(convoys: any[]) {
  return {
    type: "FeatureCollection" as const,
    features: (convoys ?? []).flatMap((convoy: any) => {
      const points: [number, number][] = [];

      for (const waypoint of convoy.route ?? []) {
        const game = waypoint.game ?? convoy.members?.[0]?.game;
        const position = gameCoordsToLonLat(game, Number(waypoint.x), Number(waypoint.z));
        if (isValidLonLat(position)) points.push(position);
      }

      if (points.length < 2) {
        for (const member of convoy.members ?? []) {
          const position = gameCoordsToLonLat(member.game, Number(member.x), Number(member.z));
          if (isValidLonLat(position)) points.push(position);
        }
      }

      if (points.length < 2) return [];
      return [{
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: points },
        properties: {
          id: String(convoy.id ?? convoy.key ?? ""),
          title: String(convoy.title ?? "Convoy"),
          members: Number(convoy.members?.length ?? 0),
        },
      }];
    }),
  };
}


const SCS_LAYER_SUFFIXES = ["prefabs", "road-case", "roads", "rail", "ferry", "cities"] as const;

function setScsMapTheme(map: any, game: "ets2" | "ats", mode: MapMode) {
  const sourceId = "openhaul-" + game + "-map";

  if (map.getLayer(sourceId + "-prefabs")) {
    map.setPaintProperty(sourceId + "-prefabs", "fill-opacity", mode === "xray" ? 0.68 : 0.42);
    map.setPaintProperty(sourceId + "-prefabs", "fill-color", mode === "satellite" ? "#1f3328" : "#16261f");
  }

  if (map.getLayer(sourceId + "-road-case")) {
    map.setPaintProperty(
      sourceId + "-road-case",
      "line-color",
      mode === "satellite" ? "#020604" : mode === "xray" ? "#00150a" : "#07110c",
    );
    map.setPaintProperty(sourceId + "-road-case", "line-opacity", 1);
  }

  if (map.getLayer(sourceId + "-roads")) {
    map.setPaintProperty(sourceId + "-roads", "line-color", [
      "match",
      ["get", "roadType"],
      "freeway", mode === "satellite" ? "#75ffb1" : mode === "xray" ? "#63ff9c" : "#54e08a",
      "expressway", mode === "satellite" ? "#a4ffd0" : mode === "xray" ? "#87ffc0" : "#6bd995",
      "local", mode === "satellite" ? "#f2fff7" : mode === "xray" ? "#d8ffe7" : "#d7eee1",
      "no_vehicles", mode === "satellite" ? "#d0d8d3" : "#6f8076",
      "unknown", mode === "satellite" ? "#dce8e1" : "#87968e",
      mode === "xray" ? "#f2fff7" : "#e7f5ec",
    ]);
    map.setPaintProperty(sourceId + "-roads", "line-opacity", 1);
  }

  if (map.getLayer(sourceId + "-cities")) {
    map.setPaintProperty(sourceId + "-cities", "text-color", mode === "satellite" ? "#ffffff" : "#e9f7ef");
    map.setPaintProperty(sourceId + "-cities", "text-halo-color", mode === "xray" ? "#020805" : "#07110c");
  }
}

function setScsMapVisibility(map: any, game: "ets2" | "ats", visible: boolean) {
  const sourceId = "openhaul-" + game + "-map";
  for (const suffix of SCS_LAYER_SUFFIXES) {
    const layerId = sourceId + "-" + suffix;
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    }
  }
}

function addScsMapLayers(map: any, game: "ets2" | "ats", sourceUrl: string, sourceLayer: string) {
  const sourceId = "openhaul-" + game + "-map";
  const nextUrl = "pmtiles://" + sourceUrl;
  const source = map.getSource(sourceId);

  if (source) {
    const currentUrl = source.serialize().url;
    const currentLayer = map.getLayer(sourceId + "-roads")?.["source-layer"];

    if (currentUrl === nextUrl && currentLayer === sourceLayer) {
      return;
    }

    for (const suffix of [...SCS_LAYER_SUFFIXES].reverse()) {
      const layerId = sourceId + "-" + suffix;
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    map.removeSource(sourceId);
  }

  map.addSource(sourceId, {
    type: "vector",
    url: nextUrl,
    attribution: "SCS Software · Map conversion by TruckSim Maps",
  });

  const beforeDriver = map.getLayer("openhaul-driver-dot") ? "openhaul-driver-dot" : undefined;
  const addMapLayer = (layer: any) => map.addLayer(layer, beforeDriver);

  addMapLayer({
    id: sourceId + "-prefabs",
    type: "fill",
    source: sourceId,
    "source-layer": sourceLayer,
    filter: ["==", ["get", "type"], "prefab"],
    paint: {
      "fill-color": "#16261f",
      "fill-opacity": 0.42,
      "fill-outline-color": "#2e4c3d",
    },
  });

  addMapLayer({
    id: sourceId + "-road-case",
    type: "line",
    source: sourceId,
    "source-layer": sourceLayer,
    filter: [
      "all",
      ["==", ["get", "type"], "road"],
      ["!=", ["get", "roadType"], "train"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#07110c",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3, 1.4,
        7, 3,
        11, 8,
        15, 16,
      ],
      "line-opacity": 0.95,
    },
  });

  addMapLayer({
    id: sourceId + "-roads",
    type: "line",
    source: sourceId,
    "source-layer": sourceLayer,
    filter: [
      "all",
      ["==", ["get", "type"], "road"],
      ["!=", ["get", "roadType"], "train"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": [
        "match",
        ["get", "roadType"],
        "freeway", "#54e08a",
        "expressway", "#6bd995",
        "local", "#b5c7bd",
        "no_vehicles", "#6f8076",
        "unknown", "#87968e",
        "#dce8e1",
      ],
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3, 0.7,
        7, 1.7,
        11, 5,
        15, 12,
      ],
      "line-opacity": 0.96,
    },
  });

  addMapLayer({
    id: sourceId + "-rail",
    type: "line",
    source: sourceId,
    "source-layer": sourceLayer,
    filter: [
      "all",
      ["==", ["get", "type"], "road"],
      ["==", ["get", "roadType"], "train"],
    ],
    paint: {
      "line-color": "#66706b",
      "line-width": 1,
      "line-dasharray": [3, 3],
      "line-opacity": 0.7,
    },
  });

  addMapLayer({
    id: sourceId + "-ferry",
    type: "line",
    source: sourceId,
    "source-layer": sourceLayer,
    filter: ["==", ["get", "type"], "ferry"],
    paint: {
      "line-color": "#57a6cf",
      "line-width": 2,
      "line-dasharray": [2, 2],
      "line-opacity": 0.8,
    },
  });

  addMapLayer({
    id: sourceId + "-cities",
    type: "symbol",
    source: sourceId,
    "source-layer": sourceLayer,
    filter: ["==", ["get", "type"], "city"],
    minzoom: 4,
    layout: {
      "text-field": ["coalesce", ["get", "name"], ""],
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4, 10,
        8, 13,
        12, 16,
      ],
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#e9f7ef",
      "text-halo-color": "#07110c",
      "text-halo-width": 2,
    },
  });
}

export function MapClient() {
  const params = useSearchParams();
  const initialVtc = params.get("vtc") ?? "";
  const initialDriver = params.get("driver") ?? "";
  const embedded = params.get("embed") === "1";
  const initialMode = (params.get("mode") as MapMode | null) ?? null;
  const [vtc, setVtc] = useState(initialVtc);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [gameFilter, setGameFilter] = useState<GameFilter>("all");
  const [driverQuery, setDriverQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "driving" | "stopped" | "on-job" | "free">("all");
  const [serverFilter, setServerFilter] = useState("all");
  const [fullscreen, setFullscreen] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>("road");
  const [cameraMode, setCameraMode] = useState<CameraMode>("map");
  const [selectedDriverId, setSelectedDriverId] = useState(initialDriver);
  const [mapReady, setMapReady] = useState(false);
  const [mapAssets, setMapAssets] = useState<MapAssets | null>(null);
  const [vtcOptions, setVtcOptions] = useState<VtcOption[]>([]);
  const [mapIntel, setMapIntel] = useState<any>({ traffic: [], staff: [], specialCargo: [] });
  const [trackerDrivers, setTrackerDrivers] = useState<Driver[]>([]);
  const [trackerTraffic, setTrackerTraffic] = useState<any[]>([]);
  const [stableTraffic, setStableTraffic] = useState<any[]>([]);
  const [trackerTotalOnline, setTrackerTotalOnline] = useState(0);
  const [trackerServers, setTrackerServers] = useState<TrackerServer[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const maplibreRef = useRef<any>(null);
  const protocolRef = useRef<any>(null);
  const fittedRef = useRef(false);
  const visibleDriversRef = useRef<Driver[]>([]);
  const interpolatedRef = useRef<Map<string, InterpolatedDriver>>(new Map());
  const selectedPopupRef = useRef<any>(null);
  const selectedPopupDriverIdRef = useRef<string>("");
  const selectedDriverLastSeenRef = useRef<number>(0);
  const trafficCacheRef = useRef<Map<string, { jam: any; expiresAt: number }>>(new Map());

  const serverOptions = useMemo(
    () => Array.from(new Set([
      ...drivers.map((driver) => driver.server),
      ...trackerDrivers.map((driver) => driver.server),
      ...trackerServers.filter((server) => server.status).map((server) => server.name),
    ].filter((value): value is string => Boolean(value)))).sort(),
    [drivers, trackerDrivers, trackerServers],
  );

  const visibleDrivers = useMemo(() => {
    const needle = driverQuery.trim().toLowerCase();
    return drivers.filter((driver) => {
      if (gameFilter !== "all" && driver.game !== gameFilter) return false;
      if (serverFilter !== "all" && (driver.server ?? "") !== serverFilter) return false;
      if (statusFilter === "driving" && Number(driver.speedKph ?? 0) <= 1) return false;
      if (statusFilter === "stopped" && Number(driver.speedKph ?? 0) > 1) return false;
      const onJob = Boolean(driver.cargo || driver.destinationCity || driver.sourceCity);
      if (statusFilter === "on-job" && !onJob) return false;
      if (statusFilter === "free" && onJob) return false;
      if (needle && ![
        driver.username,
        driver.driverId,
        driver.vtcName,
        driver.vtcTag,
        driver.truck,
        driver.cargo,
        driver.sourceCity,
        driver.destinationCity,
        driver.server,
      ].some((value) => String(value ?? "").toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [drivers, gameFilter, serverFilter, statusFilter, driverQuery]);

  useEffect(() => {
    visibleDriversRef.current = visibleDrivers;
  }, [visibleDrivers]);

  useEffect(() => {
    if (!embedded) return;
    document.body.classList.add("mapEmbedMode");
    return () => document.body.classList.remove("mapEmbedMode");
  }, [embedded]);

  const restUrl = useMemo(() => {
    const qs = initialVtc ? "?vtc=" + encodeURIComponent(initialVtc) : "";
    return api + "/api/v1/public/live" + qs;
  }, [initialVtc]);

  const wsUrl = useMemo(() => {
    const qs = initialVtc ? "?vtc=" + encodeURIComponent(initialVtc) : "";
    return toWsUrl(api) + "/api/v1/public/live/ws" + qs;
  }, [initialVtc]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(api + "/api/v1/public/vtcs", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : { vtcs: [] })
      .then((data) => {
        if (!controller.signal.aborted) setVtcOptions(data.vtcs ?? []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => fetch(api + "/api/v1/public/map-intelligence", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { traffic: [], staff: [], specialCargo: [] })
      .then((data) => { if (active) setMapIntel(data); })
      .catch(() => {});
    void load();
    const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const loadViewport = async () => {
      const map = mapRef.current;
      if (!active || !map) return;

      const bounds = map.getBounds();
      const corners = [
        [bounds.getWest(), bounds.getSouth()],
        [bounds.getWest(), bounds.getNorth()],
        [bounds.getEast(), bounds.getSouth()],
        [bounds.getEast(), bounds.getNorth()],
      ] as Array<[number, number]>;

      const games: Array<"ets2" | "ats"> =
        gameFilter === "all" ? ["ets2", "ats"] : [gameFilter];

      const requests = games.flatMap((game) => {
        const gamePoints = corners.map(([lon, lat]) => lonLatToGameCoords(game, lon, lat));
        const xs = gamePoints.map(([x]) => x);
        const zs = gamePoints.map(([, z]) => z);
        let x1 = Math.min(...xs);
        let x2 = Math.max(...xs);
        let y1 = Math.min(...zs);
        let y2 = Math.max(...zs);

        const padX = Math.max(500, (x2 - x1) * 0.12);
        const padY = Math.max(500, (y2 - y1) * 0.12);
        x1 -= padX;
        x2 += padX;
        y1 -= padY;
        y2 += padY;

        if (!Number.isFinite(x1 + x2 + y1 + y2)) return [];
        if (Math.abs(x2 - x1) > 500_000 || Math.abs(y2 - y1) > 500_000) return [];

        const area = { x1, y1, x2, y2 };
        const params = new URLSearchParams({
          game,
          x1: String(Math.round(x1)),
          y1: String(Math.round(y1)),
          x2: String(Math.round(x2)),
          y2: String(Math.round(y2)),
        });

        return [(async () => {
          let proxied: any = null;
          try {
            const response = await fetch(
              api + "/api/v1/public/truckersmp/area?" + params.toString(),
              { cache: "no-store" },
            );
            if (response.ok) proxied = await response.json();
          } catch {}

          // Docker hosts can occasionally fail outbound DNS/Cloudflare access
          // to the public tracker even though a normal browser can reach it.
          // Fall back to the exact browser-side calls used by map.truckersmp.com.
          if (!proxied || ((proxied.drivers?.length ?? 0) === 0 && Number(proxied.totalOnline ?? 0) > 0)) {
            try {
              const direct = await loadTrackerAreaDirect(game, area);
              if (direct.drivers.length > 0 || !proxied) {
                return {
                  ...(proxied ?? {}),
                  game,
                  drivers: direct.drivers,
                  servers: direct.servers,
                  totalOnline: direct.totalOnline,
                  provider: "direct-browser",
                };
              }
            } catch {}
          }

          return proxied;
        })()];
      });

      const results = await Promise.all(requests);
      if (!active) return;

      const nextDrivers = new Map<string, Driver>();
      const nextTraffic: any[] = [];
      const nextServers = new Map<number, TrackerServer>();
      let totalOnline = 0;

      for (const result of results) {
        if (!result) continue;
        totalOnline += Number(result.totalOnline ?? 0);
        for (const server of result.servers ?? []) {
          const id = Number(server.id);
          const mapId = Number(server.map);
          if (!Number.isFinite(id) || !Number.isFinite(mapId)) continue;
          nextServers.set(id, {
            id,
            map: mapId,
            name: String(server.name ?? "TruckersMP"),
            game: String(server.game ?? ""),
            status: server.status !== false,
            players: Number(server.players ?? 0),
          });
        }
        for (const row of result.drivers ?? []) {
          const driver = externalDriverList([row])[0];
          if (!driver) continue;
          const key = driver.driverId + ":" + (driver.server ?? "");
          nextDrivers.set(key, driver);
        }
        nextTraffic.push(...(result.traffic ?? []));
      }

      setTrackerDrivers([...nextDrivers.values()]);
      setTrackerTraffic(nextTraffic);
      setTrackerServers([...nextServers.values()].sort((a, b) => a.name.localeCompare(b.name)));
      setTrackerTotalOnline(totalOnline);
    };

    const scheduleLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadViewport(), 250);
    };

    const map = mapRef.current;
    map?.on("moveend", scheduleLoad);
    map?.on("zoomend", scheduleLoad);

    void loadViewport();
    refreshTimer = setInterval(() => void loadViewport(), 4000);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      if (refreshTimer) clearInterval(refreshTimer);
      map?.off("moveend", scheduleLoad);
      map?.off("zoomend", scheduleLoad);
    };
  }, [mapReady, gameFilter]);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      fetch(api + "/api/v1/public/map/assets", { cache: "no-store", signal: controller.signal })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
          if (data && !controller.signal.aborted) setMapAssets(data);
        })
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, []);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFrame = 0;

    const queueMapResize = () => {
      if (disposed) return;
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        if (!disposed) mapRef.current?.resize();
      });
    };

    async function createMap() {
      if (!containerRef.current || mapRef.current) return;

      const [maplibregl, pmtiles] = await Promise.all([
        import("maplibre-gl"),
        import("pmtiles"),
      ]);

      if (disposed || !containerRef.current) return;

      maplibreRef.current = maplibregl;

      const protocol = new pmtiles.Protocol();
      protocolRef.current = protocol;
      maplibregl.addProtocol("pmtiles", protocol.tile);

      const savedMode = window.localStorage.getItem("openhaul-map-mode") as MapMode | null;
      if (savedMode === "road" || savedMode === "satellite" || savedMode === "xray") {
        setMapMode(savedMode);
      }

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: defaultMapStyle(),
        center: [5, 46],
        zoom: 3,
        minZoom: 1,
        maxZoom: 18,
        dragPan: true,
        scrollZoom: true,
        boxZoom: true,
        dragRotate: true,
        touchZoomRotate: true,
        keyboard: true,
      });

      // Keep MapLibre's backing canvas in sync with the actual panel size.
      // This matters especially inside the WebView overlay iframe, where the
      // iframe can grow from its initial browser size after MapLibre starts.
      mapRef.current = map;
      resizeObserver = new ResizeObserver(queueMapResize);
      resizeObserver.observe(containerRef.current);
      window.addEventListener("resize", queueMapResize);
      queueMapResize();

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

      const takeManualCameraControl = (event?: any) => {
        // MapLibre also emits rotate/pitch lifecycle events for programmatic
        // camera updates. Only cancel player-follow when a real user input
        // started the gesture; otherwise our own follow camera clears itself.
        if (event && "originalEvent" in event && !event.originalEvent) return;

        fittedRef.current = true;
        setSelectedDriverId("");
        setCameraMode("map");
      };

      const takeWheelCameraControl = () => {
        fittedRef.current = true;
        setSelectedDriverId("");
        setCameraMode("map");
      };

      map.on("dragstart", takeManualCameraControl);
      map.on("rotatestart", takeManualCameraControl);
      map.on("pitchstart", takeManualCameraControl);
      map.getCanvas().addEventListener("wheel", takeWheelCameraControl, { passive: true });

      map.on("load", () => {
        queueMapResize();
        window.setTimeout(queueMapResize, 0);
        window.setTimeout(queueMapResize, 150);

        if (!map.getSource("openhaul-drivers")) {
          map.addSource("openhaul-drivers", {
            type: "geojson",
            data: driverFeatureCollection([]),
          });
        }

        if (!map.getSource("openhaul-traffic")) {
          map.addSource("openhaul-traffic", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
        }

        for (const sourceId of ["openhaul-job-markers", "openhaul-convoys", "openhaul-replay"]) {
          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            });
          }
        }

        map.addLayer({
          id: "openhaul-convoy-routes",
          type: "line",
          source: "openhaul-convoys",
          paint: {
            "line-color": "#b86cff",
            "line-width": 4,
            "line-opacity": 0.8,
          },
        });

        map.addLayer({
          id: "openhaul-replay-route",
          type: "line",
          source: "openhaul-replay",
          paint: {
            "line-color": "#35d8ff",
            "line-width": 4,
            "line-opacity": 0.88,
          },
        });

        map.addLayer({
          id: "openhaul-job-points",
          type: "circle",
          source: "openhaul-job-markers",
          paint: {
            "circle-radius": 7,
            "circle-color": ["match", ["get", "markerType"], "origin", "#54e08a", "#ff7a7a"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });

        map.addLayer({
          id: "openhaul-job-labels",
          type: "symbol",
          source: "openhaul-job-markers",
          layout: {
            "text-field": ["coalesce", ["get", "city"], ["get", "markerType"]],
            "text-size": 11,
            "text-offset": [0, 1.3],
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#04100a",
            "text-halo-width": 2,
          },
        });

        map.addLayer({
          id: "openhaul-traffic-jams",
          type: "circle",
          source: "openhaul-traffic",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "drivers"], 3, 16, 10, 34],
            "circle-color": [
              "match", ["get", "severity"],
              "high", "#ff4d4f",
              "medium", "#ffb020",
              "#ffd666",
            ],
            "circle-opacity": 0.32,
            "circle-stroke-color": [
              "match", ["get", "severity"],
              "high", "#ff7875",
              "medium", "#ffc53d",
              "#ffe58f",
            ],
            "circle-stroke-width": 2,
          },
        });

        map.addLayer({
          id: "openhaul-traffic-label",
          type: "symbol",
          source: "openhaul-traffic",
          layout: {
            "text-field": [
              "concat",
              ["get", "serverTag"],
              "\nTRAFFIC ",
              ["to-string", ["get", "drivers"]],
            ],
            "text-size": 11,
            "text-offset": [0, 1.7],
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": "#fff7e6",
            "text-halo-color": "#3a1200",
            "text-halo-width": 2,
          },
        });

        map.on("mouseenter", "openhaul-traffic-jams", () => {
          map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", "openhaul-traffic-jams", () => {
          map.getCanvas().style.cursor = "";
        });

        map.on("click", "openhaul-traffic-jams", (event) => {
          const feature = event.features?.[0];
          if (!feature || feature.geometry.type !== "Point") return;

          const properties = feature.properties || {};
          const coordinates = feature.geometry.coordinates as [number, number];

          const card = document.createElement("div");
          card.className = "mapPopup";

          const title = document.createElement("strong");
          title.textContent =
            String(properties.serverTag || properties.game || "Traffic") +
            " · Traffic";
          card.appendChild(title);

          const lines = [
            properties.server
              ? "Server: " + String(properties.server)
              : "Server: OpenHaul / unknown",
            properties.game
              ? "Game: " + String(properties.game).toUpperCase()
              : "",
            "Players in traffic area: " + String(properties.drivers || 0),
            Number(properties.averageSpeedKph || 0) > 0
              ? "Average speed: " + Math.round(Number(properties.averageSpeedKph)) + " km/h"
              : "Traffic source: player density",
            "Severity: " + String(properties.severity || "low").toUpperCase(),
            properties.source
              ? "Source: " + (String(properties.source).includes("truckersmp") ? "TruckersMP" : "OpenHaul")
              : "",
          ].filter(Boolean);

          for (const line of lines) {
            const row = document.createElement("div");
            row.textContent = line;
            card.appendChild(row);
          }

          new maplibregl.Popup({ offset: 16, closeOnMove: false })
            .setLngLat(coordinates)
            .setDOMContent(card)
            .addTo(map);
        });

        if (!map.hasImage("openhaul-driver-arrow")) {
          const canvas = document.createElement("canvas");
          canvas.width = 64;
          canvas.height = 64;
          const context = canvas.getContext("2d");
          if (context) {
            context.clearRect(0, 0, 64, 64);
            context.beginPath();
            context.moveTo(32, 5);
            context.lineTo(51, 49);
            context.lineTo(32, 40);
            context.lineTo(13, 49);
            context.closePath();
            context.fillStyle = "#06110c";
            context.fill();
            context.lineWidth = 5;
            context.strokeStyle = "#ffffff";
            context.stroke();
            map.addImage("openhaul-driver-arrow", context.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
          }
        }

        map.addLayer({
          id: "openhaul-driver-dot",
          type: "circle",
          source: "openhaul-drivers",
          paint: {
            "circle-radius": 12,
            "circle-color": [
              "case",
              ["==", ["get", "staffSource"], "truckersmp"], "#ff4d4f",
              ["==", ["get", "staffSource"], "openhaul"], "#a855f7",
              ["==", ["get", "network"], "truckersmp"], "#3b82f6",
              "#54e08a",
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 3,
          },
        });

        map.addLayer({
          id: "openhaul-driver-heading",
          type: "symbol",
          source: "openhaul-drivers",
          layout: {
            "icon-image": "openhaul-driver-arrow",
            "icon-size": 1,
            "icon-rotate": ["get", "rotation"],
            "icon-rotation-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });

        map.addLayer({
          id: "openhaul-driver-label",
          type: "symbol",
          source: "openhaul-drivers",
          layout: {
            "text-field": ["get", "username"],
            "text-size": 12,
            "text-offset": [0, 1.7],
            "text-anchor": "top",
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#06110c",
            "text-halo-width": 2,
          },
        });

        map.on("mouseenter", "openhaul-driver-dot", () => {
          map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", "openhaul-driver-dot", () => {
          map.getCanvas().style.cursor = "";
        });

        map.on("click", "openhaul-driver-dot", (event) => {
          const feature = event.features?.[0];
          if (!feature || feature.geometry.type !== "Point") return;

          const clickedDriverId = String(feature.properties?.driverId ?? "");
          if (clickedDriverId) {
            setSelectedDriverId(clickedDriverId);
            setCameraMode("third");
            fittedRef.current = true;
            const url = new URL(window.location.href);
            url.searchParams.set("driver", clickedDriverId);
            window.history.replaceState({}, "", url);
          }

          const properties = feature.properties || {};
          const coordinates = feature.geometry.coordinates as [number, number];

          const card = document.createElement("div");
          card.className = "mapPopup";

          const title = document.createElement("strong");
          title.textContent = String(properties.username || properties.driverId || "Driver");
          card.appendChild(title);

          const isTruckersMpOnly = properties.network === "truckersmp";
          const lines = isTruckersMpOnly
            ? [
                "TruckersMP · " + String(properties.game || "").toUpperCase(),
                properties.server ? "Server: " + String(properties.server) : "Server: unknown",
                Number(properties.speedKph || 0) > 0 ? Math.round(Number(properties.speedKph)) + " km/h" : "",
                properties.truckersMpId ? "TruckersMP ID: " + String(properties.truckersMpId) : "",
                properties.truckersMpPlayerId ? "Player ID: " + String(properties.truckersMpPlayerId) : "",
                Number(properties.truckersMpVtcId || 0) > 0 ? "TruckersMP VTC ID: " + String(properties.truckersMpVtcId) : "",
                Number(properties.trackerServerId || 0) > 0 ? "Server ID: " + String(properties.trackerServerId) + " · map " + String(properties.trackerMapId || "") : "",
                "TruckersMP-only player · extra truck/cargo/damage data appears when they use OpenHaul",
              ]
            : [
                String(properties.vtcTag ? "[" + properties.vtcTag + "] " : "") + String(properties.vtc || "Independent"),
                "OpenHaul · " + String(properties.game || "").toUpperCase() + " · " + Math.round(Number(properties.speedKph || 0)) + " km/h",
                properties.server ? "Server: " + String(properties.server) : "",
                String(properties.truck || "Unknown truck"),
                properties.staffRole ? "🛡 " + String(properties.staffRole) : "",
                String(properties.cargo || "No cargo"),
                Number(properties.specialJob || 0) ? "⭐ Special cargo / transport job" : "",
                Number(properties.cargoLoaded || 0)
                  ? "Cargo damage " + Number(properties.cargoDamagePercent || 0).toFixed(1) + "% · Trailer " + Number(properties.trailerDamagePercent || 0).toFixed(1) + "%"
                  : "Truck damage " + Number(properties.truckDamagePercent || 0).toFixed(1) + "%",
                Number(properties.rpm || 0) > 0 ? Math.round(Number(properties.rpm)) + " RPM · " + Math.round(Number(properties.fuel || 0)) + " L fuel" : "",
                Number(properties.navigationDistanceM || 0) > 0 ? Math.round(Number(properties.navigationDistanceM) / 1000) + " km remaining · " + Math.round(Number(properties.speedLimitKph || 0)) + " km/h limit" : "",
                String(properties.route || ""),
              ];
          const visibleLines = lines.filter(Boolean);

          for (const line of visibleLines) {
            const row = document.createElement("div");
            row.textContent = line;
            card.appendChild(row);
          }

          selectedPopupRef.current?.remove?.();

          const popup = new maplibregl.Popup({
            offset: 16,
            closeOnMove: false,
          })
            .setLngLat(coordinates)
            .setDOMContent(card)
            .addTo(map);

          selectedPopupRef.current = popup;
          selectedPopupDriverIdRef.current = clickedDriverId;

          popup.on("close", () => {
            if (selectedPopupRef.current === popup) {
              selectedPopupRef.current = null;
              selectedPopupDriverIdRef.current = "";
            }
          });
        });

        const initialMode =
          (window.localStorage.getItem("openhaul-map-mode") as MapMode | null) ?? "road";
        setBaseMapMode(map, initialMode);
        setMapReady(true);
      });
    }

    void createMap();

    return () => {
      disposed = true;
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", queueMapResize);
      mapRef.current?.off("dragstart", takeManualCameraControl);
      mapRef.current?.off("rotatestart", takeManualCameraControl);
      mapRef.current?.off("pitchstart", takeManualCameraControl);
      mapRef.current?.getCanvas().removeEventListener("wheel", takeWheelCameraControl);
      selectedPopupRef.current?.remove?.();
      selectedPopupRef.current = null;
      selectedPopupDriverIdRef.current = "";
      mapRef.current?.remove();
      mapRef.current = null;

      if (protocolRef.current && maplibreRef.current) {
        maplibreRef.current.removeProtocol("pmtiles");
      }

      protocolRef.current = null;
      maplibreRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const now = Date.now();
    const ttlMs = 5 * 60_000;
    const cache = trafficCacheRef.current;
    const incoming = [...(mapIntel.traffic ?? []), ...trackerTraffic];

    const sameTrafficArea = (a: any, b: any) => {
      if (String(a.game ?? "") !== String(b.game ?? "")) return false;
      if (String(a.server ?? "") !== String(b.server ?? "")) return false;
      if (String(a.source ?? "") !== String(b.source ?? "")) return false;

      const ax = Number(a.x);
      const az = Number(a.z);
      const bx = Number(b.x);
      const bz = Number(b.z);
      if (![ax, az, bx, bz].every(Number.isFinite)) return false;

      // TruckersMP density clusters move slightly as players enter/leave the
      // group. Treat nearby refreshed clusters as the same traffic marker so
      // it updates instead of disappearing and being recreated.
      return Math.hypot(ax - bx, az - bz) <= 1800;
    };

    for (const jam of incoming) {
      let key = String(jam.id ?? "");
      let existingKey: string | null = null;

      if (key && cache.has(key)) {
        existingKey = key;
      } else {
        for (const [candidateKey, entry] of cache) {
          if (sameTrafficArea(entry.jam, jam)) {
            existingKey = candidateKey;
            break;
          }
        }
      }

      if (!existingKey) {
        const game = String(jam.game ?? "unknown");
        const server = String(jam.server ?? "unknown");
        const source = String(jam.source ?? "traffic");
        const bucketX = Math.round(Number(jam.x ?? 0) / 1000);
        const bucketZ = Math.round(Number(jam.z ?? 0) / 1000);
        existingKey = key || [source, game, server, bucketX, bucketZ].join(":");
      }

      const previous = cache.get(existingKey)?.jam ?? {};
      cache.set(existingKey, {
        jam: {
          ...previous,
          ...jam,
          // Keep the stable cache key even when the provider generates a new
          // position-based id for the same traffic cluster.
          id: existingKey,
        },
        expiresAt: now + ttlMs,
      });
    }

    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key);
    }

    setStableTraffic([...cache.values()].map((entry) => entry.jam));
  }, [mapIntel.traffic, trackerTraffic]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const cache = trafficCacheRef.current;
      let changed = false;

      for (const [key, entry] of cache) {
        if (entry.expiresAt <= now) {
          cache.delete(key);
          changed = true;
        }
      }

      if (changed) {
        setStableTraffic([...cache.values()].map((entry) => entry.jam));
      }
    }, 30_000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    (map.getSource("openhaul-traffic") as any)?.setData(
      trafficFeatureCollection(stableTraffic)
    );
    (map.getSource("openhaul-job-markers") as any)?.setData(jobMarkerFeatureCollection(mapIntel.jobMarkers ?? []));
    (map.getSource("openhaul-convoys") as any)?.setData(convoyFeatureCollection(mapIntel.convoys ?? []));
  }, [mapReady, stableTraffic, mapIntel.jobMarkers, mapIntel.convoys]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !mapAssets) return;

    let cancelled = false;

    const install = async () => {
      const installs: Array<Promise<void>> = [];

      if (mapAssets.ets2.available) {
        const sourceUrl = absoluteApiUrl(mapAssets.ets2.url);
        installs.push(
          detectPmtilesSourceLayer(sourceUrl, "ets2").then((sourceLayer) => {
            if (!cancelled) addScsMapLayers(map, "ets2", sourceUrl, sourceLayer);
          }),
        );
      }

      if (mapAssets.ats.available) {
        const sourceUrl = absoluteApiUrl(mapAssets.ats.url);
        installs.push(
          detectPmtilesSourceLayer(sourceUrl, "ats").then((sourceLayer) => {
            if (!cancelled) addScsMapLayers(map, "ats", sourceUrl, sourceLayer);
          }),
        );
      }

      // ETS2 and ATS archives are independent. Load metadata and register both
      // vector sources in parallel instead of making ATS wait for ETS2.
      await Promise.allSettled(installs);

      if (cancelled) return;

      setScsMapVisibility(map, "ets2", gameFilter === "all" || gameFilter === "ets2");
      setScsMapVisibility(map, "ats", gameFilter === "all" || gameFilter === "ats");
      setScsMapTheme(map, "ets2", mapMode);
      setScsMapTheme(map, "ats", mapMode);
    };

    void install();
    return () => {
      cancelled = true;
    };
  }, [mapReady, mapAssets, gameFilter, mapMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    setBaseMapMode(map, mapMode);
    setScsMapTheme(map, "ets2", mapMode);
    setScsMapTheme(map, "ats", mapMode);
    window.localStorage.setItem("openhaul-map-mode", mapMode);
  }, [mapReady, mapMode]);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const loadFallback = async () => {
      try {
        const response = await fetch(restUrl, { cache: "no-store" });
        if (!response.ok) throw new Error("bad response");
        const json = await response.json();
        if (active) setDrivers(json.drivers ?? []);
      } catch {
        if (active) setStatus("API unavailable");
      }
    };

    const connect = () => {
      if (!active) return;

      try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          if (active) setStatus("Live · WebSocket");
        };

        socket.onmessage = (event) => {
          if (!active) return;
          const message = JSON.parse(event.data) as LiveMessage;

          if (message.type === "snapshot") {
            setDrivers(message.drivers);
            return;
          }

          if (message.type === "driver.position") {
            setDrivers((current) => {
              const filtered = current.filter((driver) => driver.driverId !== message.driver.driverId);
              return [...filtered, message.driver].sort((a, b) => a.username.localeCompare(b.username));
            });
            return;
          }

          if (message.type === "driver.offline") {
            setDrivers((current) => current.filter((driver) => driver.driverId !== message.driverId));
          }
        };

        socket.onerror = () => {
          if (active) setStatus("Realtime reconnecting…");
        };

        socket.onclose = () => {
          if (!active) return;
          setStatus("Realtime reconnecting…");
          void loadFallback();
          retry = setTimeout(connect, 3000);
        };
      } catch {
        void loadFallback();
        retry = setTimeout(connect, 3000);
      }
    };

    void loadFallback();
    connect();

    const fallbackTimer = setInterval(loadFallback, 15000);

    return () => {
      active = false;
      clearInterval(fallbackTimer);
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [restUrl, wsUrl]);

  useEffect(() => {
    fittedRef.current = false;
  }, [initialVtc]);

  useEffect(() => {
    if (!selectedDriverId) {
      selectedDriverLastSeenRef.current = 0;
      selectedPopupDriverIdRef.current = "";
      selectedPopupRef.current?.remove?.();
      selectedPopupRef.current = null;
      if (cameraMode !== "map") setCameraMode("map");
      return;
    }

    const stillVisible =
      visibleDrivers.some((driver) => driver.driverId === selectedDriverId) ||
      trackerDrivers.some((driver) => driver.driverId === selectedDriverId);

    if (stillVisible) {
      selectedDriverLastSeenRef.current = Date.now();
      return;
    }

    // TruckersMP area responses are replaced in batches every few seconds.
    // Do not drop follow mode during that short gap or the camera appears to
    // stop following while the next area request is in flight.
    if (
      selectedDriverLastSeenRef.current > 0 &&
      Date.now() - selectedDriverLastSeenRef.current < 90_000
    ) return;

    setSelectedDriverId("");
    setCameraMode("map");
  }, [visibleDrivers, selectedDriverId, cameraMode, trackerDrivers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    if (cameraMode === "map") {
      map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 450,
      });
    }
  }, [cameraMode, mapReady]);

  useEffect(() => {
    if (!initialDriver) return;
    setSelectedDriverId(initialDriver);
    setCameraMode("third");
    fittedRef.current = true;
  }, [initialDriver]);

  useEffect(() => {
    if (!initialMode) return;
    setMapMode(initialMode);
    const map = mapRef.current;
    if (mapReady && map) setBaseMapMode(map, initialMode);
  }, [initialMode, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    if (!selectedDriverId) {
      (map.getSource("openhaul-replay") as any)?.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    let active = true;
    const load = () => fetch(
      api + "/api/v1/public/drivers/" + encodeURIComponent(selectedDriverId) + "/replay?minutes=120&limit=1000",
      { cache: "no-store" },
    )
      .then((response) => response.ok ? response.json() : { points: [] })
      .then((data) => {
        if (!active) return;
        const coordinates = (data.points ?? []).flatMap((point: any) => {
          const position = gameCoordsToLonLat(point.game, Number(point.x), Number(point.z));
          return isValidLonLat(position) ? [position] : [];
        });
        const collection = {
          type: "FeatureCollection",
          features: coordinates.length >= 2 ? [{
            type: "Feature",
            geometry: { type: "LineString", coordinates },
            properties: { driverId: selectedDriverId },
          }] : [],
        };
        (map.getSource("openhaul-replay") as any)?.setData(collection);
      })
      .catch(() => {});

    void load();
    const timer = setInterval(load, 10_000);
    return () => { active = false; clearInterval(timer); };
  }, [mapReady, selectedDriverId]);

  useEffect(() => {
    if (!mapReady) return;

    let frame = 0;
    let lastFrameAt = 0;

    const tick = (now: number) => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) {
        frame = requestAnimationFrame(tick);
        return;
      }

      if (now - lastFrameAt < FRAME_INTERVAL_MS) {
        frame = requestAnimationFrame(tick);
        return;
      }
      lastFrameAt = now;

      const external = trackerDrivers.filter((driver) => {
        if (gameFilter !== "all" && driver.game !== gameFilter) return false;
        if (serverFilter !== "all" && (driver.server ?? "") !== serverFilter) return false;
        if (statusFilter === "driving" && Number(driver.speedKph ?? 0) <= 1) return false;
        if (statusFilter === "stopped" && Number(driver.speedKph ?? 0) > 1) return false;
        if (statusFilter === "on-job") return false;
        const needle = driverQuery.trim().toLowerCase();
        if (needle && ![
          driver.username,
          driver.driverId,
          driver.server,
          driver.truck,
        ].some((value) => String(value ?? "").toLowerCase().includes(needle))) return false;
        return true;
      });
      const visible = [...visibleDriversRef.current, ...external.filter((driver) =>
        !visibleDriversRef.current.some((local) => local.driverId === driver.driverId)
      )];
      const visibleIds = new Set(visible.map((driver) => driver.driverId));
      const rendered = interpolatedRef.current;

      for (const driver of visible) {
        let state = rendered.get(driver.driverId);

        if (!state) {
          state = {
            ...driver,
            _fromX: driver.x,
            _fromZ: driver.z,
            _fromHeading: driver.heading,
            _toX: driver.x,
            _toZ: driver.z,
            _toHeading: driver.heading,
            _startedAt: now,
            _durationMs: driver.network === "truckersmp" ? 3800 : DEFAULT_INTERPOLATION_MS,
            _targetVersion: driver.updatedAt,
          };
          rendered.set(driver.driverId, state);
        } else if (state._targetVersion !== driver.updatedAt) {
          state = {
            ...driver,
            x: state.x,
            z: state.z,
            heading: state.heading,
            _fromX: state.x,
            _fromZ: state.z,
            _fromHeading: state.heading,
            _toX: driver.x,
            _toZ: driver.z,
            _toHeading: shortestHeading(state.heading, driver.heading),
            _startedAt: now,
            // TruckersMP area data refreshes every ~4 seconds. Interpolate
            // almost the entire interval so the marker, name label, popup and
            // follow camera keep moving instead of jumping once then freezing.
            _durationMs: driver.network === "truckersmp"
              ? 3800
              : Math.max(250, Math.min(1500, DEFAULT_INTERPOLATION_MS)),
            _targetVersion: driver.updatedAt,
          };
          rendered.set(driver.driverId, state);
        }

        const elapsed = Math.max(0, now - (state._startedAt ?? now));
        const duration = Math.max(1, state._durationMs ?? DEFAULT_INTERPOLATION_MS);
        const t = Math.min(1, elapsed / duration);

        state.x = interpolate(state._fromX ?? state.x, state._toX ?? driver.x, t);
        state.z = interpolate(state._fromZ ?? state.z, state._toZ ?? driver.z, t);
        state.heading = ((interpolate(
          state._fromHeading ?? state.heading,
          state._toHeading ?? driver.heading,
          t,
        ) % 1) + 1) % 1;
      }

      for (const driverId of [...rendered.keys()]) {
        if (!visibleIds.has(driverId)) rendered.delete(driverId);
      }

      const animatedDrivers = [...rendered.values()];
      const collection = driverFeatureCollection(animatedDrivers, mapIntel.staff ?? []);
      const source = map.getSource("openhaul-drivers") as any;
      source?.setData(collection);

      const selected = selectedDriverId ? rendered.get(selectedDriverId) : undefined;

      if (selected) {
        selectedDriverLastSeenRef.current = Date.now();

        const selectedPosition = gameCoordsToLonLat(selected.game, selected.x, selected.z);
        if (
          isValidLonLat(selectedPosition) &&
          selectedPopupRef.current &&
          selectedPopupDriverIdRef.current === selected.driverId
        ) {
          selectedPopupRef.current.setLngLat(selectedPosition);
        }
      }

      if (selected && cameraMode !== "map") {
        const center = gameCoordsToLonLat(selected.game, selected.x, selected.z);

        if (isValidLonLat(center)) {
          const bearing = ((-selected.heading * 360) % 360 + 360) % 360;

          if (cameraMode === "third") {
            map.jumpTo({
              center,
              zoom: Math.max(map.getZoom(), 15.2),
              bearing,
              pitch: 62,
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
            });
          } else {
            map.jumpTo({
              center,
              zoom: Math.max(map.getZoom(), 17.3),
              bearing,
              pitch: 78,
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
            });
          }
        }
      } else {
        map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });

        if (!fittedRef.current && collection.features.length > 0) {
          const maplibregl = maplibreRef.current;
          const bounds = new maplibregl.LngLatBounds();

          for (const feature of collection.features) {
            bounds.extend(feature.geometry.coordinates);
          }

          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, {
              padding: 90,
              maxZoom: 8,
              duration: 700,
            });
            fittedRef.current = true;
          }
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mapReady, cameraMode, selectedDriverId, mapIntel.staff, trackerDrivers, gameFilter, serverFilter, statusFilter, driverQuery]);

  const focusGame = (game: GameFilter) => {
    setGameFilter(game);
    setSelectedDriverId("");
    setCameraMode("map");

    // The filter buttons own the next camera position. Prevent the animation
    // loop from immediately auto-fitting live drivers over this movement.
    fittedRef.current = true;

    const map = mapRef.current;
    if (!mapReady || !map) return;

    map.stop();
    map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });

    map.fitBounds(GAME_FOCUS_BOUNDS[game], {
      padding: game === "all" ? 55 : 80,
      duration: 850,
      pitch: 0,
      bearing: 0,
    });
  };

  const applyFilter = () => {
    const next = vtc.trim();
    window.location.href = next ? "/map?vtc=" + encodeURIComponent(next) : "/map";
  };

  const shareMap = async () => {
    const url = new URL(window.location.href);
    if (selectedDriverId) url.searchParams.set("driver", selectedDriverId);
    else url.searchParams.delete("driver");
    await navigator.clipboard?.writeText(url.toString()).catch(() => {});
    setStatus("Share link copied");
  };

  const toggleFullscreen = async () => {
    const panel = containerRef.current?.closest(".realMapPanel") as HTMLElement | null;
    if (!panel) return;
    if (!document.fullscreenElement) {
      await panel.requestFullscreen().catch(() => {});
      setFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    }
  };

  const installedMapCount = Number(Boolean(mapAssets?.ets2.available)) + Number(Boolean(mapAssets?.ats.available));
  const selectedVtc = vtcOptions.find((option) => String(option.id) === initialVtc);

  return (
    <main className={embedded ? "shell embeddedMapShell" : "shell"}>
      {!embedded ? <div className="sectionTitle">
        <div>
          <h2>{initialVtc ? (selectedVtc?.name ?? "VTC #" + initialVtc) + " live map" : "Global live map"}</h2>
          <div className="muted">
            <span style={{ color: "#54e08a" }}>● {Number(mapIntel.counts?.openHaul ?? drivers.length)} OpenHaul</span>
            {" · "}
            <span style={{ color: "#60a5fa" }}>● {trackerDrivers.length} visible TruckersMP / {trackerTotalOnline} online</span>
            {" · "}{status}{" · "}
            {installedMapCount
              ? installedMapCount + " SCS map asset" + (installedMapCount === 1 ? "" : "s")
              : "geographic fallback"}
          </div>
        </div>
      </div> : null}

      <section className={"mapPanel realMapPanel" + (embedded ? " embeddedMapPanel" : "")}>
        {!embedded ? <div className="mapToolbar">
          <input value={driverQuery} onChange={(e) => setDriverQuery(e.target.value)} placeholder="Search driver, truck, cargo, server…" aria-label="Search live drivers" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Driver status filter">
            <option value="all">All online</option>
            <option value="driving">Driving</option>
            <option value="stopped">Stopped</option>
            <option value="on-job">On job</option>
            <option value="free">No active job</option>
          </select>
          <select value={serverFilter} onChange={(e) => setServerFilter(e.target.value)} aria-label="Server filter">
            <option value="all">All servers</option>
            {serverOptions.map((server) => <option key={server} value={server}>{server}</option>)}
          </select>
          <select value={vtc} onChange={(e) => setVtc(e.target.value)} aria-label="Choose VTC live map">
            <option value="">All drivers (global map)</option>
            {vtcOptions.map((option) => (
              <option value={option.id} key={option.id}>
                {option.tag ? "[" + option.tag + "] " : ""}{option.name} ({option.memberCount ?? 0} members)
              </option>
            ))}
            {initialVtc && !vtcOptions.some((option) => String(option.id) === initialVtc) ? (
              <option value={initialVtc}>VTC #{initialVtc}</option>
            ) : null}
          </select>
          <button className="button" onClick={applyFilter}>Apply</button>
          <button className={"button " + (gameFilter === "all" ? "primary" : "")} onClick={() => focusGame("all")}>All</button>
          <button className={"button " + (gameFilter === "ets2" ? "primary" : "")} onClick={() => focusGame("ets2")}>ETS2</button>
          <button className={"button " + (gameFilter === "ats" ? "primary" : "")} onClick={() => focusGame("ats")}>ATS</button>
          <span className="mapToolbarDivider" aria-hidden="true" />
          <button className={"button mapModeButton " + (mapMode === "road" ? "primary" : "")} onClick={() => setMapMode("road")}>🗺 Road</button>
          <button className={"button mapModeButton " + (mapMode === "satellite" ? "primary" : "")} onClick={() => setMapMode("satellite")}>🛰 Satellite</button>
          <button className={"button mapModeButton " + (mapMode === "xray" ? "primary" : "")} onClick={() => setMapMode("xray")}>◉ X-Ray</button>
          <span className="mapToolbarDivider" aria-hidden="true" />
          <button className={"button mapModeButton " + (cameraMode === "map" ? "primary" : "")} onClick={() => setCameraMode("map")}>⬆ Map View</button>
          <button className={"button mapModeButton " + (cameraMode === "third" ? "primary" : "")} disabled={!selectedDriverId} onClick={() => setCameraMode("third")}>🚛 3rd Person</button>
          <button className={"button mapModeButton " + (cameraMode === "first" ? "primary" : "")} disabled={!selectedDriverId} onClick={() => setCameraMode("first")}>👁 1st Person</button>
          <span className="mapToolbarDivider" aria-hidden="true" />
          <button className="button" onClick={() => void shareMap()}>{selectedDriverId ? "🔗 Share driver" : "🔗 Share map"}</button>
          <button className="button" onClick={() => void toggleFullscreen()}>{fullscreen ? "Exit fullscreen" : "Full screen"}</button>
        </div> : null}

        {!embedded ? <div className="mapCameraStatus">
          {selectedDriverId
            ? (() => {
                const selected =
                  visibleDrivers.find((driver) => driver.driverId === selectedDriverId) ??
                  trackerDrivers.find((driver) => driver.driverId === selectedDriverId);
                return selected
                  ? "Following " + selected.username + " · " + (cameraMode === "map" ? "selected" : cameraMode === "third" ? "3rd Person" : "1st Person")
                  : "Selected driver unavailable";
              })()
            : "Select a truck marker or driver below to enable 1st/3rd person follow."}
        </div> : null}
        <div ref={containerRef} className="mapCanvas" />
      </section>

      {!embedded ? <div className="driverList" style={{ padding: "14px 0 50px" }}>
        {visibleDrivers.map((driver) => (
          <article
            className={"driver mapDriverRow " + (selectedDriverId === driver.driverId ? "selectedDriver" : "")}
            key={driver.driverId}
            onClick={() => setSelectedDriverId(driver.driverId)}
          >
            <div>
              <strong>{driver.username}</strong>
              <small>{driver.vtcTag ? "[" + driver.vtcTag + "] " : ""}{driver.vtcName ?? "Independent"}</small>
            </div>
            <div>
              <span className="pill">{driver.game.toUpperCase()}</span>
              <small>{driver.server ?? "Local / unknown server"}</small>
            </div>
            <div>
              <strong>{Math.round(driver.speedKph)} km/h</strong>
              <small>{driver.truck ?? "Unknown truck"}</small>
            </div>
            <div>
              <strong>{driver.cargo ?? "No cargo"}</strong>
              <small>{driver.sourceCity && driver.destinationCity ? driver.sourceCity + " → " + driver.destinationCity : "Route unavailable"}</small>
            </div>
            <button
              className="button"
              onClick={(event) => {
                event.stopPropagation();
                setSelectedDriverId(driver.driverId);
                setCameraMode("third");
              }}
            >
              Follow
            </button>
          </article>
        ))}
      </div> : null}
    </main>
  );
}
