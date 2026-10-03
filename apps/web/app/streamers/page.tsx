"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function StreamersPage() {
  const [streamers, setStreamers] = useState<any[]>([]);
  const [game, setGame] = useState<"all" | "ets2" | "ats">("all");
  const [status, setStatus] = useState("Loading linked streamers…");

  const load = async () => {
    const query = new URLSearchParams();
    if (game !== "all") query.set("game", game);

    const response = await fetch(
      api + "/api/v1/public/streamers" + (query.size ? "?" + query.toString() : ""),
      { cache: "no-store" },
    );

    if (!response.ok) {
      setStatus("Unable to load Twitch streamer status.");
      return;
    }

    const data = await response.json();
    setStreamers(data.streamers ?? []);
    setStatus("");
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [game]);

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 18 }}>
        <span className="eyebrow">Registered Twitch streamers</span>
        <h1 style={{ fontSize: "clamp(2.6rem,7vw,5rem)" }}>Live trucking streams.</h1>
        <p className="lede">
          These are OpenHaul accounts that linked Twitch and are currently live in Euro Truck Simulator 2 or American Truck Simulator.
        </p>
        <div className="actions">
          <button className={"button " + (game === "all" ? "primary" : "")} onClick={() => setGame("all")}>All</button>
          <button className={"button " + (game === "ets2" ? "primary" : "")} onClick={() => setGame("ets2")}>ETS2</button>
          <button className={"button " + (game === "ats" ? "primary" : "")} onClick={() => setGame("ats")}>ATS</button>
          <button className="button" onClick={() => void load()}>Refresh page</button>
        </div>
      </section>

      {status ? <section className="card"><p>{status}</p></section> : null}

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", paddingBottom: 60 }}>
        {streamers.map((streamer: any) => {
          const user = streamer.User ?? streamer.user;
          const thumbnail = String(streamer.thumbnailUrl ?? "")
            .replace("{width}", "640")
            .replace("{height}", "360");

          return (
            <article className="card" key={streamer.id}>
              {thumbnail ? <img src={thumbnail} alt="" style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 12 }} /> : null}
              <div className="pill" style={{ marginTop: 14 }}>🔴 LIVE · {streamer.gameName}</div>
              <h3 style={{ marginTop: 12 }}>{streamer.displayName}</h3>
              <p>{streamer.streamTitle || "Live on Twitch"}</p>
              <p className="muted">{Number(streamer.viewerCount || 0).toLocaleString()} viewers</p>
              <div className="actions">
                <a className="button primary" href={"https://twitch.tv/" + streamer.login}>Watch on Twitch</a>
                {user?.steamId ? <Link className="button" href={"/driver/" + user.steamId}>OpenHaul profile</Link> : null}
              </div>
            </article>
          );
        })}

        {!status && streamers.length === 0 ? (
          <article className="card">
            <h3>No linked trucking streams are live right now.</h3>
            <p>Registered users appear here automatically when Twitch reports them live in ETS2 or ATS.</p>
          </article>
        ) : null}
      </section>
    </main>
  );
}
