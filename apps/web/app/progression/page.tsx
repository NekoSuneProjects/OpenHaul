"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function ProgressionPage() {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState("Loading progression…");

  useEffect(() => {
    fetch(api + "/api/v1/account/progression", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.href = "/account";
          return null;
        }
        if (!response.ok) throw new Error("progression");
        return response.json();
      })
      .then((value) => {
        if (!value) return;
        setData(value);
        setStatus("");
      })
      .catch(() => setStatus("Unable to load progression."));
  }, []);

  if (!data) return <main className="shell"><section className="hero"><h1>{status}</h1></section></main>;

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Progression</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>Challenges, achievements & reputation.</h1>
        <p className="lede">Progress is derived automatically from verified OpenHaul jobs and penalties.</p>
        <div className="actions"><Link className="button" href="/dashboard">Back to dashboard</Link></div>
      </section>

      <section className="grid">
        <article className="card"><h3>{data.reputation?.score ?? 0}</h3><p>Reputation score</p></article>
        <article className="card"><h3>{data.reputation?.safety ?? 0}</h3><p>Safety</p></article>
        <article className="card"><h3>{data.reputation?.reliability ?? 0}</h3><p>Reliability</p></article>
        <article className="card"><h3>{data.reputation?.activity ?? 0}</h3><p>Activity</p></article>
        <article className="card"><h3>{data.reputation?.contribution ?? 0}</h3><p>VTC contribution</p></article>
      </section>

      <div className="sectionTitle"><h2>Challenges</h2></div>
      <section className="grid">
        {(data.challenges ?? []).map((challenge: any) => (
          <article className="card" key={challenge.id}>
            <div className="pill">{challenge.period}</div>
            <h3 style={{ marginTop: 12 }}>{challenge.title}</h3>
            <p>{Number(challenge.value ?? 0).toLocaleString()} / {Number(challenge.target ?? 0).toLocaleString()}</p>
            <div style={{ height: 9, background: "#06110c", borderRadius: 99, overflow: "hidden", marginTop: 12 }}>
              <div style={{ height: "100%", width: String(Math.round(Number(challenge.progress ?? 0) * 100)) + "%", background: "var(--accent)" }} />
            </div>
            <p style={{ marginTop: 10 }}>{challenge.completed ? "✅ Complete" : "In progress"}</p>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Achievements & awards</h2></div>
      <section className="grid">
        {(data.achievements ?? []).map((achievement: any) => (
          <article className="card" key={achievement.id}>
            <div className="pill">{achievement.unlocked ? "Unlocked" : "Locked"}</div>
            <h3 style={{ marginTop: 12 }}>{achievement.title}</h3>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Transparent reputation history</h2></div>
      <section className="driverList" style={{ padding: "0 0 60px" }}>
        {(data.history ?? []).map((row: any) => (
          <article className="driver" key={row.month}>
            <div><strong>{row.month}</strong></div>
            <div><strong>{row.jobs}</strong><small>Jobs</small></div>
            <div><strong>{Math.round(Number(row.distanceKm ?? 0)).toLocaleString()} km</strong><small>Distance</small></div>
            <div><strong>{Number(row.profit ?? 0).toLocaleString()}</strong><small>Profit</small></div>
          </article>
        ))}
      </section>
    </main>
  );
}
