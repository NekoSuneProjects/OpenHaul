"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { gameCoordsToLonLat, isValidLonLat } from "../lib/gameProjection";

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
  server?: string | null;
  updatedAt: string;
};

type LiveMessage =
  | { type: "snapshot"; drivers: Driver[] }
  | { type: "driver.position"; driver: Driver }
  | { type: "driver.offline"; driverId: string };

type GameFilter = "all" | "ets2" | "ats";
type MapMode = "road" | "satellite" | "xray";

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

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const roadTileUrl =
  process.env.NEXT_PUBLIC_MAP_ROAD_TILE_URL ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const satelliteTileUrl =
  process.env.NEXT_PUBLIC_MAP_SATELLITE_TILE_URL ??
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_INTERPOLATION_MS = 1000;
const FRAME_INTERVAL_MS = 33;

function toWsUrl(base: string) {
  if (base.startsWith("https://")) return "wss://" + base.slice(8);
  if (base.startsWith("http://")) return "ws://" + base.slice(7);
  return base;
}

function absoluteApiUrl(relative: string) {
  return new URL(relative, api.endsWith("/") ? api : api + "/").toString();
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
          "raster-opacity": 0.92,
          "raster-saturation": -0.25,
          "raster-brightness-max": 0.82,
        },
      },
      {
        id: "openhaul-satellite-base",
        type: "raster" as const,
        source: "openhaul-satellite-base",
        layout: { visibility: "none" as const },
        paint: {
          "raster-opacity": 1,
          "raster-saturation": -0.08,
          "raster-contrast": 0.08,
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

function driverFeatureCollection(drivers: Driver[]) {
  return {
    type: "FeatureCollection" as const,
    features: drivers.flatMap((driver) => {
      const position = gameCoordsToLonLat(driver.game, driver.x, driver.z);
      if (!isValidLonLat(position)) return [];

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
          vtc: driver.vtcName ?? "Independent",
          vtcTag: driver.vtcTag ?? "",
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
    map.setPaintProperty(sourceId + "-road-case", "line-color", mode === "xray" ? "#00150a" : "#07110c");
    map.setPaintProperty(sourceId + "-road-case", "line-opacity", mode === "satellite" ? 1 : 0.95);
  }

  if (map.getLayer(sourceId + "-roads")) {
    map.setPaintProperty(sourceId + "-roads", "line-color", [
      "match",
      ["get", "roadType"],
      "freeway", mode === "xray" ? "#63ff9c" : "#54e08a",
      "expressway", mode === "xray" ? "#87ffc0" : "#6bd995",
      "local", mode === "xray" ? "#d8ffe7" : "#b5c7bd",
      "no_vehicles", "#6f8076",
      "unknown", "#87968e",
      mode === "xray" ? "#f2fff7" : "#dce8e1",
    ]);
    map.setPaintProperty(sourceId + "-roads", "line-opacity", mode === "satellite" ? 1 : 0.96);
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

function addScsMapLayers(map: any, game: "ets2" | "ats", sourceUrl: string) {
  const sourceId = "openhaul-" + game + "-map";
  const source = map.getSource(sourceId);
  if (source) {
    if (source.serialize().url !== "pmtiles://" + sourceUrl) source.setUrl("pmtiles://" + sourceUrl);
    return;
  }

  map.addSource(sourceId, {
    type: "vector",
    url: "pmtiles://" + sourceUrl,
    attribution: "SCS Software · Map conversion by TruckSim Maps",
  });

  const beforeDriver = map.getLayer("openhaul-driver-dot") ? "openhaul-driver-dot" : undefined;
  const addMapLayer = (layer: any) => map.addLayer(layer, beforeDriver);

  addMapLayer({
    id: sourceId + "-prefabs",
    type: "fill",
    source: sourceId,
    "source-layer": game,
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
    "source-layer": game,
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
    "source-layer": game,
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
    "source-layer": game,
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
    "source-layer": game,
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
    "source-layer": game,
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
  const [vtc, setVtc] = useState(initialVtc);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [gameFilter, setGameFilter] = useState<GameFilter>("all");
  const [mapMode, setMapMode] = useState<MapMode>("road");
  const [mapReady, setMapReady] = useState(false);
  const [mapAssets, setMapAssets] = useState<MapAssets | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const maplibreRef = useRef<any>(null);
  const protocolRef = useRef<any>(null);
  const fittedRef = useRef(false);
  const visibleDriversRef = useRef<Driver[]>([]);
  const interpolatedRef = useRef<Map<string, InterpolatedDriver>>(new Map());

  const visibleDrivers = useMemo(
    () => gameFilter === "all" ? drivers : drivers.filter((driver) => driver.game === gameFilter),
    [drivers, gameFilter],
  );

  useEffect(() => {
    visibleDriversRef.current = visibleDrivers;
  }, [visibleDrivers]);

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
      });

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

      map.on("load", () => {
        if (!map.getSource("openhaul-drivers")) {
          map.addSource("openhaul-drivers", {
            type: "geojson",
            data: driverFeatureCollection([]),
          });
        }

        map.addLayer({
          id: "openhaul-driver-dot",
          type: "circle",
          source: "openhaul-drivers",
          paint: {
            "circle-radius": 10,
            "circle-color": [
              "match",
              ["get", "game"],
              "ets2", "#54e08a",
              "ats", "#f0b35a",
              "#ffffff",
            ],
            "circle-stroke-color": "#06110c",
            "circle-stroke-width": 3,
          },
        });

        map.addLayer({
          id: "openhaul-driver-heading",
          type: "symbol",
          source: "openhaul-drivers",
          layout: {
            "text-field": "▲",
            "text-size": 16,
            "text-rotate": ["get", "rotation"],
            "text-rotation-alignment": "map",
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": "#06110c",
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

          const properties = feature.properties || {};
          const coordinates = feature.geometry.coordinates as [number, number];

          const card = document.createElement("div");
          card.className = "mapPopup";

          const title = document.createElement("strong");
          title.textContent = String(properties.username || properties.driverId || "Driver");
          card.appendChild(title);

          const lines = [
            String(properties.vtcTag ? "[" + properties.vtcTag + "] " : "") + String(properties.vtc || "Independent"),
            String(properties.game || "").toUpperCase() + " · " + Math.round(Number(properties.speedKph || 0)) + " km/h",
            String(properties.truck || "Unknown truck"),
            String(properties.cargo || "No cargo"),
            Number(properties.rpm || 0) > 0 ? Math.round(Number(properties.rpm)) + " RPM · " + Math.round(Number(properties.fuel || 0)) + " L fuel" : "",
            Number(properties.navigationDistanceM || 0) > 0 ? Math.round(Number(properties.navigationDistanceM) / 1000) + " km remaining · " + Math.round(Number(properties.speedLimitKph || 0)) + " km/h limit" : "",
            String(properties.route || properties.server || ""),
          ].filter(Boolean);

          for (const line of lines) {
            const row = document.createElement("div");
            row.textContent = line;
            card.appendChild(row);
          }

          new maplibregl.Popup({ offset: 16 })
            .setLngLat(coordinates)
            .setDOMContent(card)
            .addTo(map);
        });

        mapRef.current = map;
        const initialMode =
          (window.localStorage.getItem("openhaul-map-mode") as MapMode | null) ?? "road";
        setBaseMapMode(map, initialMode);
        setMapReady(true);
      });
    }

    void createMap();

    return () => {
      disposed = true;
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
    const map = mapRef.current;
    if (!mapReady || !map || !mapAssets) return;

    if (mapAssets.ets2.available) {
      addScsMapLayers(map, "ets2", absoluteApiUrl(mapAssets.ets2.url));
    }

    if (mapAssets.ats.available) {
      addScsMapLayers(map, "ats", absoluteApiUrl(mapAssets.ats.url));
    }

    setScsMapVisibility(map, "ets2", gameFilter === "all" || gameFilter === "ets2");
    setScsMapVisibility(map, "ats", gameFilter === "all" || gameFilter === "ats");
    setScsMapTheme(map, "ets2", mapMode);
    setScsMapTheme(map, "ats", mapMode);
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
  }, [initialVtc, gameFilter]);

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

      const visible = visibleDriversRef.current;
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
            _durationMs: DEFAULT_INTERPOLATION_MS,
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
            _durationMs: Math.max(250, Math.min(1500, DEFAULT_INTERPOLATION_MS)),
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
      const collection = driverFeatureCollection(animatedDrivers);
      const source = map.getSource("openhaul-drivers") as any;
      source?.setData(collection);

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

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mapReady]);

  const applyFilter = () => {
    const next = vtc.trim();
    window.location.href = next ? "/map?vtc=" + encodeURIComponent(next) : "/map";
  };

  const installedMapCount = Number(Boolean(mapAssets?.ets2.available)) + Number(Boolean(mapAssets?.ats.available));

  return (
    <main className="shell">
      <div className="sectionTitle">
        <div>
          <h2>{initialVtc ? "VTC #" + initialVtc + " live map" : "Global live map"}</h2>
          <div className="muted">
            {visibleDrivers.length} drivers · {status} · {installedMapCount
              ? installedMapCount + " SCS map asset" + (installedMapCount === 1 ? "" : "s")
              : "geographic fallback"}
          </div>
        </div>
      </div>

      <section className="mapPanel realMapPanel">
        <div className="mapToolbar">
          <input value={vtc} onChange={(e) => setVtc(e.target.value)} placeholder="VTC ID (blank = global)" />
          <button className="button" onClick={applyFilter}>Apply</button>
          <button className={"button " + (gameFilter === "all" ? "primary" : "")} onClick={() => setGameFilter("all")}>All</button>
          <button className={"button " + (gameFilter === "ets2" ? "primary" : "")} onClick={() => setGameFilter("ets2")}>ETS2</button>
          <button className={"button " + (gameFilter === "ats" ? "primary" : "")} onClick={() => setGameFilter("ats")}>ATS</button>
          <span className="mapToolbarDivider" aria-hidden="true" />
          <button className={"button mapModeButton " + (mapMode === "road" ? "primary" : "")} onClick={() => setMapMode("road")}>🗺 Road</button>
          <button className={"button mapModeButton " + (mapMode === "satellite" ? "primary" : "")} onClick={() => setMapMode("satellite")}>🛰 Satellite</button>
          <button className={"button mapModeButton " + (mapMode === "xray" ? "primary" : "")} onClick={() => setMapMode("xray")}>◉ X-Ray</button>
        </div>

        <div ref={containerRef} className="mapCanvas" />
      </section>

      <div className="driverList" style={{ padding: "14px 0 50px" }}>
        {visibleDrivers.map((driver) => (
          <article className="driver" key={driver.driverId}>
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
          </article>
        ))}
      </div>
    </main>
  );
}
