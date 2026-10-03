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
  speedKph: number;
  truck?: string | null;
  cargo?: string | null;
  sourceCity?: string | null;
  destinationCity?: string | null;
  server?: string | null;
  updatedAt: string;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function MapPage() {
  const params = useSearchParams();
  const initialVtc = params.get("vtc") ?? "";
  const [vtc, setVtc] = useState(initialVtc);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [status, setStatus] = useState("Connecting…");

  const url = useMemo(() => {
    const qs = initialVtc ? `?vtc=${encodeURIComponent(initialVtc)}` : "";
    return `${api}/api/v1/public/live${qs}`;
  }, [initialVtc]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error("bad response");
        const json = await response.json();
        if (active) {
          setDrivers(json.drivers ?? []);
          setStatus("Live");
        }
      } catch {
        if (active) setStatus("API unavailable");
      }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [url]);

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
              <div><strong>{driver.username}</strong><small>{driver.vtcTag ? `[${driver.vtcTag}] ` : ""}{driver.vtcName ?? "Independent"}</small></div>
              <div><span className="pill">{driver.game.toUpperCase()}</span><small>{driver.server ?? "Local / unknown server"}</small></div>
              <div><strong>{Math.round(driver.speedKph)} km/h</strong><small>{driver.truck ?? "Unknown truck"}</small></div>
              <div><strong>{driver.cargo ?? "No cargo"}</strong><small>{driver.sourceCity && driver.destinationCity ? `${driver.sourceCity} → ${driver.destinationCity}` : "Route unavailable"}</small></div>
            </article>
          ))}
        </div>
      </section>

      <p className="muted" style={{padding:"16px 2px 50px"}}>
        Geographic ETS2/ATS map tiles and coordinate transforms are the next mapping milestone. This page already uses the production live-data contract and VTC filter.
      </p>
    </main>
  );
}
