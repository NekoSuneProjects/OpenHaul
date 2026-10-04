"use client";

import { FormEvent, useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function TicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [status, setStatus] = useState("Loading tickets…");

  const load = async () => {
    const response = await fetch(api + "/api/v1/account/features/tickets", {
      credentials: "include",
      cache: "no-store",
    });
    if (response.status === 401) {
      window.location.href = "/account";
      return;
    }
    if (!response.ok) {
      setStatus("Unable to load tickets.");
      return;
    }
    const data = await response.json();
    setTickets(data.records ?? []);
    setStatus("");
  };

  useEffect(() => { void load(); }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(api + "/api/v1/account/features/tickets", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "open",
        data: {
          title: String(form.get("title") ?? ""),
          category: String(form.get("category") ?? "support"),
          description: String(form.get("description") ?? ""),
          priority: String(form.get("priority") ?? "normal"),
        },
      }),
    });
    if (response.ok) {
      event.currentTarget.reset();
      await load();
    }
  };

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Support Center</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>Tickets & help.</h1>
        <p className="lede">Create and track OpenHaul support, report and appeal requests.</p>
      </section>

      <form className="card" onSubmit={submit} style={{ display: "grid", gap: 12, marginBottom: 18 }}>
        <input name="title" required placeholder="Ticket title" />
        <select name="category" defaultValue="support">
          <option value="support">Support</option>
          <option value="bug">Bug</option>
          <option value="report">Report</option>
          <option value="appeal">Appeal</option>
          <option value="account">Account</option>
        </select>
        <select name="priority" defaultValue="normal">
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
        <textarea name="description" rows={6} required placeholder="Describe the issue" />
        <button className="button primary">Create ticket</button>
      </form>

      {status ? <p className="muted">{status}</p> : null}
      <section className="driverList" style={{ padding: "0 0 60px" }}>
        {tickets.map((ticket) => (
          <article className="driver" key={ticket.id}>
            <div><strong>{ticket.data?.title || ticket.key}</strong><small>{ticket.data?.category || "support"}</small></div>
            <div><span className="pill">{ticket.status}</span><small>{ticket.data?.priority || "normal"} priority</small></div>
            <div><small>{ticket.data?.description || ""}</small></div>
            <div><small>{new Date(ticket.updatedAt).toLocaleString()}</small></div>
          </article>
        ))}
      </section>
    </main>
  );
}
