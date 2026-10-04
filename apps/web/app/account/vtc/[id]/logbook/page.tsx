"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function VtcLogbookPage() {
  const params = useParams<{ id: string }>();
  const id = useMemo(() => String(params.id), [params.id]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("all");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("Loading VTC logbook…");

  const search = useMemo(() => {
    const value = new URLSearchParams();
    if (query.trim()) value.set("q", query.trim());
    if (game !== "all") value.set("game", game);
    value.set("page", String(page));
    value.set("pageSize", "25");
    return value;
  }, [query, game, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(api + "/api/v1/account/vtcs/" + id + "/logbook?" + search.toString(), {
        credentials: "include",
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) throw new Error("vtc logbook");
        return response.json();
      }).then((data) => {
        setJobs(data.jobs ?? []);
        setPagination(data.pagination ?? { page: 1, pages: 1, total: 0 });
        setStatus("");
      }).catch(() => setStatus("Unable to load this VTC logbook."));
    }, 200);
    return () => clearTimeout(timer);
  }, [id, search]);

  const exportUrl = (format: "csv" | "json") => {
    const value = new URLSearchParams();
    value.set("format", format);
    if (game !== "all") value.set("game", game);
    return api + "/api/v1/account/vtcs/" + id + "/logbook/export?" + value.toString();
  };

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">VTC logbook</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>Company delivery history.</h1>
        <p className="lede">{pagination.total.toLocaleString()} deliveries available to VTC staff.</p>
        <div className="actions">
          <Link className="button" href={"/account/vtc/" + id}>Back to VTC dashboard</Link>
          <a className="button" href={exportUrl("csv")}>Export CSV</a>
          <a className="button" href={exportUrl("json")}>Export JSON</a>
        </div>
      </section>

      <section className="card logbookFilters">
        <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Job ID, driver SteamID, city or cargo…" />
        <select value={game} onChange={(event) => { setGame(event.target.value); setPage(1); }}>
          <option value="all">All games</option>
          <option value="ets2">ETS2</option>
          <option value="ats">ATS</option>
        </select>
      </section>

      {status ? <p className="muted">{status}</p> : null}

      <section className="driverList" style={{ padding: 0 }}>
        {jobs.map((job) => (
          <article className="driver" key={job.id}>
            <div><strong>#{job.id} · {job.cargo || "Unknown cargo"}</strong><small>{job.driverId} · {String(job.game ?? "").toUpperCase()}</small></div>
            <div><strong>{job.sourceCity || "Unknown"} → {job.destinationCity || "Unknown"}</strong></div>
            <div><strong>{Math.round(Number(job.distanceKm ?? 0)).toLocaleString()} km</strong><small>Distance</small></div>
            <div><strong>{Number(job.income ?? 0).toLocaleString()}</strong><small>{job.completedAt ? new Date(job.completedAt).toLocaleString() : "Completed"}</small></div>
          </article>
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
