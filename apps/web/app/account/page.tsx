"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

type User = {
  id: number;
  steamId: string;
  displayName: string;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  ownsEts2?: boolean | null;
  ownsAts?: boolean | null;
  ownershipVisibility: "verified" | "private" | "unknown";
  bannerUrl?: string | null;
  bio?: string | null;
  country?: string | null;
  socials?: Record<string, string>;
  profilePublic?: boolean;
  moderationVisibility?: "public" | "members" | "private";
  ownedGamesSnapshot?: Array<{ appid: number; name: string; playtimeForever: number }> | null;
};

type Membership = {
  id: number;
  role: string;
  status: string;
  Vtc?: { id: number; name: string; tag?: string | null };
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "";
const windowsClientUrl =
  "https://github.com/NekoSuneProjects/OpenHaul/releases/download/windows-client/OpenHaul-Setup.exe";

export default function AccountPage() {
  const bootstrappedDefaultKey = useRef(false);
  const [newAccount, setNewAccount] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [dlc, setDlc] = useState<any>(null);
  const [status, setStatus] = useState("Loading account…");
  const [creating, setCreating] = useState(false);
  const [clientTokens, setClientTokens] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [newApiKey, setNewApiKey] = useState("");
  const [apiScopeSelection, setApiScopeSelection] = useState(["profile:read", "jobs:read", "fines:read", "vtcs:read", "stream:read"]);
  const [twitch, setTwitch] = useState<any>(null);
  const [discord, setDiscord] = useState<any>(null);

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

      const apiKeysResponse = await fetch(api + "/api/v1/account/api-keys", { credentials: "include", cache: "no-store" });
      if (apiKeysResponse.ok) {
        const keyData = await apiKeysResponse.json();
        setApiKeys(keyData.keys ?? []);
      }

      const twitchResponse = await fetch(api + "/api/v1/account/twitch", { credentials: "include", cache: "no-store" });
      if (twitchResponse.ok) {
        const twitchData = await twitchResponse.json();
        setTwitch(twitchData.twitch ?? null);
      }

      const discordResponse = await fetch(api + "/api/v1/account/discord", { credentials: "include", cache: "no-store" });
      if (discordResponse.ok) {
        setDiscord(await discordResponse.json());
      }

      setStatus("");
    } catch {
      setStatus("Unable to load your OpenHaul account.");
    }
  };

  useEffect(() => {
    setNewAccount(new URLSearchParams(window.location.search).get("new") === "1");
    void load();
  }, []);

  useEffect(() => {
    if (!user || bootstrappedDefaultKey.current || !newAccount) return;
    bootstrappedDefaultKey.current = true;

    void fetch(api + "/api/v1/account/api-keys/default", {
      method: "POST",
      credentials: "include",
    }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      if (data.created && data.apiKey) {
        setNewApiKey(data.apiKey);
        await load();
      }
    });
  }, [user, newAccount]);

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

  const createApiKey = async () => {
    const response = await fetch(api + "/api/v1/account/api-keys", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Account API",
        scopes: apiScopeSelection,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      setNewApiKey(data.apiKey);
      await load();
    }
  };

  const revokeApiKey = async (id: number) => {
    await fetch(api + "/api/v1/account/api-keys/" + id, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

  const rotateApiKey = async (id: number) => {
    await fetch(api + "/api/v1/account/api-keys/" + id + "/rotate", {
      method: "POST",
      credentials: "include",
    });
    await load();
  };

  const connectDiscord = () => {
    window.location.href = api + "/api/v1/account/discord/link";
  };

  const disconnectDiscord = async () => {
    await fetch(api + "/api/v1/account/discord", {
      method: "DELETE",
      credentials: "include",
    });
    setDiscord({ linked: false, account: null, configured: discord?.configured ?? false });
  };

  const connectTwitch = () => {
    window.location.href = api + "/api/v1/account/twitch/connect";
  };

  const refreshTwitch = async () => {
    const response = await fetch(api + "/api/v1/account/twitch/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (response.ok) {
      const data = await response.json();
      setTwitch(data.twitch ?? null);
    }
  };

  const disconnectTwitch = async () => {
    await fetch(api + "/api/v1/account/twitch", {
      method: "DELETE",
      credentials: "include",
    });
    setTwitch(null);
  };

  const revokeClientToken = async (id: number) => {
    await fetch(api + "/api/v1/account/client-tokens/" + id, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

  const rotateClientToken = async (id: number) => {
    await fetch(api + "/api/v1/account/client-tokens/" + id + "/rotate", {
      method: "POST",
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

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Saving profile…");
    const form = new FormData(event.currentTarget);
    const socials = {
      discord: String(form.get("socialDiscord") ?? "").trim(),
      youtube: String(form.get("socialYoutube") ?? "").trim(),
      twitch: String(form.get("socialTwitch") ?? "").trim(),
      website: String(form.get("socialWebsite") ?? "").trim(),
    };
    const response = await fetch(api + "/api/v1/account/profile", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bio: String(form.get("bio") ?? "").trim() || null,
        country: String(form.get("country") ?? "").trim() || null,
        bannerUrl: String(form.get("bannerUrl") ?? "").trim() || null,
        socials,
        profilePublic: form.get("profilePublic") === "on",
        moderationVisibility: String(form.get("moderationVisibility") ?? "public"),
      }),
    });
    if (response.ok) {
      const data = await response.json();
      setUser(data.user);
      setStatus("Profile saved.");
    } else {
      setStatus("Unable to save profile.");
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
      website: String(form.get("website") ?? ""),
      discordUrl: String(form.get("discordUrl") ?? ""),
      logoUrl: String(form.get("logoUrl") ?? ""),
      bannerUrl: String(form.get("bannerUrl") ?? ""),
      rules: String(form.get("rules") ?? ""),
      socials: {
        x: String(form.get("socialX") ?? ""),
        youtube: String(form.get("socialYoutube") ?? ""),
        twitch: String(form.get("socialTwitch") ?? ""),
      },
      currency: String(form.get("currency") ?? "GBP").toUpperCase(),
      recruitmentOpen: form.get("recruitmentOpen") === "on",
      recruitmentMode: String(form.get("recruitmentMode") ?? "application"),
      operatingMode: String(form.get("operatingMode") ?? "standard"),
      manualJobPolicy: String(form.get("manualJobPolicy") ?? "approval"),
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

  const leaveVtc = async (vtcId: number) => {
    const response = await fetch(api + "/api/v1/account/vtcs/" + vtcId + "/membership", {
      method: "DELETE",
      credentials: "include",
    });
    if (response.ok) {
      await load();
    } else {
      const result = await response.json().catch(() => null);
      setStatus(result?.error === "owner_must_transfer_or_close_vtc"
        ? "A VTC owner must transfer ownership before leaving."
        : "Unable to leave that VTC.");
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
          <Link className="button" href="/account/features">Profile tools</Link>
          <Link className="button" href="/tickets">Tickets</Link>
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

      <div className="sectionTitle"><h2>Profile & privacy</h2></div>
      <form className="card" onSubmit={saveProfile} style={{ display: "grid", gap: 12, marginBottom: 18 }}>
        <textarea name="bio" rows={4} defaultValue={user.bio ?? ""} placeholder="Driver bio" />
        <input name="country" defaultValue={user.country ?? ""} placeholder="Country / region" />
        <input name="bannerUrl" defaultValue={user.bannerUrl ?? ""} placeholder="Profile banner image URL" />
        <input name="socialDiscord" defaultValue={user.socials?.discord ?? ""} placeholder="Discord profile/server URL" />
        <input name="socialYoutube" defaultValue={user.socials?.youtube ?? ""} placeholder="YouTube URL" />
        <input name="socialTwitch" defaultValue={user.socials?.twitch ?? ""} placeholder="Twitch URL" />
        <input name="socialWebsite" defaultValue={user.socials?.website ?? ""} placeholder="Website URL" />
        <label><input type="checkbox" name="profilePublic" defaultChecked={user.profilePublic !== false} /> Public driver profile</label>
        <label>
          Moderation history visibility
          <select name="moderationVisibility" defaultValue={user.moderationVisibility ?? "public"}>
            <option value="public">Public</option>
            <option value="members">VTC members only</option>
            <option value="private">Private</option>
          </select>
        </label>
        <button className="button primary">Save profile</button>
      </form>

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

      <div className="sectionTitle"><h2>Personal API access</h2></div>
      <section className="card" style={{ marginBottom: 18 }}>
        <h3>Account API keys</h3>
        <p className="muted">Use these keys in your own dashboards, bots, scripts or integrations. Keys can read only your scoped account data and VTCs you actually belong to.</p>
        <div className="grid" style={{ padding: "12px 0 0" }}>
          {["profile:read", "jobs:read", "fines:read", "vtcs:read", "stream:read"].map((scope) => (
            <label key={scope}>
              <input
                type="checkbox"
                checked={apiScopeSelection.includes(scope)}
                onChange={(event) => setApiScopeSelection((current) => event.target.checked
                  ? Array.from(new Set([...current, scope]))
                  : current.filter((item) => item !== scope))}
              /> {scope}
            </label>
          ))}
        </div>
        <div className="actions">
          <button className="button primary" disabled={apiScopeSelection.length === 0} onClick={() => void createApiKey()}>Create API key</button>
        </div>
        {newApiKey ? (
          <div style={{ marginTop: 16 }}>
            <p><strong>Copy this API key now — it will not be shown again:</strong></p>
            <code style={{ wordBreak: "break-all" }}>{newApiKey}</code>
          </div>
        ) : null}
      </section>
      <section className="driverList" style={{ padding: 0 }}>
        {apiKeys.map((key: any) => (
          <article className="driver" key={key.id}>
            <div><strong>{key.name}</strong><small>{key.prefix}…</small></div>
            <div><strong>{key.revokedAt ? "Revoked" : "Active"}</strong><small>{(key.scopes ?? []).join(", ")}</small></div>
            <div><small>{key.lastUsedAt ? "Last used " + new Date(key.lastUsedAt).toLocaleString() : "Never used"}</small></div>
            <div style={{ display: "grid", gap: 6 }}>
              {!key.revokedAt ? <button className="button" onClick={() => void rotateApiKey(key.id)}>Rotate</button> : null}
              {!key.revokedAt ? <button className="button" onClick={() => void revokeApiKey(key.id)}>Revoke</button> : null}
            </div>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Discord account link</h2></div>
      <section className="card" style={{ marginBottom: 18 }}>
        {discord?.linked ? (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              {discord.account?.avatarUrl ? <img src={discord.account.avatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: 14 }} /> : null}
              <div>
                <h3 style={{ margin: 0 }}>{discord.account?.globalName || discord.account?.username}</h3>
                <p className="muted">@{discord.account?.username} · Discord ID {discord.account?.discordUserId}</p>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 14 }}>
              Linked Discord identity can be used by VTC role synchronization and bot features.
            </p>
            <button className="button" onClick={() => void disconnectDiscord()}>Disconnect Discord</button>
          </>
        ) : (
          <>
            <h3>Link Discord</h3>
            <p className="muted">
              Link your Discord account so OpenHaul VTC roles can synchronize with your Discord server roles.
            </p>
            {discord?.configured === false
              ? <p className="muted">Discord OAuth is not configured on this OpenHaul instance.</p>
              : <button className="button primary" onClick={connectDiscord}>Connect Discord</button>}
          </>
        )}
      </section>

      <div className="sectionTitle"><h2>Twitch streamer link</h2></div>
      <section className="card" style={{ marginBottom: 18 }}>
        {twitch ? (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              {twitch.profileImageUrl ? <img src={twitch.profileImageUrl} alt="" style={{ width: 64, height: 64, borderRadius: 14 }} /> : null}
              <div>
                <h3 style={{ margin: 0 }}>{twitch.displayName}</h3>
                <p className="muted">twitch.tv/{twitch.login}</p>
              </div>
            </div>
            <p style={{ marginTop: 14 }}>
              {twitch.live
                ? "🔴 Live · " + (twitch.gameName || "Unknown category") + " · " + Number(twitch.viewerCount || 0).toLocaleString() + " viewers"
                : "Offline"}
            </p>
            <div className="actions">
              <button className="button primary" onClick={() => void refreshTwitch()}>Refresh Twitch status</button>
              <a className="button" href={"https://twitch.tv/" + twitch.login}>Open channel</a>
              <button className="button" onClick={() => void disconnectTwitch()}>Disconnect</button>
            </div>
          </>
        ) : (
          <>
            <h3>Link Twitch</h3>
            <p className="muted">Link your Twitch broadcaster identity so OpenHaul can detect when your registered account is live in Euro Truck Simulator 2 or American Truck Simulator.</p>
            <button className="button primary" onClick={connectTwitch}>Connect Twitch</button>
          </>
        )}
      </section>

      <div className="sectionTitle"><h2>OpenHaul Windows Client</h2></div>
      <section className="card" style={{ marginBottom: 18 }}>
        <h3>Install the desktop app</h3>
        <p className="muted">
          The Windows app signs you in through Steam, creates its own revocable <code>oh_client_…</code> token,
          saves it to your Windows profile automatically, detects ETS2/ATS and installs the bundled telemetry plugin.
          You do not need to copy a token manually.
        </p>
        <div className="actions">
          <a className="button primary" href={windowsClientUrl}>Download Windows App</a>
        </div>
      </section>
      <section className="driverList" style={{ padding: 0 }}>
        {clientTokens.map((token: any) => (
          <article className="driver" key={token.id}>
            <div><strong>{token.name}</strong><small>{token.prefix}…</small></div>
            <div><strong>{token.revokedAt ? "Revoked" : "Active"}</strong><small>{token.lastUsedAt ? "Last used " + new Date(token.lastUsedAt).toLocaleString() : "Never used"}</small></div>
            <div><small>Created {new Date(token.createdAt).toLocaleDateString()}</small></div>
            <div style={{ display: "grid", gap: 6 }}>
              {!token.revokedAt ? <button className="button" onClick={() => void rotateClientToken(token.id)}>Rotate</button> : null}
              {!token.revokedAt ? <button className="button" onClick={() => void revokeClientToken(token.id)}>Revoke</button> : null}
            </div>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>My VTCs</h2></div>
      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
        {memberships.map((membership: any) => {
          const vtc = membership.Vtc ?? membership.VTC ?? membership.vtc;
          const canManage = ["owner", "admin", "staff"].includes(membership.role);
          return (
            <article className="card" key={membership.id}>
              <div className="pill">{membership.role}</div>
              <h3 style={{ marginTop: 12 }}>{vtc?.name ?? "VTC"}</h3>
              <p>{membership.status}</p>
              <div className="actions">
                <Link className="button primary" href={canManage ? "/account/vtc/" + vtc?.id : "/vtc/" + vtc?.id}>
                  {canManage ? "Manage VTC" : "Open VTC"}
                </Link>
                {membership.role !== "owner" ? (
                  <button className="button" onClick={() => void leaveVtc(vtc.id)}>Leave VTC</button>
                ) : null}
              </div>
            </article>
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
        <input name="bannerUrl" placeholder="Banner URL" />
        <textarea name="rules" rows={4} placeholder="VTC rules" />
        <input name="socialX" placeholder="X / Twitter URL" />
        <input name="socialYoutube" placeholder="YouTube URL" />
        <input name="socialTwitch" placeholder="Twitch URL" />
        <input name="currency" defaultValue="GBP" maxLength={8} placeholder="Currency" />
        <label>
          Recruitment mode
          <select name="recruitmentMode" defaultValue="application">
            <option value="open">Open join</option>
            <option value="application">Application required</option>
            <option value="invite">Invite only</option>
          </select>
        </label>
        <label><input type="checkbox" name="recruitmentOpen" defaultChecked /> Recruitment open</label>
        <label>
          Operating mode
          <select name="operatingMode" defaultValue="standard">
            <option value="casual">Casual</option>
            <option value="standard">Standard</option>
            <option value="simulation">Simulation</option>
          </select>
        </label>
        <label>
          Manual job submissions
          <select name="manualJobPolicy" defaultValue="approval">
            <option value="disabled">Disabled</option>
            <option value="approval">Staff approval required</option>
            <option value="full">Count automatically</option>
          </select>
        </label>
        <label><input type="checkbox" name="publicBalance" /> Show VTC balance publicly</label>
        <button className="button primary" disabled={creating}>{creating ? "Creating…" : "Create VTC"}</button>
      </form>
    </main>
  );
}
