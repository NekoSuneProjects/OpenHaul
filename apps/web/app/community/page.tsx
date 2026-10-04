"use client";

import { useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

const categories = [
  ["announcements", "Announcements"],
  ["partners", "Partners"],
  ["events", "Community events"],
  ["cargo-market", "Cargo market"],
  ["fuel-prices", "Fuel prices"],
  ["seasons", "Seasons"],
  ["awards", "Awards"],
  ["achievements", "Achievements"],
  ["challenges", "Challenges"],
  ["recruitment", "Recruitment"],
] as const;

export default function CommunityPage() {
  const [category, setCategory] = useState<string>("announcements");
  const [records, setRecords] = useState<any[]>([]);
  const [status, setStatus] = useState("Loading community…");

  useEffect(() => {
    fetch(api + "/api/v1/public/community/" + category, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("community");
        return response.json();
      })
      .then((data) => {
        setRecords(data.records ?? []);
        setStatus("");
      })
      .catch(() => setStatus("Unable to load this community section."));
  }, [category]);

  const label = categories.find(([value]) => value === category)?.[1] ?? category;

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">OpenHaul community</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>{label}</h1>
        <p className="lede">Announcements, partners, events, cargo, fuel and community challenges from the OpenHaul network.</p>
      </section>

      <section className="card operationsTabs" style={{ marginBottom: 18 }}>
        {categories.map(([value, text]) => (
          <button key={value} className={category === value ? "button primary" : "button"} onClick={() => setCategory(value)}>
            {text}
          </button>
        ))}
      </section>

      {status ? <p className="muted">{status}</p> : null}
      <section className="grid" style={{ paddingBottom: 60 }}>
        {records.length === 0 ? <article className="card"><p>No {label.toLowerCase()} have been published yet.</p></article> : null}
        {records.map((record) => (
          <article className="card" key={record.id}>
            {record.data?.imageUrl ? <img src={record.data.imageUrl} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 12, marginBottom: 12 }} /> : null}
            <div className="pill">{record.status}</div>
            <h3 style={{ marginTop: 12 }}>{record.data?.title || record.key}</h3>
            <p>{record.data?.description || record.data?.summary || "OpenHaul community update"}</p>
            {record.data?.url ? <div className="actions"><a className="button" href={record.data.url}>Open link</a></div> : null}
            <small className="muted">Updated {new Date(record.updatedAt).toLocaleString()}</small>
          </article>
        ))}
      </section>
    </main>
  );
}
