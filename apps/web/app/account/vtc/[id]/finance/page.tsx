"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function VtcFinancePage() {
  const params = useParams<{ id: string }>();
  const id = useMemo(() => String(params.id), [params.id]);
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(api + "/api/v1/account/vtcs/" + id + "/financial-report?period=" + period, {
      credentials: "include",
      cache: "no-store",
    }).then((r) => r.ok ? r.json() : null).then(setData);
  }, [id, period]);

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">VTC Financial Reports</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>Company economy.</h1>
        <div className="actions"><Link className="button" href={"/account/vtc/" + id}>Back to VTC</Link></div>
      </section>

      <section className="card" style={{ marginBottom: 18 }}>
        <select value={period} onChange={(event) => setPeriod(event.target.value)}>
          <option value="day">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="year">This year</option>
        </select>
      </section>

      <section className="grid">
        <article className="card"><h3>{data?.jobs ?? 0}</h3><p>Jobs</p></article>
        <article className="card"><h3>{Math.round(Number(data?.distanceKm ?? 0)).toLocaleString()} km</h3><p>Distance</p></article>
        <article className="card"><h3>{Number(data?.income ?? 0).toLocaleString()}</h3><p>Income</p></article>
        <article className="card"><h3>{Number(data?.jobExpenses ?? 0).toLocaleString()}</h3><p>Job expenses</p></article>
        <article className="card"><h3>{Number(data?.penalties ?? 0).toLocaleString()}</h3><p>Penalties</p></article>
        <article className="card"><h3>{Number(data?.profit ?? 0).toLocaleString()}</h3><p>Profit</p></article>
        <article className="card"><h3>{Number(data?.ledgerNet ?? 0).toLocaleString()}</h3><p>Ledger net</p></article>
      </section>
    </main>
  );
}
