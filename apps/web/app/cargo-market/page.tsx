"use client";

import { useEffect, useState } from "react";
const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function CargoMarketPage() {
  const [data, setData] = useState<any>({ cargo: [], routes: [] });
  useEffect(() => {
    fetch(api + "/api/v1/public/cargo-market", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { cargo: [], routes: [] })
      .then(setData);
  }, []);
  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Cargo Market</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>What OpenHaul drivers are hauling.</h1>
        <p className="lede">Collected job telemetry powers popular cargo and route statistics.</p>
      </section>
      <div className="sectionTitle"><h2>Popular cargo</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {(data.cargo ?? []).map((row: any) => (
          <article className="driver" key={row.cargo}>
            <div><strong>{row.cargo}</strong></div>
            <div><strong>{row.jobs}</strong><small>Jobs</small></div>
            <div><strong>{Math.round(Number(row.distanceKm || 0)).toLocaleString()} km</strong><small>Distance</small></div>
            <div><strong>{Math.round(Number(row.averageMassKg || 0)).toLocaleString()} kg</strong><small>Avg mass</small></div>
          </article>
        ))}
      </section>
      <div className="sectionTitle"><h2>Popular routes</h2></div>
      <section className="driverList" style={{ padding: "0 0 60px" }}>
        {(data.routes ?? []).map((row: any, index: number) => (
          <article className="driver" key={index}>
            <div><strong>{row.sourceCity} → {row.destinationCity}</strong></div>
            <div><strong>{row.jobs}</strong><small>Jobs</small></div>
            <div><strong>{Math.round(Number(row.distanceKm || 0)).toLocaleString()} km</strong><small>Distance</small></div>
            <div><strong>{Number(row.income || 0).toLocaleString()}</strong><small>Income</small></div>
          </article>
        ))}
      </section>
    </main>
  );
}
