"use client";

import { FormEvent, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";
const publicCategories = ["announcements","partners","events","cargo-market","fuel-prices","seasons","awards","achievements","challenges","recruitment"];

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [category, setCategory] = useState("announcements");
  const [records, setRecords] = useState<any[]>([]);
  const [status, setStatus] = useState("Enter the admin key to manage OpenHaul records.");

  const load = async () => {
    const response = await fetch(api + "/api/v1/admin/records?limit=300", {
      headers: { "x-admin-key": adminKey },
      cache: "no-store",
    });
    if (!response.ok) {
      setStatus("Admin authentication failed.");
      return;
    }
    const data = await response.json();
    setRecords(data.records ?? []);
    setStatus("");
  };

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(api + "/api/v1/admin/community/" + category, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({
        status: String(form.get("status") ?? "active"),
        data: {
          title: String(form.get("title") ?? ""),
          description: String(form.get("description") ?? ""),
          url: String(form.get("url") ?? ""),
          imageUrl: String(form.get("imageUrl") ?? ""),
        },
      }),
    });
    if (response.ok) {
      event.currentTarget.reset();
      setStatus("Published.");
      await load();
    } else {
      setStatus("Unable to publish.");
    }
  };

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Platform administration</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>OpenHaul admin.</h1>
        <p className="lede">Manage public announcements, partners, events, cargo/fuel data and operational records.</p>
      </section>

      <section className="card" style={{ display: "grid", gap: 12, marginBottom: 18 }}>
        <input type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="OPENHAUL_ADMIN_KEY" />
        <button className="button primary" onClick={() => void load()}>Load admin records</button>
        {status ? <p className="muted">{status}</p> : null}
      </section>

      <form className="card" onSubmit={publish} style={{ display: "grid", gap: 12, marginBottom: 18 }}>
        <h3>Publish community content</h3>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          {publicCategories.map((item) => <option key={item} value={item}>{item.replaceAll("-", " ")}</option>)}
        </select>
        <input name="title" required placeholder="Title" />
        <textarea name="description" rows={4} placeholder="Description" />
        <input name="url" placeholder="Source / partner / event URL" />
        <input name="imageUrl" placeholder="Image URL" />
        <select name="status" defaultValue="active">
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
        <button className="button primary">Publish</button>
      </form>

      <div className="sectionTitle"><h2>Recent records</h2></div>
      <section className="driverList" style={{ padding: "0 0 60px" }}>
        {records.map((record) => (
          <article className="driver" key={record.id}>
            <div><strong>{record.data?.title || record.key}</strong><small>{record.category}</small></div>
            <div><span className="pill">{record.status}</span><small>{record.scopeType}:{record.scopeId}</small></div>
            <div><small>{new Date(record.updatedAt).toLocaleString()}</small></div>
            <div />
          </article>
        ))}
      </section>
    </main>
  );
}
