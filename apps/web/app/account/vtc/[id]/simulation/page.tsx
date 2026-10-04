"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function VtcSimulationPage() {
  const params = useParams<{ id: string }>();
  const id = useMemo(() => String(params.id), [params.id]);
  const [data, setData] = useState<any>(null);
  const [qualifications, setQualifications] = useState<any>(null);
  const [status, setStatus] = useState("");

  const load = async () => {
    const [sim, qual] = await Promise.all([
      fetch(api + "/api/v1/account/vtcs/" + id + "/simulation", { credentials: "include", cache: "no-store" }),
      fetch(api + "/api/v1/account/vtcs/" + id + "/qualifications", { credentials: "include", cache: "no-store" }),
    ]);
    if (sim.ok) setData(await sim.json());
    if (qual.ok) setQualifications(await qual.json());
  };

  useEffect(() => { void load(); }, [id]);

  const shift = async (action: "start" | "end") => {
    setStatus(action === "start" ? "Starting shift…" : "Ending shift…");
    const response = await fetch(api + "/api/v1/account/vtcs/" + id + "/shifts/" + action, {
      method: "POST",
      credentials: "include",
    });
    setStatus(response.ok ? (action === "start" ? "Shift started." : "Shift ended and summarized.") : "Unable to update shift.");
    if (response.ok) await load();
  };

  if (!data) return <main className="shell"><section className="hero"><h1>Loading company simulation…</h1></section></main>;

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">Living VTC</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>{data.vtc?.name} Operations.</h1>
        <p className="lede">Mode: {String(data.vtc?.operatingMode || "standard").toUpperCase()} · manual jobs: {data.vtc?.manualJobPolicy}</p>
        <div className="actions">
          <Link className="button" href={"/account/vtc/" + id}>VTC dashboard</Link>
          <Link className="button" href={"/account/vtc/" + id + "/operations"}>Manage operations</Link>
          <button className="button primary" onClick={() => void shift("start")}>Start shift</button>
          <button className="button" onClick={() => void shift("end")}>End shift</button>
        </div>
        {status ? <p className="muted">{status}</p> : null}
      </section>

      <div className="sectionTitle"><h2>Your automatic certifications</h2></div>
      <section className="grid">
        {Object.entries(qualifications?.certifications ?? {}).map(([name, unlocked]) => (
          <article className="card" key={name}>
            <div className="pill">{unlocked ? "Qualified" : "Not yet qualified"}</div>
            <h3 style={{ marginTop: 12 }}>{name.replaceAll(/([A-Z])/g, " $1")}</h3>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Fleet maintenance</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {(data.fleet ?? []).map((record: any) => (
          <article className="driver" key={record.id}>
            <div><strong>{record.data?.title || record.data?.truck || record.key}</strong><small>{record.data?.assignedDriver || "Unassigned"}</small></div>
            <div><strong>{Number(record.maintenance?.mileageKm || 0).toLocaleString()} km</strong><small>Mileage</small></div>
            <div><strong>{record.maintenance?.condition ?? 100}%</strong><small>Condition</small></div>
            <div><span className="pill">{record.maintenance?.serviceDue ? "Service due" : Number(record.maintenance?.remainingKm || 0).toLocaleString() + " km to service"}</span></div>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Shared contracts</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {(data.contracts ?? []).map((record: any) => (
          <article className="driver" key={record.id}>
            <div><strong>{record.data?.title || record.key}</strong><small>{record.data?.description || ""}</small></div>
            <div><strong>{Number(record.progress?.value || 0).toLocaleString()}</strong><small>{record.progress?.metric}</small></div>
            <div><strong>{Number(record.progress?.target || 0).toLocaleString()}</strong><small>Target</small></div>
            <div><span className="pill">{record.progress?.complete ? "Complete" : record.status}</span></div>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Cooperative goals</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {(data.goals ?? []).map((record: any) => (
          <article className="driver" key={record.id}>
            <div><strong>{record.data?.title || record.key}</strong><small>{record.data?.description || ""}</small></div>
            <div><strong>{Number(record.progress?.value || 0).toLocaleString()}</strong><small>{record.progress?.metric}</small></div>
            <div><strong>{Number(record.progress?.target || 0).toLocaleString()}</strong><small>Target</small></div>
            <div><span className="pill">{record.progress?.complete ? "Complete" : record.status}</span></div>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Driver reputation</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {(data.reputation ?? []).sort((a: any, b: any) => b.score - a.score).map((driver: any, index: number) => (
          <article className="driver" key={driver.memberId}>
            <div><strong>#{index + 1} · {driver.displayName}</strong><small>{driver.steamId}</small></div>
            <div><strong>{driver.score}</strong><small>Reputation</small></div>
            <div><strong>{driver.safety}</strong><small>Safety · reliability {driver.reliability}</small></div>
            <div><strong>{Math.round(driver.distanceKm).toLocaleString()} km</strong><small>{driver.jobs} jobs</small></div>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Convoys & events</h2></div>
      <section className="grid">
        {[...(data.convoys ?? []), ...(data.events ?? [])].map((record: any) => (
          <article className="card" key={record.id}>
            <div className="pill">{record.status}</div>
            <h3 style={{ marginTop: 12 }}>{record.data?.title || record.key}</h3>
            <p>{record.data?.description || record.data?.extra || "Company operation"}</p>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Recent shifts</h2></div>
      <section className="driverList" style={{ padding: "0 0 60px" }}>
        {(data.shifts ?? []).slice(0, 50).map((record: any) => (
          <article className="driver" key={record.id}>
            <div><strong>{record.data?.driverName || record.data?.driverSteamId || "Driver"}</strong><small>{record.status}</small></div>
            <div><strong>{record.data?.jobs ?? 0}</strong><small>Jobs</small></div>
            <div><strong>{Math.round(Number(record.data?.distanceKm ?? 0)).toLocaleString()} km</strong><small>Distance</small></div>
            <div><strong>{Number(record.data?.net ?? 0).toLocaleString()}</strong><small>Net shift result</small></div>
          </article>
        ))}
      </section>
    </main>
  );
}
