"use client";

import { useEffect, useState } from "react";
const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function FuelStationPage() {
  const [prices, setPrices] = useState<any[]>([]);
  useEffect(() => {
    fetch(api + "/api/v1/public/fuel-prices", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { prices: [] })
      .then((data) => setPrices(data.prices ?? []));
  }, []);
  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Fuel Station</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>Community fuel prices.</h1>
        <p className="lede">Self-hosters and OpenHaul admins can publish reliable fuel-price records when a source is available.</p>
      </section>
      <section className="driverList" style={{ padding: "0 0 60px" }}>
        {prices.length === 0 ? <article className="card"><p>No fuel prices have been published yet.</p></article> : null}
        {prices.map((record) => (
          <article className="driver" key={record.id}>
            <div><strong>{record.data?.station || record.data?.city || record.key}</strong><small>{record.data?.country || record.data?.game || ""}</small></div>
            <div><strong>{record.data?.price ?? "—"} {record.data?.currency ?? ""}</strong><small>{record.data?.unit || "per litre/gallon"}</small></div>
            <div><small>{record.data?.source || "OpenHaul published data"}</small></div>
            <div><small>{new Date(record.updatedAt).toLocaleString()}</small></div>
          </article>
        ))}
      </section>
    </main>
  );
}
