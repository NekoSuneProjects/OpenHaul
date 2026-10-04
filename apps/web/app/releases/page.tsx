"use client";

import { useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function ReleasesPage() {
  const [version, setVersion] = useState<any>(null);
  const [stable, setStable] = useState<any>(null);
  const [beta, setBeta] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch(api + "/api/v1/version", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
      fetch(api + "/api/v1/public/releases/stable", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
      fetch(api + "/api/v1/public/releases/beta", { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
    ]).then(([v, s, b]) => {
      setVersion(v);
      setStable(s);
      setBeta(b);
    });
  }, []);

  const renderRelease = (label: string, data: any) => {
    const manifest = data?.manifest ?? {};
    return (
      <article className="card">
        <div className="pill">{label}</div>
        <h3 style={{ marginTop: 12 }}>{manifest.version || manifest.client?.version || "Unavailable"}</h3>
        <p>{manifest.notes || manifest.changelog || "Rolling OpenHaul Windows client release."}</p>
        <div className="driverList" style={{ padding: "12px 0 0" }}>
          <div className="driver">
            <div><strong>Client</strong><small>{manifest.client?.version || manifest.version || "—"}</small></div>
            <div><strong>Plugin</strong><small>{manifest.telemetry?.version || manifest.plugin?.version || "—"}</small></div>
            <div><strong>SHA-256</strong><small style={{ wordBreak: "break-all" }}>{manifest.client?.sha256 || manifest.sha256 || "—"}</small></div>
            <div>{manifest.client?.url || manifest.url ? <a className="button" href={manifest.client?.url || manifest.url}>Download</a> : null}</div>
          </div>
        </div>
      </article>
    );
  };

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Release Center</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>Client & telemetry updates.</h1>
        <p className="lede">Stable/Beta channels, compatibility status, versions, checksums and download manifests.</p>
      </section>

      <section className="grid">
        <article className="card"><h3>{version?.version || "dev"}</h3><p>Website / server version</p></article>
        <article className="card"><h3>{version?.releaseChannel || "stable"}</h3><p>Server release channel</p></article>
        <article className="card"><h3>v{version?.protocol?.client ?? "—"}</h3><p>Client protocol</p></article>
        <article className="card"><h3>v{version?.protocol?.telemetry ?? "—"}</h3><p>Telemetry protocol</p></article>
      </section>

      <div className="sectionTitle"><h2>Channels</h2></div>
      <section className="grid">
        {renderRelease("Stable", stable)}
        {renderRelease("Beta", beta)}
      </section>

      <div className="sectionTitle"><h2>Compatibility contract</h2></div>
      <section className="card" style={{ marginBottom: 60 }}>
        <p>Server, Windows client and SCS telemetry plugin use explicit protocol versions. A client/plugin is compatible when its protocol falls inside the server's supported range.</p>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(version?.compatibility ?? {}, null, 2)}</pre>
      </section>
    </main>
  );
}
