"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function DriverProfilePage() {
  const params = useParams<{ steamId: string }>();
  const steamId = useMemo(() => String(params.steamId), [params.steamId]);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(api + "/api/v1/public/drivers/" + encodeURIComponent(steamId), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("not found");
        return response.json();
      })
      .then(setData)
      .catch(() => setError("Driver profile not found."));
  }, [steamId]);

  if (error) return <main className="shell"><section className="hero"><h1>{error}</h1></section></main>;
  if (!data) return <main className="shell"><section className="hero"><h1>Loading driver…</h1></section></main>;

  const user = data.user;
  const stats = data.stats ?? {};

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 20 }}>
        <span className="eyebrow">OpenHaul driver</span>
        <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 20 }}>
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width: 96, height: 96, borderRadius: 18 }} /> : null}
          <div>
            <h1 style={{ fontSize: "clamp(2.7rem,6vw,4.8rem)", margin: 0 }}>{user.displayName}</h1>
            <p className="muted">SteamID {user.steamId}</p>
          </div>
        </div>
        <div className="actions">
          {user.profileUrl ? <a className="button" href={user.profileUrl}>Steam profile</a> : null}
          {data.live ? <Link className="button primary" href="/map">Live now</Link> : null}
        </div>
      </section>

      <section className="grid">
        <article className="card"><h3>{Number(stats.jobs ?? 0).toLocaleString()}</h3><p>Jobs completed</p></article>
        <article className="card"><h3>{Math.round(Number(stats.distanceKm ?? 0)).toLocaleString()} km</h3><p>Distance logged</p></article>
        <article className="card"><h3>{Number(stats.income ?? 0).toLocaleString()}</h3><p>Job income</p></article>
        <article className="card"><h3>{Number(stats.fines ?? 0).toLocaleString()}</h3><p>Recorded fines</p></article>
        <article className="card"><h3>{user.ownsEts2 === true ? "✅" : user.ownsEts2 === false ? "❌" : "⚪"}</h3><p>ETS2 ownership</p></article>
        <article className="card"><h3>{user.ownsAts === true ? "✅" : user.ownsAts === false ? "❌" : "⚪"}</h3><p>ATS ownership</p></article>
      </section>

      {data.twitch ? (
        <>
          <div className="sectionTitle"><h2>Twitch</h2></div>
          <section className="card">
            <h3>{data.twitch.displayName}</h3>
            <p>{data.twitch.live ? "🔴 Live · " + (data.twitch.gameName || "Unknown category") : "Offline"}</p>
            {data.twitch.streamTitle ? <p>{data.twitch.streamTitle}</p> : null}
            <div className="actions">
              <a className="button primary" href={"https://twitch.tv/" + data.twitch.login}>Open Twitch channel</a>
              {data.twitch.live && (data.twitch.gameName === "Euro Truck Simulator 2" || data.twitch.gameName === "American Truck Simulator")
                ? <span className="pill">Registered trucking streamer</span>
                : null}
            </div>
          </section>
        </>
      ) : null}

      <div className="sectionTitle"><h2>VTC memberships</h2></div>
      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
        {(data.memberships ?? []).map((membership: any) => {
          const vtc = membership.Vtc ?? membership.vtc;
          return (
            <Link href={"/vtc/" + vtc.id} className="card" key={membership.id}>
              <div className="pill">{membership.role}</div>
              <h3 style={{ marginTop: 12 }}>{vtc.name}</h3>
              <p>{vtc.tag ? "[" + vtc.tag + "] " : ""}{membership.title || "VTC member"}</p>
            </Link>
          );
        })}
      </section>

      {data.live ? (
        <>
          <div className="sectionTitle"><h2>Live telemetry</h2></div>
          <section className="card">
            <h3>{data.live.game.toUpperCase()} · {Math.round(Number(data.live.speedKph ?? 0))} km/h</h3>
            <p>{data.live.truck || "Unknown truck"} · {data.live.cargo || "No cargo"}</p>
            <p>{data.live.sourceCity && data.live.destinationCity ? data.live.sourceCity + " → " + data.live.destinationCity : "No active route"}</p>
          </section>
        </>
      ) : null}

      <div className="sectionTitle"><h2>Recent jobs</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {(data.recentJobs ?? []).map((job: any) => (
          <article className="driver" key={job.id}>
            <div><strong>{job.cargo || "Unknown cargo"}</strong><small>{String(job.game).toUpperCase()}</small></div>
            <div><strong>{job.sourceCity || "Unknown"} → {job.destinationCity || "Unknown"}</strong></div>
            <div><strong>{Math.round(Number(job.distanceKm ?? 0))} km</strong><small>Distance</small></div>
            <div><strong>{Number(job.income ?? 0).toLocaleString()}</strong><small>Income</small></div>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Recent fines</h2></div>
      <section className="driverList" style={{ padding: "0 0 60px" }}>
        {(data.recentFines ?? []).map((fine: any) => (
          <article className="driver" key={fine.id}>
            <div><strong>{String(fine.type).replaceAll("_", " ")}</strong><small>{String(fine.game).toUpperCase()}</small></div>
            <div><strong>{fine.amount} {fine.currency}</strong><small>Penalty</small></div>
            <div><strong>{fine.city || "Unknown location"}</strong></div>
            <div><small>{new Date(fine.occurredAt).toLocaleString()}</small></div>
          </article>
        ))}
      </section>
    </main>
  );
}
