"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function VtcMatchingPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [status, setStatus] = useState("Choose your preferences and search.");

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Searching…");
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const add = (name: string) => {
      const value = String(form.get(name) ?? "").trim();
      if (value) params.set(name, value);
    };
    add("game"); add("language"); add("timezone"); add("operatingMode"); add("mileageKm");
    if (form.get("truckersmp") === "on") params.set("truckersmp", "true");
    if (form.get("convoy") === "on") params.set("convoy", "true");
    if (form.get("voice") === "on") params.set("voice", "true");
    const response = await fetch(api + "/api/v1/public/vtc-matches?" + params.toString(), { cache: "no-store" });
    if (!response.ok) {
      setStatus("Unable to search VTC matches.");
      return;
    }
    const data = await response.json();
    setMatches(data.matches ?? []);
    setStatus((data.matches ?? []).length ? "" : "No VTCs matched those filters.");
  };

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">VTC Matching</span>
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>Find a company that fits.</h1>
        <p className="lede">Match by game, language, timezone, operating style, TruckersMP/Convoy, mileage and voice requirements.</p>
      </section>

      <form className="card" onSubmit={search} style={{ display: "grid", gap: 12, marginBottom: 18 }}>
        <select name="game" defaultValue=""><option value="">Either game</option><option value="ets2">ETS2</option><option value="ats">ATS</option></select>
        <input name="language" placeholder="Language, e.g. English" />
        <input name="timezone" placeholder="Timezone, e.g. Europe/London" />
        <select name="operatingMode" defaultValue=""><option value="">Any operating mode</option><option value="casual">Casual</option><option value="standard">Standard</option><option value="simulation">Simulation</option></select>
        <input name="mileageKm" type="number" min="0" placeholder="Your logged mileage (km)" />
        <label><input type="checkbox" name="truckersmp" /> Must support TruckersMP</label>
        <label><input type="checkbox" name="convoy" /> Must support SCS Convoy</label>
        <label><input type="checkbox" name="voice" /> Voice required is okay</label>
        <button className="button primary">Find matching VTCs</button>
      </form>

      {status ? <p className="muted">{status}</p> : null}
      <section className="grid" style={{ paddingBottom: 60 }}>
        {matches.map((match) => {
          const vtc = match.vtc;
          const profile = match.profile?.data ?? {};
          return (
            <article className="card" key={vtc.id}>
              <div className="pill">Match score {match.score}</div>
              <h3 style={{ marginTop: 12 }}>{vtc.name} {vtc.tag ? "[" + vtc.tag + "]" : ""}</h3>
              <p>{profile.description || "Recruiting OpenHaul VTC"}</p>
              <p className="muted">{(profile.languages ?? []).join(", ")} · {(profile.games ?? []).map((g: string) => g.toUpperCase()).join(" / ")}</p>
              <div className="actions"><Link className="button primary" href={"/vtc/" + vtc.slug}>Open VTC</Link></div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
