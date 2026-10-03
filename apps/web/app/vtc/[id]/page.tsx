"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Vtc = { id: number; name: string; slug: string; tag?: string | null };
type Stats = { liveDrivers: number; jobs: number; distanceKm: number; income: number; fines: number; fineAmount: number };
type Driver = { driverId: string; username: string; game: string; speedKph: number; truck?: string | null; sourceCity?: string | null; destinationCity?: string | null };
type Leader = { driverId: string; jobs: number; distanceKm: number; income: string | number };
type Community = {
  description?: string | null;
  website?: string | null;
  discordUrl?: string | null;
  logoUrl?: string | null;
  recruitmentOpen: boolean;
  memberCount: number;
  members?: any[];
  balance?: number;
  currency?: string;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function VtcProfilePage() {
  const params = useParams<{ id: string }>();
  const id = useMemo(() => String(params.id), [params.id]);

  const [vtc, setVtc] = useState<Vtc | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [live, setLive] = useState<Driver[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [community, setCommunity] = useState<Community | null>(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [profileRes, statsRes, liveRes, leaderboardRes, communityRes] = await Promise.all([
          fetch(`${api}/api/v1/public/vtcs/${id}`, { cache: "no-store" }),
          fetch(`${api}/api/v1/public/vtcs/${id}/stats`, { cache: "no-store" }),
          fetch(`${api}/api/v1/public/vtcs/${id}/live`, { cache: "no-store" }),
          fetch(`${api}/api/v1/public/vtcs/${id}/leaderboard`, { cache: "no-store" }),
          fetch(`${api}/api/v1/public/vtcs/${id}/community`, { cache: "no-store" }),
        ]);

        if (!profileRes.ok) throw new Error("VTC not found");

        const [profile, statsData, liveData, leaderboard, communityData] = await Promise.all([
          profileRes.json(),
          statsRes.json(),
          liveRes.json(),
          leaderboardRes.json(),
          communityRes.json(),
        ]);

        if (!active) return;

        setVtc(profile.vtc);
        setStats(statsData);
        setLive(liveData.drivers ?? []);
        setLeaders(leaderboard.drivers ?? []);
        setCommunity(communityData);
        setError("");
      } catch {
        if (active) setError("Unable to load this VTC.");
      }
    };

    void load();
    const timer = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);

  const apply = async () => {
    const response = await fetch(api + "/api/v1/account/vtcs/" + id + "/apply", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: applyMessage }),
    });

    if (response.status === 401) {
      window.location.href = "/account";
      return;
    }

    setApplyMessage(response.ok ? "Application submitted." : "Unable to submit application.");
  };

  if (error) return <main className="shell"><section className="hero"><h1>{error}</h1></section></main>;
  if (!vtc) return <main className="shell"><section className="hero"><h1>Loading VTC…</h1></section></main>;

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">{vtc.tag || "OpenHaul VTC"}</span>
        {community?.logoUrl ? <img src={community.logoUrl} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 18, marginTop: 16 }} /> : null}
        <h1 style={{ fontSize: "clamp(2.8rem,7vw,5rem)" }}>{vtc.name}</h1>
        <p className="lede">{community?.description || "OpenHaul community trucking company."}</p>
        <div className="actions">
          <Link className="button primary" href={`/map?vtc=${vtc.id}`}>Open VTC live map</Link>
          {community?.website ? <a className="button" href={community.website}>Website</a> : null}
          {community?.discordUrl ? <a className="button" href={community.discordUrl}>Discord</a> : null}
        </div>
      </section>

      <section className="grid">
        <article className="card"><h3>{stats?.liveDrivers ?? 0}</h3><p>Drivers live now</p></article>
        <article className="card"><h3>{Number(stats?.jobs ?? 0).toLocaleString()}</h3><p>Completed jobs</p></article>
        <article className="card"><h3>{Math.round(Number(stats?.distanceKm ?? 0)).toLocaleString()} km</h3><p>Distance logged</p></article>
        <article className="card"><h3>{Number(stats?.fines ?? 0).toLocaleString()}</h3><p>Recorded fines</p></article>
        <article className="card"><h3>{community?.memberCount ?? 0}</h3><p>Community members</p></article>
        {community?.balance !== undefined ? <article className="card"><h3>{Number(community.balance).toLocaleString()} {community.currency}</h3><p>Public VTC balance</p></article> : null}
      </section>

      {community?.recruitmentOpen ? (
        <>
          <div className="sectionTitle"><h2>Join this VTC</h2></div>
          <section className="card">
            <textarea value={applyMessage} onChange={(e) => setApplyMessage(e.target.value)} rows={4} placeholder="Tell the VTC why you want to join" />
            <div className="actions"><button className="button primary" onClick={() => void apply()}>Apply with OpenHaul account</button></div>
          </section>
        </>
      ) : null}

      <div className="sectionTitle"><h2>VTC members</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {(community?.members ?? []).map((member: any) => {
          const user = member.User ?? member.user;
          return (
            <Link className="driver" href={"/driver/" + user?.steamId} key={member.id}>
              <div><strong>{user?.displayName ?? "Driver"}</strong><small>{user?.steamId ?? ""}</small></div>
              <div><span className="pill">{member.role}</span><small>{member.title || "Member"}</small></div>
              <div><strong>{new Date(member.joinedAt).toLocaleDateString()}</strong><small>Joined</small></div>
              <div><small>Open profile →</small></div>
            </Link>
          );
        })}
      </section>

      <div className="sectionTitle"><h2>Live drivers</h2></div>
      <section className="driverList" style={{ padding: 0 }}>
        {live.length === 0 && <div className="card"><p>No VTC drivers are live right now.</p></div>}
        {live.map((driver) => (
          <article className="driver" key={driver.driverId}>
            <div><strong>{driver.username}</strong><small>{driver.driverId}</small></div>
            <div><span className="pill">{driver.game.toUpperCase()}</span></div>
            <div><strong>{Math.round(driver.speedKph)} km/h</strong><small>{driver.truck ?? "Unknown truck"}</small></div>
            <div><strong>{driver.sourceCity && driver.destinationCity ? `${driver.sourceCity} → ${driver.destinationCity}` : "No active route"}</strong></div>
          </article>
        ))}
      </section>

      <div className="sectionTitle"><h2>Distance leaderboard</h2></div>
      <section className="driverList" style={{ padding: 0, paddingBottom: 50 }}>
        {leaders.length === 0 && <div className="card"><p>No completed jobs have been logged yet.</p></div>}
        {leaders.slice(0, 20).map((driver, index) => (
          <article className="driver" key={driver.driverId}>
            <div><Link href={"/driver/" + driver.driverId}><strong>#{index + 1} · {driver.driverId}</strong></Link></div>
            <div><strong>{Math.round(Number(driver.distanceKm)).toLocaleString()} km</strong><small>Distance</small></div>
            <div><strong>{driver.jobs}</strong><small>Jobs</small></div>
            <div><strong>{Number(driver.income || 0).toLocaleString()}</strong><small>Income</small></div>
          </article>
        ))}
      </section>
    </main>
  );
}
