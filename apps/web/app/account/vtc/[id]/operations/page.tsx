"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

const categories = [
  ["roles", "Custom roles"],
  ["permissions", "Granular permissions"],
  ["fleet", "Fleet / trucks / trailers"],
  ["garages", "Garages"],
  ["depots", "Depots / branches"],
  ["contracts", "Shared contracts"],
  ["dispatch", "Dispatch Center"],
  ["certifications", "Driver certifications"],
  ["training", "Training requirements"],
  ["shifts", "Driver shifts"],
  ["goals", "Cooperative goals"],
  ["seasons", "Seasons"],
  ["convoys", "Convoys"],
  ["events", "Events / attendance"],
  ["achievements", "VTC achievements"],
  ["awards", "Awards"],
  ["challenges", "Challenges"],
  ["reputation", "Reputation"],
  ["insurance", "Virtual insurance"],
  ["webhooks", "Webhooks"],
  ["history", "Company history"],
  ["policies", "Operating policies"],
  ["recruitment", "Recruitment matching"],
  ["supporters", "Supporter roles"],
] as const;

export default function VtcOperationsPage() {
  const params = useParams<{ id: string }>();
  const id = useMemo(() => String(params.id), [params.id]);
  const [category, setCategory] = useState<string>("fleet");
  const [records, setRecords] = useState<any[]>([]);
  const [status, setStatus] = useState("Loading operations…");

  const load = async () => {
    const response = await fetch(api + "/api/v1/account/vtcs/" + id + "/features/" + category, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      setStatus(response.status === 403 ? "VTC manager permission is required." : "Unable to load this operation.");
      return;
    }
    const data = await response.json();
    setRecords(data.records ?? []);
    setStatus("");
  };

  useEffect(() => { void load(); }, [id, category]);

  const createRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const extra = String(form.get("extra") ?? "").trim();
    const statusValue = String(form.get("status") ?? "active");
    const response = await fetch(api + "/api/v1/account/vtcs/" + id + "/features/" + category, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: statusValue,
        data: {
          title,
          description,
          extra,
          createdAt: new Date().toISOString(),
        },
      }),
    });
    if (response.ok) {
      event.currentTarget.reset();
      await load();
    }
  };

  const setRecordStatus = async (record: any, next: string) => {
    await fetch(api + "/api/v1/account/vtcs/" + id + "/features/" + category + "/" + record.id, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    await load();
  };

  const remove = async (recordId: number) => {
    await fetch(api + "/api/v1/account/vtcs/" + id + "/features/" + category + "/" + recordId, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

  const label = categories.find(([value]) => value === category)?.[1] ?? category;

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">VTC Operations Center</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>{label}</h1>
        <p className="lede">Manage company operations from one extensible OpenHaul workspace.</p>
        <div className="actions"><Link className="button" href={"/account/vtc/" + id}>Back to VTC dashboard</Link></div>
      </section>

      <section className="card operationsTabs" style={{ marginBottom: 18 }}>
        {categories.map(([value, text]) => (
          <button key={value} className={category === value ? "button primary" : "button"} onClick={() => setCategory(value)}>
            {text}
          </button>
        ))}
      </section>

      <form className="card" onSubmit={createRecord} style={{ display: "grid", gap: 12, marginBottom: 18 }}>
        <h3>Add {label.toLowerCase()} record</h3>
        <input name="title" required placeholder="Name / title" />
        <textarea name="description" rows={4} placeholder="Description, requirements or notes" />
        <textarea name="extra" rows={3} placeholder="Extra details: route, DLC, driver, truck, costs, permissions, dates…" />
        <select name="status" defaultValue="active">
          <option value="active">Active</option>
          <option value="planned">Planned</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
        <button className="button primary">Create record</button>
      </form>

      {status ? <p className="muted">{status}</p> : null}
      <section className="driverList" style={{ padding: "0 0 60px" }}>
        {records.map((record) => (
          <article className="driver" key={record.id}>
            <div><strong>{record.data?.title || record.key}</strong><small>{record.data?.description || label}</small></div>
            <div><span className="pill">{record.status}</span><small>{record.data?.extra || ""}</small></div>
            <div><small>{new Date(record.updatedAt).toLocaleString()}</small></div>
            <div style={{ display: "grid", gap: 6 }}>
              <select value={record.status} onChange={(event) => void setRecordStatus(record, event.target.value)}>
                <option value="active">Active</option>
                <option value="planned">Planned</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
              <button className="button" onClick={() => void remove(record.id)}>Remove</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
