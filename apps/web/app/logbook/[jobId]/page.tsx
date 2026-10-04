"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = useMemo(() => String(params.jobId), [params.jobId]);
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState("Loading job…");

  useEffect(() => {
    fetch(api + "/api/v1/account/logbook/" + encodeURIComponent(jobId), {
      credentials: "include",
      cache: "no-store",
    }).then(async (response) => {
      if (response.status === 401) {
        window.location.href = "/account";
        return null;
      }
      if (!response.ok) throw new Error("job");
      return response.json();
    }).then((value) => {
      if (!value) return;
      setData(value);
      setStatus("");
    }).catch(() => setStatus("Unable to load this job."));
  }, [jobId]);

  if (!data) {
    return <main className="shell"><section className="hero"><h1>{status}</h1></section></main>;
  }

  const job = data.job ?? {};
  const expenses = data.expenses ?? {};

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Delivery #{job.id}</span>
        <h1 style={{ fontSize: "clamp(2.7rem,7vw,5rem)" }}>{job.cargo || "Unknown cargo"}</h1>
        <p className="lede">{job.sourceCity || "Unknown"} → {job.destinationCity || "Unknown"}</p>
        <div className="actions">
          <Link className="button" href="/logbook">Back to logbook</Link>
        </div>
      </section>

      <section className="grid">
        <article className="card"><h3>{String(job.game ?? "").toUpperCase()}</h3><p>Game</p></article>
        <article className="card"><h3>{Math.round(Number(job.distanceKm ?? 0)).toLocaleString()} km</h3><p>Distance</p></article>
        <article className="card"><h3>{Number(job.income ?? 0).toLocaleString()}</h3><p>Gross income</p></article>
        <article className="card"><h3>{Number(expenses.total ?? 0).toLocaleString()}</h3><p>Tracked expenses</p></article>
        <article className="card"><h3>{Number(expenses.netProfit ?? 0).toLocaleString()}</h3><p>Net profit</p></article>
      </section>

      <div className="sectionTitle"><h2>Route & companies</h2></div>
      <section className="card">
        <p><strong>{job.sourceCompany || "Unknown company"}</strong> · {job.sourceCity || "Unknown city"}</p>
        <p>↓</p>
        <p><strong>{job.destinationCompany || "Unknown company"}</strong> · {job.destinationCity || "Unknown city"}</p>
        <p className="muted">Completed {job.completedAt ? new Date(job.completedAt).toLocaleString() : "at an unknown time"}</p>
      </section>

      <div className="sectionTitle"><h2>Job timeline</h2></div>
      <section className="driverList" style={{ padding: "0 0 60px" }}>
        {(data.timeline ?? []).map((event: any, index: number) => (
          <article className="driver" key={String(event.type) + String(event.at) + index}>
            <div><strong>{String(event.title ?? event.type).replaceAll("_", " ")}</strong><small>{event.type}</small></div>
            <div><small>{new Date(event.at).toLocaleString()}</small></div>
            <div><strong>{event.amount == null ? "" : Number(event.amount).toLocaleString() + " " + (event.currency || "")}</strong></div>
            <div />
          </article>
        ))}
      </section>
    </main>
  );
}
