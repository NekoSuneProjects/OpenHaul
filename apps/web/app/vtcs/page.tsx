"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Vtc = {
  id: number;
  name: string;
  slug: string;
  tag?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  recruitmentOpen?: boolean;
  recruitmentMode?: string;
  memberCount?: number;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function VtcDirectoryPage() {
  const [vtcs, setVtcs] = useState<Vtc[]>([]);
  const [status, setStatus] = useState("Loading VTCs…");
  const [query, setQuery] = useState("");
  const [recruitment, setRecruitment] = useState("all");

  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (recruitment !== "all") params.set("recruitment", recruitment);

    const timer = setTimeout(() => {
      fetch(`${api}/api/v1/public/vtcs?${params.toString()}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("failed");
          return response.json();
        })
        .then((data) => {
          setVtcs(data.vtcs ?? []);
          setStatus("");
        })
        .catch(() => setStatus("Unable to load the VTC directory."));
    }, 200);

    return () => clearTimeout(timer);
  }, [query, recruitment]);

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 20 }}>
        <span className="eyebrow">Community VTCs</span>
        <h1 style={{ fontSize: "clamp(2.6rem,6vw,4.8rem)" }}>Find your trucking company.</h1>
        <p className="lede">Public OpenHaul VTC profiles, live drivers, jobs and community leaderboards.</p>
      </section>

      {status && <p className="muted">{status}</p>}

      <section className="card" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 220px", gap: 12, marginBottom: 18 }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search VTC name, tag, description…" />
        <select value={recruitment} onChange={(event) => setRecruitment(event.target.value)}>
          <option value="all">All recruitment</option>
          <option value="open">Recruiting</option>
          <option value="closed">Recruitment closed</option>
        </select>
      </section>

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
        {vtcs.map((vtc) => (
          <Link href={`/vtc/${vtc.id}`} className="card" key={vtc.id}>
            {vtc.logoUrl ? <img src={vtc.logoUrl} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover" }} /> : null}
            <div className="pill">{vtc.tag || "VTC"}</div>
            <h3 style={{ marginTop: 14 }}>{vtc.name}</h3>
            <p>{vtc.description || "Open public profile, live members and leaderboard."}</p>
            <small>{vtc.memberCount ?? 0} members · {vtc.recruitmentOpen ? `Recruiting (${vtc.recruitmentMode ?? "application"})` : "Recruitment closed"}</small>
          </Link>
        ))}
      </section>
    </main>
  );
}
