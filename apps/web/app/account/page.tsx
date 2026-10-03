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
  const [dlc, setDlc] = useState<any>(null);
  const [status, setStatus] = useState("Loading account…");
  const [creating, setCreating] = useState(false);
  const [clientTokens, setClientTokens] = useState<any[]>([]);
  const [newClientToken, setNewClientToken] = useState("");

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

      const dlcResponse = await fetch(api + "/api/v1/account/dlc", { credentials: "include", cache: "no-store" });
      if (dlcResponse.ok) setDlc(await dlcResponse.json());

      const tokensResponse = await fetch(api + "/api/v1/account/client-tokens", { credentials: "include", cache: "no-store" });
      if (tokensResponse.ok) {
        const tokenData = await tokensResponse.json();
        setClientTokens(tokenData.tokens ?? []);
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

  const createClientToken = async () => {
    const response = await fetch(api + "/api/v1/account/client-tokens", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Windows Client" }),
    });

    if (response.ok) {
      const data = await response.json();
      setNewClientToken(data.token);
      await load();
    }
  };

  const revokeClientToken = async (id: number) => {
    await fetch(api + "/api/v1/account/client-tokens/" + id, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

  const logout = async () => {
    await fetch(api + "/api/v1/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
    setMemberships([]);
    setDlc(null);
    setClientTokens([]);
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
      website: String(form.get("website") ?? ""),
      discordUrl: String(form.get("discordUrl") ?? ""),
      logoUrl: String(form.get("logoUrl") ?? ""),
      currency: String(form.get("currency") ?? "GBP").toUpperCase(),
      recruitmentOpen: form.get("recruitmentOpen") === "on",
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
        <div className="actions">
          <Link className="button primary" href={"/driver/" + user.steamId}>View public driver profile</Link>
          {user.profileUrl ? <a className="button" href={user.profileUrl}>Steam profile</a> : null}
          <button className="button" onClick={() => void logout()}>Log out</button>
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

      <div className="sectionTitle"><h2>ETS2 / ATS DLC</h2></div>
      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
        <article className="card">
          <h3>Euro Truck Simulator 2 DLC</h3>
          <p>{dlc?.note ?? "Loading DLC catalogue…"}</p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {(dlc?.ets2 ?? []).slice(0, 40).map((item: any) => (
              <div key={item.appid} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>{item.name.replace("Euro Truck Simulator 2 - ", "")}</span>
                <strong>{item.status === "detected" ? "✅ Detected" : "⚪ Not confirmed"}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="card">
          <h3>American Truck Simulator DLC</h3>
          <p>{dlc?.note ?? "Loading DLC catalogue…"}</p>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {(dlc?.ats ?? []).slice(0, 40).map((item: any) => (
              <div key={item.appid} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>{item.name.replace("American Truck Simulator - ", "")}</span>
                <strong>{item.status === "detected" ? "✅ Detected" : "⚪ Not confirmed"}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <div className="sectionTitle"><h2>OpenHaul Client access</h2></div>
      <section className="card" style={{ marginBottom: 18 }}>
        <h3>Connect your Windows telemetry client</h3>
        <p className="muted">Client tokens tie telemetry directly to your Steam account. The full token is shown only once.</p>
        <div className="actions">
          <button className="button primary" onClick={() => void createClientToken()}>Create client token</button>
        </div>
        {newClientToken ? (
          <div style={{ marginTop: 16 }}>
            <p><strong>Copy this token now:</strong></p>
            <code style={{ wordBreak: "break-all" }}>{newClientToken}</code>
            <p className="muted">Set it as <code>OPENHAUL_CLIENT_TOKEN</code> in the Windows client. When account auth is used, OpenHaul derives your SteamID and display name server-side.</p>
          </div>
        ) : null}
      </section>
      <section className="driverList" style={{ padding: 0 }}>
        {clientTokens.map((token: any) => (
          <article className="driver" key={token.id}>
            <div><strong>{token.name}</strong><small>{token.prefix}…</small></div>
            <div><strong>{token.revokedAt ? "Revoked" : "Active"}</strong><small>{token.lastUsedAt ? "Last used " + new Date(token.lastUsedAt).toLocaleString() : "Never used"}</small></div>
            <div><small>Created {new Date(token.createdAt).toLocaleDateString()}</small></div>
            <div>{!token.revokedAt ? <button className="button" onClick={() => void revokeClientToken(token.id)}>Revoke</button> : null}</div>
          </article>
        ))}
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
        <input name="website" placeholder="Website URL" />
        <input name="discordUrl" placeholder="Discord invite URL" />
        <input name="logoUrl" placeholder="Logo URL" />
        <input name="currency" defaultValue="GBP" maxLength={8} placeholder="Currency" />
        <label><input type="checkbox" name="recruitmentOpen" defaultChecked /> Recruitment open</label>
        <label><input type="checkbox" name="publicBalance" /> Show VTC balance publicly</label>
        <button className="button primary" disabled={creating}>{creating ? "Creating…" : "Create VTC"}</button>
      </form>
    </main>
  );
}
