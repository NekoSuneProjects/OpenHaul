"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Song = {
  artist?: string;
  title?: string;
  album?: string;
  genre?: string;
  art?: string;
};

type HistoryItem = {
  sh_id: number;
  played_at: number;
  duration: number;
  song?: Song;
};

type RadioData = {
  station?: {
    name?: string;
    description?: string;
    listen_url?: string;
  };
  listeners?: {
    current?: number;
    unique?: number;
  };
  live?: {
    is_live?: boolean;
    streamer_name?: string;
    broadcast_start?: number | null;
    art?: string | null;
  };
  now_playing?: {
    played_at?: number;
    duration?: number;
    elapsed?: number;
    remaining?: number;
    song?: Song;
  };
  playing_next?: {
    played_at?: number;
    duration?: number;
    song?: Song;
  };
  song_history?: HistoryItem[];
  is_online?: boolean;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

function duration(value?: number) {
  if (!value || value < 0) return "0:00";
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function trackText(song?: Song) {
  if (!song) return "Unknown track";
  return [song.artist, song.title].filter(Boolean).join(" — ") || "Unknown track";
}

export default function RadioPage() {
  const [data, setData] = useState<RadioData | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch(`${api}/api/v1/public/radio/truckersfm`, { cache: "no-store" });
        if (!response.ok) throw new Error("radio unavailable");
        const json = await response.json();
        if (active) setData(json);
      } catch {}
    };

    void load();
    const timer = setInterval(load, 12000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const progress = useMemo(() => {
    const elapsed = data?.now_playing?.elapsed ?? 0;
    const total = data?.now_playing?.duration ?? 0;
    return total > 0 ? Math.max(0, Math.min(100, (elapsed / total) * 100)) : 0;
  }, [data]);

  const stream = data?.station?.listen_url ?? "https://azuracast.truckers.fm/listen/truckersfm/live";
  const now = data?.now_playing?.song;
  const dj = data?.live?.is_live && data.live.streamer_name ? data.live.streamer_name : "AutoDJ";

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.src = stream;
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">TruckersFM</span>
        <h1 style={{ fontSize: "clamp(2.6rem,6vw,4.8rem)" }}>Your drive, your music.</h1>
        <p className="lede">Live TruckersFM metadata and stream playback inside OpenHaul.</p>
      </section>

      <section className="card" style={{ display: "grid", gridTemplateColumns: "minmax(0,180px) 1fr", gap: 24, alignItems: "center" }}>
        {now?.art ? <img src={now.art} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 18 }} /> : <div className="art" style={{ width: "100%", height: "auto", aspectRatio: "1" }} />}

        <div>
          <div className="pill">{data?.is_online === false ? "OFFLINE" : data?.live?.is_live ? "LIVE DJ" : "ON AIR"}</div>
          <h2 style={{ margin: "14px 0 6px", fontSize: "2rem" }}>{trackText(now)}</h2>
          <div className="muted">{dj} · {data?.listeners?.current ?? "—"} listeners</div>

          <div style={{ marginTop: 20, height: 9, background: "#06110c", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7 }} className="muted">
            <span>{duration(data?.now_playing?.elapsed)}</span>
            <span>{duration(data?.now_playing?.duration)}</span>
          </div>

          <div className="actions" style={{ marginTop: 18 }}>
            <button className="button primary" onClick={toggle}>{playing ? "Pause stream" : "Play TruckersFM"}</button>
          </div>
        </div>
      </section>

      <div className="sectionTitle"><h2>Up next</h2></div>
      <section className="card">
        <h3 style={{ marginBottom: 6 }}>{trackText(data?.playing_next?.song)}</h3>
        <p>{data?.playing_next?.song?.album || "TruckersFM rotation"} · {duration(data?.playing_next?.duration)}</p>
      </section>

      <div className="sectionTitle"><h2>Recently played</h2></div>
      <section className="driverList" style={{ padding: 0, paddingBottom: 50 }}>
        {(data?.song_history ?? []).slice(0, 12).map((item) => (
          <article className="driver" key={item.sh_id}>
            <div>
              <strong>{item.song?.artist ?? "Unknown artist"}</strong>
              <small>{item.song?.title ?? "Unknown track"}</small>
            </div>
            <div><span className="pill">{duration(item.duration)}</span></div>
            <div>
              <strong>{item.song?.album || "—"}</strong>
              <small>{item.song?.genre || "TruckersFM"}</small>
            </div>
            <div>
              <strong>{new Date(item.played_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
              <small>Played</small>
            </div>
          </article>
        ))}
      </section>

      <audio ref={audioRef} preload="none" />
    </main>
  );
}
