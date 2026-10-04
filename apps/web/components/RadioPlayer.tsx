"use client";

import { useEffect, useRef, useState } from "react";

type NowPlaying = {
  station?: { name?: string; listen_url?: string };
  listeners?: { current?: number };
  live?: { is_live?: boolean; streamer_name?: string };
  now_playing?: { song?: { artist?: string; title?: string; art?: string } };
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

export function RadioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [data, setData] = useState<NowPlaying | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${api}/api/v1/public/radio/truckersfm`, { cache: "no-store" });
        if (response.ok && active) setData(await response.json());
      } catch {}
    };
    load();
    const timer = setInterval(load, 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const stream = "https://radio.truckers.fm";
  const artist = data?.now_playing?.song?.artist ?? "TruckersFM";
  const title = data?.now_playing?.song?.title ?? "Your drive, your music.";
  const presenter = data?.live?.is_live && data.live.streamer_name ? data.live.streamer_name : "AutoDJ";

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.src = "https://radio.truckers.fm";
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="radio">
      <div className="shell radioInner">
        {data?.now_playing?.song?.art
          ? <img className="art" src={data.now_playing.song.art} alt="" />
          : <div className="art" />}
        <div className="track">
          <strong>{artist} — {title}</strong>
          <span>{presenter} · {data?.listeners?.current ?? "—"} listeners · TruckersFM</span>
        </div>
        <button className="play" onClick={toggle} aria-label={playing ? "Pause TruckersFM" : "Play TruckersFM"}>
          {playing ? "Ⅱ" : "▶"}
        </button>
        <audio ref={audioRef} preload="none" />
      </div>
    </div>
  );
}
