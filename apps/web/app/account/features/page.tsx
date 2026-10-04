"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

const categories = [
  ["preferences", "Preferences"],
  ["achievements", "Achievements"],
  ["challenges", "Challenges"],
  ["awards", "Awards"],
  ["reputation", "Reputation"],
  ["insurance", "Virtual insurance"],
  ["albums", "Albums"],
  ["screenshots", "Screenshots"],
  ["reports", "Reports"],
  ["appeals", "Appeals"],
  ["sessions", "Sessions / devices"],
] as const;

export default function ProfileFeaturesPage() {
  const [category, setCategory] = useState<string>("preferences");
  const [records, setRecords] = useState<any[]>([]);
  const [status, setStatus] = useState("Loading profile tools…");

  const load = async () => {
    const response = await fetch(api + "/api/v1/account/features/" + category, {
      credentials: "include",
      cache: "no-store",
    });
    if (response.status === 401) {
      window.location.href = "/account";
      return;
    }
    if (!response.ok) {
      setStatus("Unable to load this profile section.");
      return;
    }
    const data = await response.json();
    setRecords(data.records ?? []);
    setStatus("");
  };

  useEffect(() => { void load(); }, [category]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(api + "/api/v1/account/features/" + category, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: String(form.get("status") ?? "active"),
        data: {
          title: String(form.get("title") ?? ""),
          description: String(form.get("description") ?? ""),
          value: String(form.get("value") ?? ""),
        },
      }),
    });
    if (response.ok) {
      event.currentTarget.reset();
      await load();
    }
  };

  const remove = async (id: number) => {
    await fetch(api + "/api/v1/account/features/" + category + "/" + id, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

  const label = categories.find(([value]) => value === category)?.[1] ?? category;

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Profile tools</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>{label}</h1>
        <p className="lede">Manage personal OpenHaul progression, preferences, albums, reports and account records.</p>
        <div className="actions">
          <Link className="button" href="/account">Back to account</Link>
          <a className="button" href={api + "/api/v1/account/export"}>Export my data</a>
        </div>
      </section>

      <section className="card operationsTabs" style={{ marginBottom: 18 }}>
        {categories.map(([value, text]) => (
          <button key={value} className={category === value ? "button primary" : "button"} onClick={() => setCategory(value)}>
            {text}
          </button>
        ))}
      </section>

      <form className="card" onSubmit={create} style={{ display: "grid", gap: 12, marginBottom: 18 }}>
        <input name="title" required placeholder={category === "preferences" ? "Preference name (e.g. currency)" : "Title"} />
        <textarea name="description" rows={3} placeholder="Description / notes" />
        <input name="value" placeholder={category === "preferences" ? "Value (e.g. GBP, miles, metric)" : "Value / URL / score"} />
        <select name="status" defaultValue="active">
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
        <button className="button primary">Save record</button>
      </form>

      {status ? <p className="muted">{status}</p> : null}
      <section className="driverList" style={{ padding: "0 0 60px" }}>
        {records.map((record) => (
          <article className="driver" key={record.id}>
            <div><strong>{record.data?.title || record.key}</strong><small>{record.data?.description || label}</small></div>
            <div><span className="pill">{record.status}</span><small>{record.data?.value || ""}</small></div>
            <div><small>{new Date(record.updatedAt).toLocaleString()}</small></div>
            <div><button className="button" onClick={() => void remove(record.id)}>Remove</button></div>
          </article>
        ))}
      </section>
    </main>
  );
}
