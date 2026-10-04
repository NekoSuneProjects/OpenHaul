"use client";

import { useEffect, useState } from "react";
const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function EconomyPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch(api + "/api/v1/account/economy", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) { window.location.href = "/account"; return null; }
        return r.ok ? r.json() : null;
      })
      .then(setData);
  }, []);
  if (!data) return <main className="shell"><section className="hero"><h1>Loading economy…</h1></section></main>;
  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Driver economy</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>Income, expenses & penalties.</h1>
      </section>
      <section className="grid">
        <article className="card"><h3>{data.jobs}</h3><p>Approved jobs</p></article>
        <article className="card"><h3>{Number(data.grossIncome).toLocaleString()}</h3><p>Gross income</p></article>
        <article className="card"><h3>{Number(data.jobExpenses).toLocaleString()}</h3><p>Fuel/repair/toll/job expenses</p></article>
        <article className="card"><h3>{Number(data.penalties).toLocaleString()}</h3><p>Fines / penalties</p></article>
        <article className="card"><h3>{Number(data.net).toLocaleString()}</h3><p>Net</p></article>
      </section>
    </main>
  );
}
