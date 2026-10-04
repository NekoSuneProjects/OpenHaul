"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function ManageVtcPage() {
  const params = useParams<{ id: string }>();
  const id = useMemo(() => String(params.id), [params.id]);
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState("Loading VTC…");
  const [vtcApiKeys, setVtcApiKeys] = useState<any[]>([]);
  const [newVtcApiKey, setNewVtcApiKey] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [activity, setActivity] = useState<any[]>([]);
  const [moderation, setModeration] = useState<any[]>([]);
  const [discordConfig, setDiscordConfig] = useState<any>(null);
  const [botInviteUrl, setBotInviteUrl] = useState("");
  const [manualJobs, setManualJobs] = useState<any[]>([]);
  const [opsStatus, setOpsStatus] = useState("");

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

    const keysResponse = await fetch(api + "/api/v1/account/vtcs/" + id + "/api-keys", {
      credentials: "include",
      cache: "no-store",
    });
    if (keysResponse.ok) {
      const keyData = await keysResponse.json();
      setVtcApiKeys(keyData.keys ?? []);
    }

    const [activityResponse, moderationResponse, discordResponse, manualJobsResponse] = await Promise.all([
      fetch(api + "/api/v1/account/vtcs/" + id + "/activity", { credentials: "include", cache: "no-store" }),
      fetch(api + "/api/v1/account/vtcs/" + id + "/moderation", { credentials: "include", cache: "no-store" }),
      fetch(api + "/api/v1/account/vtcs/" + id + "/discord", { credentials: "include", cache: "no-store" }),
      fetch(api + "/api/v1/account/vtcs/" + id + "/manual-jobs", { credentials: "include", cache: "no-store" }),
    ]);
    if (activityResponse.ok) setActivity((await activityResponse.json()).events ?? []);
    if (moderationResponse.ok) setModeration((await moderationResponse.json()).actions ?? []);
    if (discordResponse.ok) {
      const discordData = await discordResponse.json();
      setDiscordConfig(discordData.config ?? {});
      setBotInviteUrl(discordData.botInviteUrl ?? "");
    }
    if (manualJobsResponse.ok) {
      const manualData = await manualJobsResponse.json();
      setManualJobs(manualData.jobs ?? []);
    }

    setStatus("");
  };

  useEffect(() => { void load(); }, [id]);

  const createVtcApiKey = async () => {
    const response = await fetch(api + "/api/v1/account/vtcs/" + id + "/api-keys", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "VTC integration",
        scopes: ["telemetry:read", "jobs:read", "fines:read", "statistics:read", "members:read"],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      setNewVtcApiKey(data.apiKey);
      await load();
    }
  };

  const revokeVtcApiKey = async (keyId: number) => {
    await fetch(api + "/api/v1/account/vtcs/" + id + "/api-keys/" + keyId, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

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

  const kickMember = async (memberId: number) => {
    if (!window.confirm("Remove this member from the VTC?")) return;
    await fetch(api + "/api/v1/account/vtcs/" + id + "/members/" + memberId, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

  const transferOwnership = async (memberId: number) => {
    if (!window.confirm("Transfer VTC ownership to this member? You will become an admin.")) return;
    const response = await fetch(api + "/api/v1/account/vtcs/" + id + "/transfer-ownership", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    if (response.ok) await load();
  };

  const createInvite = async () => {
    setInviteStatus("Creating invite…");
    const response = await fetch(api + "/api/v1/account/vtcs/" + id + "/invites", {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      setInviteStatus("Unable to create an invite.");
      return;
    }
    const result = await response.json();
    const url = new URL(result.path, window.location.origin).toString();
    setInviteUrl(url);
    setInviteStatus("One-person invite created. It expires in 7 days.");
    await navigator.clipboard?.writeText(url).catch(() => {});
    await load();
  };

  const revokeInvite = async (inviteId: number) => {
    await fetch(api + "/api/v1/account/vtcs/" + id + "/invites/" + inviteId, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  };

  const reviewManualJob = async (jobId: number, approvalStatus: "approved" | "rejected") => {
    const response = await fetch(api + "/api/v1/account/vtcs/" + id + "/manual-jobs/" + jobId, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approvalStatus }),
    });
    if (response.ok) await load();
  };

  const addModeration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOpsStatus("Saving moderation action…");
    const form = new FormData(event.currentTarget);
    const response = await fetch(api + "/api/v1/account/vtcs/" + id + "/moderation", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        steamId: String(form.get("steamId") ?? ""),
        type: String(form.get("type") ?? "warning"),
        reason: String(form.get("reason") ?? ""),
        expiresAt: String(form.get("expiresAt") ?? "") || null,
      }),
    });
    if (response.ok) {
      event.currentTarget.reset();
      setOpsStatus("Moderation action recorded.");
      await load();
    } else {
      setOpsStatus("Unable to record moderation action.");
    }
  };

  const revokeModeration = async (actionId: number) => {
    const response = await fetch(api + "/api/v1/account/vtcs/" + id + "/moderation/" + actionId, {
      method: "DELETE",
      credentials: "include",
    });
    if (response.ok) await load();
  };

  const saveDiscord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOpsStatus("Saving Discord settings…");
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim() || null;
    const response = await fetch(api + "/api/v1/account/vtcs/" + id + "/discord", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        guildId: value("guildId"),
        logChannelId: value("logChannelId"),
        jobChannelId: value("jobChannelId"),
        fineChannelId: value("fineChannelId"),
        applicationChannelId: value("applicationChannelId"),
        moderationChannelId: value("moderationChannelId"),
        driverChannelId: value("driverChannelId"),
        enabled: form.get("enabled") === "on",
      }),
    });
    if (response.ok) {
      setOpsStatus("Discord settings saved.");
      await load();
    } else {
      setOpsStatus("Unable to save Discord settings.");
    }
  };

  if (!data) {
    return <main className="shell"><section className="hero"><h1>{status}</h1></section></main>;
  }

  const { vtc, members = [], applications = [], invites = [], ledger } = data;

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

      <div className="actions" style={{ marginBottom: 18 }}>
        <Link className="button primary" href={"/account/vtc/" + id + "/logbook"}>Open VTC logbook</Link>
        <Link className="button" href={"/account/vtc/" + id + "/operations"}>Operations Center</Link>
      </div>

      <div className="sectionTitle"><h2>VTC dashboard</h2></div>
      <section className="grid">
        <article className="card"><h3>{data.dashboard?.members ?? 0}</h3><p>Members</p></article>
        <article className="card"><h3>{data.dashboard?.online ?? 0}</h3><p>Online now</p></article>
        <article className="card"><h3>{data.dashboard?.jobsToday ?? 0}</h3><p>Jobs today</p></article>
        <article className="card"><h3>{data.dashboard?.jobsMonth ?? 0}</h3><p>Jobs this month</p></article>
        <article className="card"><h3>{Math.round(Number(data.dashboard?.distanceMonth ?? 0)).toLocaleString()} km</h3><p>Distance this month</p></article>
        <article className="card"><h3>{Number(data.dashboard?.incomeMonth ?? 0).toLocaleString()}</h3><p>Revenue this month</p></article>
        <article className="card"><h3>{Number(data.dashboard?.fineAmountMonth ?? 0).toLocaleString()}</h3><p>Penalties this month</p></article>
        <article className="card"><h3>{Number(data.dashboard?.profitMonth ?? 0).toLocaleString()}</h3><p>Profit this month</p></article>
      </section>

      <div className="sectionTitle"><h2>Monthly trends</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {(data.trends ?? []).map((row: any) => (
          <article className="driver" key={row.month}>
            <div><strong>{row.month}</strong></div>
            <div><strong>{row.jobs}</strong><small>Jobs</small></div>
            <div><strong>{Math.round(Number(row.distanceKm ?? 0)).toLocaleString()} km</strong><small>Distance</small></div>
            <div><strong>{Number(row.income ?? 0).toLocaleString()}</strong><small>Revenue</small></div>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Company settings</h2></div>
      <form className="card" onSubmit={saveSettings} style={{ display: "grid", gap: 12 }}>
        <input name="name" defaultValue={vtc.name || ""} required placeholder="VTC name" />
        <input name="tag" defaultValue={vtc.tag || ""} placeholder="Tag" />
        <textarea name="description" defaultValue={vtc.description || ""} rows={5} placeholder="VTC description" />
        <input name="website" defaultValue={vtc.website || ""} placeholder="Website URL" />
        <input name="discordUrl" defaultValue={vtc.discordUrl || ""} placeholder="Discord invite URL" />
        <input name="logoUrl" defaultValue={vtc.logoUrl || ""} placeholder="Logo URL" />
        <input name="bannerUrl" defaultValue={vtc.bannerUrl || ""} placeholder="Banner URL" />
        <textarea name="rules" defaultValue={vtc.rules || ""} rows={5} placeholder="VTC rules" />
        <input name="socialX" defaultValue={vtc.socials?.x || ""} placeholder="X / Twitter URL" />
        <input name="socialYoutube" defaultValue={vtc.socials?.youtube || ""} placeholder="YouTube URL" />
        <input name="socialTwitch" defaultValue={vtc.socials?.twitch || ""} placeholder="Twitch URL" />
        <input name="currency" defaultValue={vtc.currency || "GBP"} maxLength={8} />
        <label>
          Recruitment mode
          <select name="recruitmentMode" defaultValue={vtc.recruitmentMode || "application"}>
            <option value="open">Open join</option>
            <option value="application">Application required</option>
            <option value="invite">Invite only</option>
          </select>
        </label>
        <label><input type="checkbox" name="recruitmentOpen" defaultChecked={Boolean(vtc.recruitmentOpen)} /> Recruitment open</label>
        <label>
          Operating mode
          <select name="operatingMode" defaultValue={vtc.operatingMode || "standard"}>
            <option value="casual">Casual</option>
            <option value="standard">Standard</option>
            <option value="simulation">Simulation</option>
          </select>
        </label>
        <label>
          Manual job policy
          <select name="manualJobPolicy" defaultValue={vtc.manualJobPolicy || "approval"}>
            <option value="disabled">Disabled</option>
            <option value="approval">Staff approval required</option>
            <option value="full">Count automatically</option>
          </select>
        </label>
        <label><input type="checkbox" name="publicBalance" defaultChecked={Boolean(vtc.publicBalance)} /> Show balance publicly</label>
        <button className="button primary">Save company settings</button>
      </form>

      <div className="sectionTitle"><h2>Invite drivers</h2></div>
      <section className="card">
        <h3>Create a private join link</h3>
        <p className="muted">Each link can be used by one OpenHaul account and expires after 7 days.</p>
        <div className="actions">
          <button className="button primary" onClick={() => void createInvite()}>Create invite link</button>
        </div>
        {inviteUrl ? (
          <div style={{ marginTop: 16 }}>
            <input value={inviteUrl} readOnly onFocus={(event) => event.currentTarget.select()} aria-label="New VTC invite link" />
            <div className="actions">
              <button className="button" onClick={() => void navigator.clipboard?.writeText(inviteUrl)}>Copy link</button>
            </div>
          </div>
        ) : null}
        {inviteStatus ? <p className="muted">{inviteStatus}</p> : null}
      </section>
      <section className="driverList" style={{ padding: 0 }}>
        {invites.map((invite: any) => {
          const expired = new Date(invite.expiresAt).getTime() <= Date.now();
          const state = invite.usedAt ? "Used" : invite.revokedAt ? "Revoked" : expired ? "Expired" : "Active";
          return (
            <article className="driver" key={invite.id}>
              <div><strong>Invite #{invite.id}</strong><small>Created {new Date(invite.createdAt).toLocaleString()}</small></div>
              <div><span className="pill">{state}</span><small>Expires {new Date(invite.expiresAt).toLocaleString()}</small></div>
              <div />
              <div>{state === "Active" ? <button className="button" onClick={() => void revokeInvite(invite.id)}>Revoke</button> : null}</div>
            </article>
          );
        })}
      </section>

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
                <small>{member.stats?.jobs ?? 0} jobs · {member.stats?.fines ?? 0} fines · net {(Number(member.stats?.income ?? 0) - Number(member.stats?.fineAmount ?? 0)).toLocaleString()}</small>
              </div>
              <div>
                {member.role !== "owner" ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    <select value={member.role} onChange={(e) => void updateMember(member, e.target.value)}>
                      <option value="member">Member</option>
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button className="button" onClick={() => void kickMember(member.id)}>Kick</button>
                    {data.managerRole === "owner" ? (
                      <button className="button" onClick={() => void transferOwnership(member.id)}>Make owner</button>
                    ) : null}
                  </div>
                ) : <span className="pill">Owner</span>}
              </div>
            </article>
          );
        })}
      </section>

      <div className="sectionTitle"><h2>Recruitment applications</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {applications.filter((item: any) => item.status === "pending").map((application: any) => (
          <article className="card" key={application.id}>
            <h3>{(application.User ?? application.user)?.displayName ?? "User #" + application.userId}</h3>
            <p>{application.message || "No application message."}</p>
            <div className="actions">
              <button className="button primary" onClick={() => void updateApplication(application.id, "approved")}>Approve</button>
              <button className="button" onClick={() => void updateApplication(application.id, "rejected")}>Reject</button>
            </div>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Manual job approvals</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {manualJobs.filter((job: any) => job.approvalStatus === "pending").length === 0 ? <div className="card"><p>No manual jobs waiting for review.</p></div> : null}
        {manualJobs.filter((job: any) => job.approvalStatus === "pending").map((job: any) => (
          <article className="driver" key={job.id}>
            <div><strong>{job.cargo || "Unknown cargo"}</strong><small>{job.driverId} · {String(job.game).toUpperCase()}</small></div>
            <div><strong>{job.sourceCity} → {job.destinationCity}</strong><small>{Math.round(Number(job.distanceKm || 0)).toLocaleString()} km</small></div>
            <div><strong>{Number(job.income || 0).toLocaleString()}</strong><small>expenses {Number(job.expenses || 0).toLocaleString()}</small></div>
            <div style={{ display: "grid", gap: 6 }}>
              {job.evidenceUrl ? <a className="button" href={job.evidenceUrl}>Evidence</a> : null}
              <button className="button primary" onClick={() => void reviewManualJob(job.id, "approved")}>Approve</button>
              <button className="button" onClick={() => void reviewManualJob(job.id, "rejected")}>Reject</button>
            </div>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Driver moderation</h2></div>
      <form className="card" onSubmit={addModeration} style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <p className="muted">Warnings, mutes, bans and staff notes are stored against the driver's VTC profile and included in the activity log.</p>
        <input name="steamId" required pattern="\\d{15,20}" placeholder="Driver SteamID64" />
        <select name="type" defaultValue="warning">
          <option value="warning">Warning</option>
          <option value="mute">Mute</option>
          <option value="ban">Ban / suspend VTC membership</option>
          <option value="note">Staff note</option>
        </select>
        <textarea name="reason" rows={3} placeholder="Reason / staff note" />
        <label>Expires (optional)<input name="expiresAt" type="datetime-local" /></label>
        <button className="button primary">Record action</button>
      </form>
      <section className="driverList" style={{ padding: 0 }}>
        {moderation.map((action: any) => {
          const target = action.User ?? action.user;
          return (
            <article className="driver" key={action.id}>
              <div><strong>{target?.displayName ?? target?.steamId ?? "Driver"}</strong><small>{target?.steamId ?? ""}</small></div>
              <div><span className="pill">{action.type}</span><small>{action.reason || "No reason"}</small></div>
              <div><small>{action.expiresAt ? "Expires " + new Date(action.expiresAt).toLocaleString() : "No expiry"}</small></div>
              <div>{!action.revokedAt ? <button className="button" onClick={() => void revokeModeration(action.id)}>Revoke</button> : <span className="muted">Revoked</span>}</div>
            </article>
          );
        })}
      </section>

      <div className="sectionTitle"><h2>Discord bot</h2></div>
      <form className="card" onSubmit={saveDiscord} style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <p className="muted">Install the shared OpenHaul bot in your Discord, then paste the server and channel IDs below. Each VTC can have its own notification channels.</p>
        {botInviteUrl ? <div className="actions"><a className="button primary" href={botInviteUrl}>Add OpenHaul Bot to Discord</a></div> : <p className="muted">Set DISCORD_CLIENT_ID on the OpenHaul server to enable the bot install button.</p>}
        <label><input type="checkbox" name="enabled" defaultChecked={Boolean(discordConfig?.enabled)} /> Enable Discord integration</label>
        <input name="guildId" defaultValue={discordConfig?.guildId ?? ""} placeholder="Discord server / Guild ID" />
        <input name="logChannelId" defaultValue={discordConfig?.logChannelId ?? ""} placeholder="General activity channel ID" />
        <input name="jobChannelId" defaultValue={discordConfig?.jobChannelId ?? ""} placeholder="Completed jobs channel ID" />
        <input name="fineChannelId" defaultValue={discordConfig?.fineChannelId ?? ""} placeholder="Fines / penalties channel ID" />
        <input name="applicationChannelId" defaultValue={discordConfig?.applicationChannelId ?? ""} placeholder="Applications channel ID" />
        <input name="moderationChannelId" defaultValue={discordConfig?.moderationChannelId ?? ""} placeholder="Warnings / bans / mutes channel ID" />
        <input name="driverChannelId" defaultValue={discordConfig?.driverChannelId ?? ""} placeholder="Driver online/offline channel ID" />
        <button className="button primary">Save Discord setup</button>
        <p className="muted">Bot commands: /openhaul, /drivers, /leaderboard and /apply.</p>
      </form>

      <div className="sectionTitle"><h2>VTC activity log</h2></div>
      <section className="driverList" style={{ padding: "0 0 18px" }}>
        {activity.map((event: any) => (
          <article className="driver" key={event.id}>
            <div><strong>{event.title}</strong><small>{String(event.type).replaceAll("_", " ")}</small></div>
            <div><small>{event.detail || event.driverId || "VTC event"}</small></div>
            <div><strong>{event.amount == null ? "" : Number(event.amount).toLocaleString() + " " + (event.currency || "")}</strong></div>
            <div><small>{new Date(event.occurredAt).toLocaleString()}</small></div>
          </article>
        ))}
      </section>
      {opsStatus ? <p className="muted">{opsStatus}</p> : null}

      <div className="sectionTitle"><h2>VTC API keys</h2></div>
      <section className="card" style={{ marginBottom: 16 }}>
        <h3>Group integrations</h3>
        <p className="muted">Create a VTC-scoped key for dashboards, bots and external tools. The server binds the key to this VTC, so changing an ID cannot expose another group.</p>
        <div className="actions">
          <button className="button primary" onClick={() => void createVtcApiKey()}>Create VTC API key</button>
        </div>
        {newVtcApiKey ? (
          <div style={{ marginTop: 16 }}>
            <p><strong>Copy this key now — it will not be shown again:</strong></p>
            <code style={{ wordBreak: "break-all" }}>{newVtcApiKey}</code>
          </div>
        ) : null}
      </section>
      <section className="driverList" style={{ padding: 0 }}>
        {vtcApiKeys.map((key: any) => (
          <article className="driver" key={key.id}>
            <div><strong>{key.name}</strong><small>VTC API key</small></div>
            <div><strong>{key.revokedAt ? "Revoked" : "Active"}</strong><small>{(key.scopes ?? []).join(", ")}</small></div>
            <div><small>Created {new Date(key.createdAt).toLocaleDateString()}</small></div>
            <div>{!key.revokedAt ? <button className="button" onClick={() => void revokeVtcApiKey(key.id)}>Revoke</button> : null}</div>
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
