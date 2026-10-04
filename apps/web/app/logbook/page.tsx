"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function LogbookPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("Loading logbook…");

  const params = useMemo(() => {
    const value = new URLSearchParams();
    if (query.trim()) value.set("q", query.trim());
    if (game !== "all") value.set("game", game);
    if (from) value.set("from", new Date(from + "T00:00:00").toISOString());
    if (to) value.set("to", new Date(to + "T23:59:59").toISOString());
    value.set("page", String(page));
    value.set("pageSize", "25");
    return value;
  }, [query, game, from, to, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(api + "/api/v1/account/logbook?" + params.toString(), {
        credentials: "include",
        cache: "no-store",
      }).then(async (response) => {
        if (response.status === 401) {
          window.location.href = "/account";
          return null;
        }
        if (!response.ok) throw new Error("logbook");
        return response.json();
      }).then((data) => {
        if (!data) return;
        setJobs(data.jobs ?? []);
        setPagination(data.pagination ?? { page: 1, pages: 1, total: 0 });
        setStatus("");
      }).catch(() => setStatus("Unable to load logbook."));
    }, 200);

    return () => clearTimeout(timer);
  }, [params]);

  const exportUrl = (format: "json" | "csv") => {
    const value = new URLSearchParams();
    value.set("format", format);
    if (game !== "all") value.set("game", game);
    return api + "/api/v1/account/logbook/export?" + value.toString();
  };

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Driver logbook</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>Every delivery, searchable.</h1>
        <p className="lede">{pagination.total.toLocaleString()} logged deliveries with filters, pagination and export.</p>
        <div className="actions">
          <a className="button" href={exportUrl("csv")}>Export CSV</a>
          <a className="button" href={exportUrl("json")}>Export JSON</a>
        </div>
      </section>

      <section className="card" style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(220px,1fr) 140px 160px 160px", marginBottom: 18 }}>
        <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Job ID, city, company or cargo…" />
        <select value={game} onChange={(event) => { setGame(event.target.value); setPage(1); }}>
          <option value="all">All games</option>
          <option value="ets2">ETS2</option>
          <option value="ats">ATS</option>
        </select>
        <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
        <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
      </section>

      {status ? <p className="muted">{status}</p> : null}

      <section className="driverList" style={{ padding: 0 }}>
        {jobs.map((job) => (
          <Link className="driver" key={job.id} href={"/logbook/" + job.id}>
            <div><strong>#{job.id} · {job.cargo || "Unknown cargo"}</strong><small>{String(job.game ?? "").toUpperCase()}</small></div>
            <div><strong>{job.sourceCity || "Unknown"} → {job.destinationCity || "Unknown"}</strong><small>{job.sourceCompany || "—"} → {job.destinationCompany || "—"}</small></div>
            <div><strong>{Math.round(Number(job.distanceKm ?? 0)).toLocaleString()} km</strong><small>Distance</small></div>
            <div><strong>{Number(job.income ?? 0).toLocaleString()}</strong><small>{job.completedAt ? new Date(job.completedAt).toLocaleString() : "Completed"}</small></div>
          </Link>
        ))}
      </section>

      <section className="card" style={{ margin: "18px 0 60px" }}>
        <div className="actions">
          <button className="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
          <span className="pill">Page {pagination.page} / {pagination.pages}</span>
          <button className="button" disabled={page >= pagination.pages} onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))}>Next</button>
        </div>
      </section>
    </main>
  );
}
