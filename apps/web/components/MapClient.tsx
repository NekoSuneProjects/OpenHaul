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

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const customStyle = process.env.NEXT_PUBLIC_MAP_STYLE_URL;

function toWsUrl(base: string) {
  if (base.startsWith("https://")) return "wss://" + base.slice(8);
  if (base.startsWith("http://")) return "ws://" + base.slice(7);
  return base;
}

function defaultMapStyle() {
  return {
    version: 8 as const,
    sources: {
      osm: {
        type: "raster" as const,
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [
      {
        id: "osm",
        type: "raster" as const,
        source: "osm",
      },
    ],
  };
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

export function MapClient() {
  const params = useSearchParams();
  const initialVtc = params.get("vtc") ?? "";
  const [vtc, setVtc] = useState(initialVtc);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [gameFilter, setGameFilter] = useState<GameFilter>("all");
  const [mapReady, setMapReady] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const maplibreRef = useRef<any>(null);
  const fittedRef = useRef(false);

  const visibleDrivers = useMemo(
    () => gameFilter === "all" ? drivers : drivers.filter((driver) => driver.game === gameFilter),
    [drivers, gameFilter],
  );

  const restUrl = useMemo(() => {
    const qs = initialVtc ? "?vtc=" + encodeURIComponent(initialVtc) : "";
    return api + "/api/v1/public/live" + qs;
  }, [initialVtc]);

  const wsUrl = useMemo(() => {
    const qs = initialVtc ? "?vtc=" + encodeURIComponent(initialVtc) : "";
    return toWsUrl(api) + "/api/v1/public/live/ws" + qs;
  }, [initialVtc]);

  useEffect(() => {
    let disposed = false;

    async function createMap() {
      if (!containerRef.current || mapRef.current) return;

      const maplibregl = await import("maplibre-gl");
      if (disposed || !containerRef.current) return;

      maplibreRef.current = maplibregl;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: customStyle || defaultMapStyle(),
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
        setMapReady(true);
      });
    }

    void createMap();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
      setMapReady(false);
    };
  }, []);

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
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!map || !maplibregl || !map.isStyleLoaded()) return;

    const collection = driverFeatureCollection(visibleDrivers);
    const source = map.getSource("openhaul-drivers") as any;
    source?.setData(collection);

    if (!fittedRef.current && collection.features.length > 0) {
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
  }, [visibleDrivers, mapReady]);

  const applyFilter = () => {
    const next = vtc.trim();
    window.location.href = next ? "/map?vtc=" + encodeURIComponent(next) : "/map";
  };

  return (
    <main className="shell">
      <div className="sectionTitle">
        <div>
          <h2>{initialVtc ? "VTC #" + initialVtc + " live map" : "Global live map"}</h2>
          <div className="muted">{visibleDrivers.length} drivers · {status}</div>
        </div>
      </div>

      <section className="mapPanel realMapPanel">
        <div className="mapToolbar">
          <input value={vtc} onChange={(e) => setVtc(e.target.value)} placeholder="VTC ID (blank = global)" />
          <button className="button" onClick={applyFilter}>Apply</button>
          <button className={"button " + (gameFilter === "all" ? "primary" : "")} onClick={() => setGameFilter("all")}>All</button>
          <button className={"button " + (gameFilter === "ets2" ? "primary" : "")} onClick={() => setGameFilter("ets2")}>ETS2</button>
          <button className={"button " + (gameFilter === "ats" ? "primary" : "")} onClick={() => setGameFilter("ats")}>ATS</button>
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
