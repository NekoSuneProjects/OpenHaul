"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

type DashboardData = {
  user: any;
  live?: any;
  memberships?: any[];
  progression?: { xp: number; level: number; currentLevelXp: number; nextLevelXp: number; progress: number };
  totals?: { jobs: number; distanceKm: number; income: number; fines: number; fineAmount: number; netIncome: number };
  month?: { jobs: number; distanceKm: number; income: number; fineAmount: number; netIncome: number };
  career?: { firstDeliveryAt?: string | null; longestJobKm?: number; bestJobIncome?: number; averageIncomePerJob?: number; bestMonth?: { month?: string; jobs?: number; distanceKm?: number; income?: number | string } | null };
  checklist?: Record<string, boolean>;
  recentActivity?: any[];
  trends?: Array<{ month: string; jobs: number; distanceKm: number; income: number | string }>;
  gameBreakdown?: Array<{ game: string; jobs: number; distanceKm: number; income: number | string }>;
  topDestinations?: Array<{ city: string; jobs: number; distanceKm: number }>;
  distanceOnJobKm?: number;
  primaryVtc?: any;
  vtcToday?: { jobs: number; distanceKm: number; income: number; fineAmount: number; netIncome: number } | null;
};

type PlatformStats = {
  registeredDrivers: number;
  vtcs: number;
  distanceKm: number;
  deliveries: number;
  driversOnline: number;
  ets2Online: number;
  atsOnline: number;
};

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString();
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [platform, setPlatform] = useState<PlatformStats | null>(null);
  const [status, setStatus] = useState("Loading dashboard…");
  const [game, setGame] = useState<"all" | "ets2" | "ats">("all");

  useEffect(() => {
    Promise.all([
      fetch(api + "/api/v1/account/dashboard", { credentials: "include", cache: "no-store" }),
      fetch(api + "/api/v1/public/platform/stats", { cache: "no-store" }),
    ]).then(async ([accountResponse, platformResponse]) => {
      if (accountResponse.status === 401) {
        window.location.href = "/account";
        return;
      }
      if (!accountResponse.ok) throw new Error("dashboard");
      setData(await accountResponse.json());
      if (platformResponse.ok) setPlatform(await platformResponse.json());
      setStatus("");
    }).catch(() => setStatus("Unable to load dashboard."));
  }, []);

  const activity = useMemo(() => {
    const events = data?.recentActivity ?? [];
    if (game === "all") return events;
    return events.filter((event: any) => String(event.metadata?.game ?? "").toLowerCase() === game);
  }, [data, game]);

  if (!data) {
    return <main className="shell"><section className="hero"><h1>{status}</h1></section></main>;
  }

  const checklist = data.checklist ?? {};
  const checklistItems = [
    ["Account created", checklist.account],
    ["Steam linked", checklist.steam],
    ["Windows client seen", checklist.client],
    ["Game telemetry received", checklist.telemetry],
    ["First delivery logged", checklist.firstDelivery],
    ["Create or join a VTC", checklist.vtc],
  ];

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Driver dashboard</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>Welcome back, {data.user?.displayName ?? "driver"}.</h1>
        <p className="lede">
          {data.live
            ? "Live in " + String(data.live.game ?? "").toUpperCase() + " · " + Math.round(Number(data.live.speedKph ?? 0)) + " km/h"
            : "Your OpenHaul career, deliveries and VTC activity in one place."}
        </p>
        <div className="actions">
          <Link className="button primary" href="/map">Live map</Link>
          <Link className="button" href="/logbook">Open logbook</Link>
          <Link className="button" href="/account">Account settings</Link>
          <a className="button" href={api + "/api/v1/account/dashboard/export?format=csv"}>Export stats CSV</a>
          <a className="button" href={api + "/api/v1/account/dashboard/export?format=json"}>Export stats JSON</a>
        </div>
      </section>

      <div className="sectionTitle"><h2>Platform now</h2></div>
      <section className="grid">
        <article className="card"><h3>{platform?.registeredDrivers?.toLocaleString() ?? "—"}</h3><p>Registered drivers</p></article>
        <article className="card"><h3>{platform?.vtcs?.toLocaleString() ?? "—"}</h3><p>VTCs</p></article>
        <article className="card"><h3>{Math.round(platform?.distanceKm ?? 0).toLocaleString()} km</h3><p>Distance logged</p></article>
        <article className="card"><h3>{platform?.deliveries?.toLocaleString() ?? "—"}</h3><p>Completed deliveries</p></article>
        <article className="card"><h3>{platform?.driversOnline?.toLocaleString() ?? "—"}</h3><p>Drivers online now</p></article>
      </section>

      <div className="sectionTitle"><h2>This month</h2></div>
      <section className="grid">
        <article className="card"><h3>{data.month?.jobs ?? 0}</h3><p>Deliveries this month</p></article>
        <article className="card"><h3>{Math.round(data.month?.distanceKm ?? 0).toLocaleString()} km</h3><p>Distance this month</p></article>
        <article className="card"><h3>{money(data.month?.income)}</h3><p>Income</p></article>
        <article className="card"><h3>{money(data.month?.fineAmount)}</h3><p>Expenses / penalties</p></article>
        <article className="card"><h3>{money(data.month?.netIncome)}</h3><p>Net earnings</p></article>
      </section>

      <div className="sectionTitle"><h2>Level & career</h2></div>
      <section className="grid">
        <article className="card">
          <div className="pill">Level {data.progression?.level ?? 1}</div>
          <h3 style={{ marginTop: 12 }}>{(data.progression?.xp ?? 0).toLocaleString()} XP</h3>
          <div style={{ marginTop: 12, height: 9, borderRadius: 99, background: "#06110c", overflow: "hidden" }}>
            <div style={{ height: "100%", width: String(Math.round((data.progression?.progress ?? 0) * 100)) + "%", background: "var(--accent)" }} />
          </div>
        </article>
        <article className="card"><h3>{data.totals?.jobs ?? 0}</h3><p>Career deliveries</p></article>
        <article className="card"><h3>{Math.round(data.career?.longestJobKm ?? 0).toLocaleString()} km</h3><p>Longest delivery</p></article>
        <article className="card"><h3>{money(data.career?.averageIncomePerJob)}</h3><p>Average income / job</p></article>
        <article className="card"><h3>{money(data.totals?.netIncome)}</h3><p>Career net earnings</p></article>
        <article className="card">
          <h3>{data.career?.bestMonth?.month ?? "—"}</h3>
          <p>Best month · {Math.round(Number(data.career?.bestMonth?.distanceKm ?? 0)).toLocaleString()} km</p>
        </article>
      </section>

      <div className="sectionTitle"><h2>Monthly trends</h2></div>
      <section className="card" style={{ display: "grid", gap: 10 }}>
        {(data.trends ?? []).map((row) => {
          const maxDistance = Math.max(1, ...(data.trends ?? []).map((item) => Number(item.distanceKm ?? 0)));
          const width = Math.max(4, Math.round((Number(row.distanceKm ?? 0) / maxDistance) * 100));
          return (
            <div key={row.month} className="trendRow">
              <strong>{row.month}</strong>
              <div style={{ height: 10, borderRadius: 99, background: "#06110c", overflow: "hidden" }}>
                <div style={{ height: "100%", width: String(width) + "%", background: "var(--accent)" }} />
              </div>
              <small>{row.jobs} jobs · {Math.round(Number(row.distanceKm ?? 0)).toLocaleString()} km · {money(row.income)}</small>
            </div>
          );
        })}
      </section>

      <div className="sectionTitle"><h2>Where you drive</h2></div>
      <section className="grid">
        {(data.gameBreakdown ?? []).map((row) => (
          <article className="card" key={row.game}>
            <div className="pill">{String(row.game).toUpperCase()}</div>
            <h3 style={{ marginTop: 12 }}>{Math.round(Number(row.distanceKm ?? 0)).toLocaleString()} km</h3>
            <p>{row.jobs} deliveries · {money(row.income)} income</p>
          </article>
        ))}
        <article className="card">
          <h3>{Math.round(Number(data.distanceOnJobKm ?? 0)).toLocaleString()} km</h3>
          <p>Distance driven on logged jobs</p>
        </article>
      </section>

      <div className="sectionTitle"><h2>Top destinations</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {(data.topDestinations ?? []).map((row, index) => (
          <article className="driver" key={row.city}>
            <div><strong>#{index + 1} · {row.city}</strong></div>
            <div><strong>{row.jobs}</strong><small>Deliveries</small></div>
            <div><strong>{Math.round(Number(row.distanceKm ?? 0)).toLocaleString()} km</strong><small>Distance</small></div>
            <div />
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Getting started</h2></div>
      <section className="card" style={{ display: "grid", gap: 8 }}>
        {checklistItems.map(([label, complete]) => (
          <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>{label}</span>
            <strong>{complete ? "✅ Complete" : "○ To do"}</strong>
          </div>
        ))}
      </section>

      {data.primaryVtc && data.vtcToday ? (
        <>
          <div className="sectionTitle"><h2>{data.primaryVtc.name} today</h2></div>
          <section className="grid">
            <article className="card"><h3>{data.vtcToday.jobs}</h3><p>Jobs today</p></article>
            <article className="card"><h3>{Math.round(data.vtcToday.distanceKm).toLocaleString()} km</h3><p>Distance today</p></article>
            <article className="card"><h3>{money(data.vtcToday.income)}</h3><p>Revenue today</p></article>
            <article className="card"><h3>{money(data.vtcToday.fineAmount)}</h3><p>Penalties today</p></article>
            <article className="card"><h3>{money(data.vtcToday.netIncome)}</h3><p>Net today</p></article>
          </section>
        </>
      ) : null}

      <div className="sectionTitle"><h2>Recent movement</h2></div>
      <section className="card" style={{ marginBottom: 12 }}>
        <div className="actions">
          {(["all", "ets2", "ats"] as const).map((value) => (
            <button key={value} className={game === value ? "button primary" : "button"} onClick={() => setGame(value)}>
              {value === "all" ? "All" : value.toUpperCase()}
            </button>
          ))}
        </div>
      </section>
      <section className="driverList" style={{ padding: "0 0 60px" }}>
        {activity.map((event: any) => (
          <article className="driver" key={event.id}>
            <div><strong>{event.title}</strong><small>{String(event.type ?? "").replaceAll("_", " ")}</small></div>
            <div><small>{event.detail || "OpenHaul activity"}</small></div>
            <div><strong>{event.amount == null ? "" : money(event.amount) + " " + (event.currency || "")}</strong></div>
            <div><small>{new Date(event.occurredAt).toLocaleString()}</small></div>
          </article>
        ))}
      </section>
    </main>
  );
}
