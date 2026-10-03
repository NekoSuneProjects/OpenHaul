"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function ManageVtcPage() {
  const params = useParams<{ id: string }>();
  const id = useMemo(() => String(params.id), [params.id]);
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState("Loading VTC…");

  const load = async () => {
    const response = await fetch(api + "/api/v1/account/vtcs/" + id + "/manage", {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      setStatus(response.status === 403 ? "You do not have VTC management permission." : "Unable to load this VTC.");
      return;
    }

    setData(await response.json());
    setStatus("");
  };

  useEffect(() => { void load(); }, [id]);

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const response = await fetch(api + "/api/v1/account/vtcs/" + id, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        tag: String(form.get("tag") ?? ""),
        description: String(form.get("description") ?? ""),
        website: String(form.get("website") ?? ""),
        discordUrl: String(form.get("discordUrl") ?? ""),
        logoUrl: String(form.get("logoUrl") ?? ""),
        currency: String(form.get("currency") ?? "GBP").toUpperCase(),
        recruitmentOpen: form.get("recruitmentOpen") === "on",
        publicBalance: form.get("publicBalance") === "on",
      }),
    });

    if (response.ok) await load();
  };

  const addLedger = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get("type") ?? "income");
    const raw = Number(form.get("amount") ?? 0);

    const response = await fetch(api + "/api/v1/account/vtcs/" + id + "/ledger", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
        description: String(form.get("description") ?? ""),
        amount: Math.abs(raw),
        currency: String(form.get("currency") ?? data?.vtc?.currency ?? "GBP"),
      }),
    });

    if (response.ok) {
      event.currentTarget.reset();
      await load();
    }
  };

  const updateApplication = async (applicationId: number, decision: "approved" | "rejected") => {
    await fetch(api + "/api/v1/account/vtcs/" + id + "/applications/" + applicationId, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: decision }),
    });
    await load();
  };

  const updateMember = async (member: any, role: string) => {
    await fetch(api + "/api/v1/account/vtcs/" + id + "/members/" + member.id, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role,
        title: member.title ?? null,
        status: member.status ?? "active",
      }),
    });
    await load();
  };

  if (!data) {
    return <main className="shell"><section className="hero"><h1>{status}</h1></section></main>;
  }

  const { vtc, members = [], applications = [], ledger } = data;

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 18 }}>
        <span className="eyebrow">VTC management</span>
        <h1 style={{ fontSize: "clamp(2.7rem,6vw,4.8rem)" }}>{vtc.name}</h1>
        <p className="lede">{vtc.description || "Manage your OpenHaul trucking company."}</p>
      </section>

      <section className="grid">
        <article className="card"><h3>{members.length}</h3><p>Tracked members</p></article>
        <article className="card"><h3>{Number(ledger?.balance ?? 0).toLocaleString()} {vtc.currency}</h3><p>VTC balance</p></article>
        <article className="card"><h3>{Number(ledger?.income ?? 0).toLocaleString()} {vtc.currency}</h3><p>Total incoming</p></article>
        <article className="card"><h3>{Number(ledger?.expenses ?? 0).toLocaleString()} {vtc.currency}</h3><p>Total expenses</p></article>
      </section>

      <div className="sectionTitle"><h2>Company settings</h2></div>
      <form className="card" onSubmit={saveSettings} style={{ display: "grid", gap: 12 }}>
        <input name="name" defaultValue={vtc.name || ""} required placeholder="VTC name" />
        <input name="tag" defaultValue={vtc.tag || ""} placeholder="Tag" />
        <textarea name="description" defaultValue={vtc.description || ""} rows={5} placeholder="VTC description" />
        <input name="website" defaultValue={vtc.website || ""} placeholder="Website URL" />
        <input name="discordUrl" defaultValue={vtc.discordUrl || ""} placeholder="Discord invite URL" />
        <input name="logoUrl" defaultValue={vtc.logoUrl || ""} placeholder="Logo URL" />
        <input name="currency" defaultValue={vtc.currency || "GBP"} maxLength={8} />
        <label><input type="checkbox" name="recruitmentOpen" defaultChecked={Boolean(vtc.recruitmentOpen)} /> Recruitment open</label>
        <label><input type="checkbox" name="publicBalance" defaultChecked={Boolean(vtc.publicBalance)} /> Show balance publicly</label>
        <button className="button primary">Save company settings</button>
      </form>

      <div className="sectionTitle"><h2>Members</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {members.map((member: any) => {
          const user = member.User ?? member.user;
          return (
            <article className="driver" key={member.id}>
              <div><strong>{user?.displayName ?? "Driver"}</strong><small>{user?.steamId ?? ""}</small></div>
              <div><span className="pill">{member.role}</span><small>{member.title || "VTC member"}</small></div>
              <div>
                <strong>{Math.round(Number(member.stats?.distanceKm ?? 0)).toLocaleString()} km</strong>
                <small>{member.stats?.jobs ?? 0} jobs · {member.stats?.fines ?? 0} fines</small>
              </div>
              <div>
                {member.role !== "owner" && (
                  <select value={member.role} onChange={(e) => void updateMember(member, e.target.value)}>
                    <option value="member">Member</option>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <div className="sectionTitle"><h2>Recruitment applications</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {applications.filter((item: any) => item.status === "pending").map((application: any) => (
          <article className="card" key={application.id}>
            <h3>User #{application.userId}</h3>
            <p>{application.message || "No application message."}</p>
            <div className="actions">
              <button className="button primary" onClick={() => void updateApplication(application.id, "approved")}>Approve</button>
              <button className="button" onClick={() => void updateApplication(application.id, "rejected")}>Reject</button>
            </div>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>VTC finances</h2></div>
      <form className="card" onSubmit={addLedger} style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <select name="type" defaultValue="income">
          <option value="income">Income</option>
          <option value="expense">Expense</option>
          <option value="donation">Donation</option>
          <option value="adjustment">Adjustment</option>
        </select>
        <input name="description" required placeholder="Description" />
        <input name="amount" type="number" min="0" step="0.01" required placeholder="Amount" />
        <input name="currency" defaultValue={vtc.currency || "GBP"} maxLength={8} />
        <button className="button primary">Add transaction</button>
      </form>

      <section className="driverList" style={{ padding: "0 0 60px" }}>
        {(ledger?.entries ?? []).map((entry: any) => (
          <article className="driver" key={entry.id}>
            <div><strong>{entry.description}</strong><small>{entry.type}</small></div>
            <div><strong>{Number(entry.amount).toLocaleString()} {entry.currency}</strong></div>
            <div><small>{new Date(entry.createdAt).toLocaleString()}</small></div>
            <div><small>Entry #{entry.id}</small></div>
          </article>
        ))}
      </section>
    </main>
  );
}
