"use client";

import { FormEvent, useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function SetupPage() {
  const [status, setStatus] = useState<any>(null);
  const [adminKey, setAdminKey] = useState("");
  const [message, setMessage] = useState("");

  const load = () => fetch(api + "/api/v1/setup/status", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then(setStatus);

  useEffect(() => { void load(); }, []);

  const complete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(api + "/api/v1/setup/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({
        instanceName: String(form.get("instanceName") ?? "OpenHaul"),
        publicUrl: String(form.get("publicUrl") ?? "").trim() || undefined,
        notes: String(form.get("notes") ?? "").trim() || undefined,
      }),
    });
    setMessage(response.ok ? "Setup bootstrap marked complete." : "Admin key was rejected or setup data is invalid.");
    if (response.ok) await load();
  };

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Self-host setup</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>Configure OpenHaul.</h1>
        <p className="lede">Check required environment settings and finish the instance bootstrap.</p>
      </section>

      <section className="grid">
        <article className="card"><h3>{status?.databaseConfigured ? "✅" : "❌"}</h3><p>Database configured</p></article>
        <article className="card"><h3>{status?.adminConfigured ? "✅" : "❌"}</h3><p>Admin secret configured</p></article>
        <article className="card"><h3>{status?.ingestConfigured ? "✅" : "❌"}</h3><p>Telemetry ingest secret configured</p></article>
        <article className="card"><h3>{status?.steamConfigured ? "✅" : "○"}</h3><p>Steam API configured</p></article>
        <article className="card"><h3>{status?.discordConfigured ? "✅" : "○"}</h3><p>Discord bot configured</p></article>
        <article className="card"><h3>{status?.bootstrapComplete ? "✅" : "○"}</h3><p>Bootstrap completed</p></article>
      </section>

      <div className="sectionTitle"><h2>Finish bootstrap</h2></div>
      <form className="card" onSubmit={complete} style={{ display: "grid", gap: 12, marginBottom: 60 }}>
        <input type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="OPENHAUL_ADMIN_KEY" required />
        <input name="instanceName" defaultValue="OpenHaul" placeholder="Instance name" required />
        <input name="publicUrl" type="url" defaultValue={status?.publicUrl ?? ""} placeholder="https://openhaul.example.com" />
        <textarea name="notes" rows={4} placeholder="Optional self-host notes" />
        <button className="button primary">Complete setup</button>
        {message ? <p className="muted">{message}</p> : null}
      </form>
    </main>
  );
}
