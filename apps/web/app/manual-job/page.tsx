"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function ManualJobsPage() {
  const [vtcs, setVtcs] = useState<any[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch(api + "/api/v1/account/vtcs", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.href = "/account";
          return null;
        }
        return response.ok ? response.json() : null;
      })
      .then((data) => setVtcs(data?.memberships ?? []));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Submitting…");
    const form = new FormData(event.currentTarget);
    const body = {
      vtcId: Number(form.get("vtcId")),
      game: String(form.get("game") ?? "ets2"),
      mode: String(form.get("mode") ?? "standard"),
      cargo: String(form.get("cargo") ?? ""),
      cargoMassKg: Number(form.get("cargoMassKg") ?? 0) || null,
      sourceCity: String(form.get("sourceCity") ?? ""),
      sourceCompany: String(form.get("sourceCompany") ?? "") || null,
      sourceCountry: String(form.get("sourceCountry") ?? "") || null,
      destinationCity: String(form.get("destinationCity") ?? ""),
      destinationCompany: String(form.get("destinationCompany") ?? "") || null,
      destinationCountry: String(form.get("destinationCountry") ?? "") || null,
      distanceKm: Number(form.get("distanceKm") ?? 0),
      income: Number(form.get("income") ?? 0),
      expenses: Number(form.get("expenses") ?? 0),
      evidenceUrl: String(form.get("evidenceUrl") ?? ""),
      completedAt: String(form.get("completedAt") ?? "") || new Date().toISOString(),
    };
    const response = await fetch(api + "/api/v1/account/manual-jobs", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const data = await response.json();
      setStatus(data.approvalStatus === "approved" ? "Manual delivery accepted and counted." : "Manual delivery submitted for staff approval.");
      event.currentTarget.reset();
    } else {
      const error = await response.json().catch(() => null);
      setStatus(error?.error === "manual_jobs_disabled" ? "This VTC has manual job submissions disabled." : "Unable to submit manual delivery.");
    }
  };

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Manual delivery</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>Submit a job without telemetry.</h1>
        <p className="lede">For cloud gaming or systems where the OpenHaul client/plugin cannot run. VTC policy decides whether staff approval is required.</p>
        <div className="actions"><Link className="button" href="/logbook">Back to logbook</Link></div>
      </section>

      <form className="card" onSubmit={submit} style={{ display: "grid", gap: 12, marginBottom: 60 }}>
        <select name="vtcId" required defaultValue="">
          <option value="" disabled>Select VTC</option>
          {vtcs.map((membership) => {
            const vtc = membership.Vtc ?? membership.vtc;
            return <option key={membership.id} value={vtc?.id}>{vtc?.name ?? "VTC"}</option>;
          })}
        </select>
        <select name="game" defaultValue="ets2"><option value="ets2">ETS2</option><option value="ats">ATS</option></select>
        <select name="mode" defaultValue="standard"><option value="casual">Casual</option><option value="standard">Standard</option><option value="simulation">Simulation</option></select>
        <input name="cargo" required placeholder="Cargo" />
        <input name="cargoMassKg" type="number" min="0" step="1" placeholder="Cargo mass (kg)" />
        <input name="sourceCity" required placeholder="Source city" />
        <input name="sourceCompany" placeholder="Source company" />
        <input name="sourceCountry" placeholder="Source country" />
        <input name="destinationCity" required placeholder="Destination city" />
        <input name="destinationCompany" placeholder="Destination company" />
        <input name="destinationCountry" placeholder="Destination country" />
        <input name="distanceKm" required type="number" min="0" step="0.1" placeholder="Distance (km)" />
        <input name="income" required type="number" min="0" step="1" placeholder="Income" />
        <input name="expenses" type="number" min="0" step="1" defaultValue="0" placeholder="Expenses" />
        <input name="evidenceUrl" required type="url" placeholder="Screenshot/evidence URL" />
        <label>Completed at<input name="completedAt" type="datetime-local" /></label>
        <button className="button primary">Submit delivery</button>
        {status ? <p className="muted">{status}</p> : null}
      </form>
    </main>
  );
}
