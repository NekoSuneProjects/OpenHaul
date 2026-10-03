"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type User = {
  id: number;
  steamId: string;
  displayName: string;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  ownsEts2?: boolean | null;
  ownsAts?: boolean | null;
  ownershipVisibility: "verified" | "private" | "unknown";
  ownedGamesSnapshot?: Array<{ appid: number; name: string; playtimeForever: number }> | null;
};

type Membership = {
  id: number;
  role: string;
  status: string;
  Vtc?: { id: number; name: string; tag?: string | null };
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [status, setStatus] = useState("Loading account…");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const me = await fetch(api + "/api/v1/account/me", { credentials: "include", cache: "no-store" });
      if (me.status === 401) {
        setUser(null);
        setStatus("");
        return;
      }
      if (!me.ok) throw new Error("account failed");

      const data = await me.json();
      setUser(data.user);

      const vtcs = await fetch(api + "/api/v1/account/vtcs", { credentials: "include", cache: "no-store" });
      if (vtcs.ok) {
        const list = await vtcs.json();
        setMemberships(list.memberships ?? []);
      }

      setStatus("");
    } catch {
      setStatus("Unable to load your OpenHaul account.");
    }
  };

  useEffect(() => { void load(); }, []);

  const refreshOwnership = async () => {
    setStatus("Refreshing Steam library…");
    const response = await fetch(api + "/api/v1/account/ownership/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (response.ok) {
      const data = await response.json();
      setUser(data.user);
      setStatus("");
    } else {
      setStatus("Steam ownership refresh failed.");
    }
  };

  const createVtc = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);

    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get("name") ?? ""),
      slug: String(form.get("slug") ?? "").toLowerCase().trim(),
      tag: String(form.get("tag") ?? ""),
      description: String(form.get("description") ?? ""),
      currency: String(form.get("currency") ?? "GBP").toUpperCase(),
      recruitmentOpen: true,
      publicBalance: form.get("publicBalance") === "on",
    };

    const response = await fetch(api + "/api/v1/account/vtcs", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    setCreating(false);

    if (response.ok) {
      event.currentTarget.reset();
      await load();
    } else {
      const error = await response.json().catch(() => null);
      setStatus(error?.error === "vtc_slug_taken" ? "That VTC URL slug is already taken." : "Unable to create VTC.");
    }
  };

  if (status && !user) {
    return <main className="shell"><section className="hero"><h1>{status}</h1></section></main>;
  }

  if (!user) {
    return (
      <main className="shell">
        <section className="hero">
          <span className="eyebrow">OpenHaul account</span>
          <h1>Sign in with Steam.</h1>
          <p className="lede">Your SteamID becomes your OpenHaul identity. New users are created automatically after Steam confirms the login.</p>
          <div className="actions">
            <a className="button primary" href={api + "/api/v1/auth/steam"}>Sign in through Steam</a>
          </div>
        </section>
      </main>
    );
  }

  const visibilityText =
    user.ownershipVisibility === "verified"
      ? "Steam library visible — ownership checked"
      : user.ownershipVisibility === "private"
        ? "Steam game details are private — ownership cannot be verified"
        : "Steam ownership is currently unavailable";

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">My OpenHaul</span>
        <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 20 }}>
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width: 88, height: 88, borderRadius: 18 }} /> : null}
          <div>
            <h1 style={{ fontSize: "clamp(2.5rem,6vw,4.5rem)", margin: 0 }}>{user.displayName}</h1>
            <p className="muted">SteamID {user.steamId}</p>
          </div>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h3>Euro Truck Simulator 2</h3>
          <p>{user.ownsEts2 === true ? "✅ Owned" : user.ownsEts2 === false ? "❌ Not detected" : "⚪ Unknown / private"}</p>
        </article>
        <article className="card">
          <h3>American Truck Simulator</h3>
          <p>{user.ownsAts === true ? "✅ Owned" : user.ownsAts === false ? "❌ Not detected" : "⚪ Unknown / private"}</p>
        </article>
        <article className="card">
          <h3>Steam verification</h3>
          <p>{visibilityText}</p>
          <button className="button" onClick={refreshOwnership} style={{ marginTop: 12 }}>Refresh library</button>
        </article>
      </section>

      <div className="sectionTitle"><h2>My VTCs</h2></div>
      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
        {memberships.map((membership: any) => {
          const vtc = membership.Vtc ?? membership.VTC ?? membership.vtc;
          return (
            <Link className="card" href={"/account/vtc/" + vtc?.id} key={membership.id}>
              <div className="pill">{membership.role}</div>
              <h3 style={{ marginTop: 12 }}>{vtc?.name ?? "VTC"}</h3>
              <p>{membership.status}</p>
            </Link>
          );
        })}
      </section>

      <div className="sectionTitle"><h2>Create Community VTC</h2></div>
      <form className="card" onSubmit={createVtc} style={{ display: "grid", gap: 12, marginBottom: 60 }}>
        <input name="name" required placeholder="VTC name" />
        <input name="slug" required pattern="[a-z0-9-]+" placeholder="URL slug, e.g. neko-logistics" />
        <input name="tag" placeholder="Tag, e.g. NEKO" maxLength={32} />
        <textarea name="description" placeholder="Tell drivers about your VTC" rows={5} />
        <input name="currency" defaultValue="GBP" maxLength={8} placeholder="Currency" />
        <label><input type="checkbox" name="publicBalance" /> Show VTC balance publicly</label>
        <button className="button primary" disabled={creating}>{creating ? "Creating…" : "Create VTC"}</button>
      </form>
    </main>
  );
}
