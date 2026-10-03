"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Vtc = {
  id: number;
  name: string;
  slug: string;
  tag?: string | null;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function VtcDirectoryPage() {
  const [vtcs, setVtcs] = useState<Vtc[]>([]);
  const [status, setStatus] = useState("Loading VTCs…");

  useEffect(() => {
    fetch(`${api}/api/v1/public/vtcs`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("failed");
        return response.json();
      })
      .then((data) => {
        setVtcs(data.vtcs ?? []);
        setStatus("");
      })
      .catch(() => setStatus("Unable to load the VTC directory."));
  }, []);

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 20 }}>
        <span className="eyebrow">Community VTCs</span>
        <h1 style={{ fontSize: "clamp(2.6rem,6vw,4.8rem)" }}>Find your trucking company.</h1>
        <p className="lede">Public OpenHaul VTC profiles, live drivers, jobs and community leaderboards.</p>
      </section>

      {status && <p className="muted">{status}</p>}

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
        {vtcs.map((vtc) => (
          <Link href={`/vtc/${vtc.id}`} className="card" key={vtc.id}>
            <div className="pill">{vtc.tag || "VTC"}</div>
            <h3 style={{ marginTop: 14 }}>{vtc.name}</h3>
            <p>Open public profile, live members and leaderboard.</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
