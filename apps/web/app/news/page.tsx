"use client";

import { useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function NewsPage() {
  const [openhaul, setOpenhaul] = useState<any>(null);
  const [external, setExternal] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch(api + "/api/v1/public/news", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
      fetch(api + "/api/v1/public/news/external", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
    ]).then(([a, b]) => {
      setOpenhaul(a);
      setExternal(b);
    });
  }, []);

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">News</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>OpenHaul & trucking updates.</h1>
        <p className="lede">OpenHaul release notes plus optional SCS Software and TruckersMP source-linked news.</p>
      </section>

      <div className="sectionTitle"><h2>OpenHaul</h2></div>
      <section className="grid">
        {(openhaul?.items ?? []).map((item: any) => (
          <article className="card" key={item.id}>
            <div className="pill">{item.tag || "release"}</div>
            <h3 style={{ marginTop: 12 }}>{item.title}</h3>
            <p>{item.body}</p>
            <div className="actions"><a className="button" href={item.url}>Source</a></div>
          </article>
        ))}
      </section>

      {(external?.sources ?? []).map((source: any) => (
        <section key={source.name}>
          <div className="sectionTitle"><h2>{source.name}</h2><a className="button" href={source.url}>Official source</a></div>
          <div className="grid">
            {(source.items ?? []).map((item: any) => (
              <article className="card" key={item.id}>
                <div className="pill">{source.name}</div>
                <h3 style={{ marginTop: 12 }}>{item.title}</h3>
                <p>{item.body}</p>
                <div className="actions"><a className="button" href={item.url}>Read source</a></div>
              </article>
            ))}
          </div>
        </section>
      ))}
      <div style={{ height: 60 }} />
    </main>
  );
}
