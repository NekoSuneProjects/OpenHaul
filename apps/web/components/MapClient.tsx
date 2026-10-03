"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  server?: string | null;
  updatedAt: string;
};

type LiveMessage =
  | { type: "snapshot"; drivers: Driver[] }
  | { type: "driver.position"; driver: Driver }
  | { type: "driver.offline"; driverId: string };

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function toWsUrl(base: string) {
  if (base.startsWith("https://")) return "wss://" + base.slice(8);
  if (base.startsWith("http://")) return "ws://" + base.slice(7);
  return base;
}

export function MapClient() {
  const params = useSearchParams();
  const initialVtc = params.get("vtc") ?? "";
  const [vtc, setVtc] = useState(initialVtc);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [status, setStatus] = useState("Connecting…");

  const restUrl = useMemo(() => {
    const qs = initialVtc ? `?vtc=${encodeURIComponent(initialVtc)}` : "";
    return `${api}/api/v1/public/live${qs}`;
  }, [initialVtc]);

  const wsUrl = useMemo(() => {
    const qs = initialVtc ? `?vtc=${encodeURIComponent(initialVtc)}` : "";
    return `${toWsUrl(api)}/api/v1/public/live/ws${qs}`;
  }, [initialVtc]);

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

  const applyFilter = () => {
    const next = vtc.trim();
    window.location.href = next ? `/map?vtc=${encodeURIComponent(next)}` : "/map";
  };

  return (
    <main className="shell">
      <div className="sectionTitle">
        <div>
          <h2>{initialVtc ? `VTC #${initialVtc} live map` : "Global live map"}</h2>
          <div className="muted">{drivers.length} drivers · {status}</div>
        </div>
      </div>

      <section className="mapPanel">
        <div className="mapToolbar">
          <input value={vtc} onChange={(e) => setVtc(e.target.value)} placeholder="VTC ID (blank = global)" />
          <button className="button" onClick={applyFilter}>Apply</button>
        </div>

        <div className="driverList">
          {drivers.length === 0 && <div className="muted">No live OpenHaul drivers in this view yet.</div>}
          {drivers.map((driver) => (
            <article className="driver" key={driver.driverId}>
              <div>
                <strong>{driver.username}</strong>
                <small>{driver.vtcTag ? `[${driver.vtcTag}] ` : ""}{driver.vtcName ?? "Independent"}</small>
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
                <small>{driver.sourceCity && driver.destinationCity ? `${driver.sourceCity} → ${driver.destinationCity}` : "Route unavailable"}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <p className="muted" style={{ padding: "16px 2px 50px" }}>
        Realtime driver updates now use WebSockets with a REST fallback. Geographic ETS2/ATS tiles and game-coordinate transforms are the next map-rendering milestone.
      </p>
    </main>
  );
}
