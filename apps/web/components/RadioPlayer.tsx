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
  const [volume, setVolume] = useState(0.7);
  const [previousVolume, setPreviousVolume] = useState(0.7);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("openhaul.radio.volume");
      if (saved !== null) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed)) {
          const next = Math.min(1, Math.max(0, parsed));
          setVolume(next);
          setPreviousVolume(next > 0 ? next : 0.7);
          if (audioRef.current) audioRef.current.volume = next;
        }
      } else if (audioRef.current) {
        audioRef.current.volume = 0.7;
      }
    } catch {
      if (audioRef.current) audioRef.current.volume = 0.7;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${api}/api/v1/public/radio/truckersfm`, { cache: "no-store" });
        if (response.ok && active) setData(await response.json());
      } catch {}
    };
    load();
    const timer = setInterval(load, 15000);
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
      audio.src = stream;
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const updateVolume = (next: number) => {
    const value = Math.min(1, Math.max(0, next));
    setVolume(value);
    if (value > 0) setPreviousVolume(value);

    const audio = audioRef.current;
    if (audio) audio.volume = value;

    try {
      window.localStorage.setItem("openhaul.radio.volume", String(value));
    } catch {}
  };

  const toggleMute = () => {
    if (volume > 0) {
      setPreviousVolume(volume);
      updateVolume(0);
    } else {
      updateVolume(previousVolume > 0 ? previousVolume : 0.7);
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
        <div className="radioControls">
          <button className="play" onClick={toggle} aria-label={playing ? "Pause TruckersFM" : "Play TruckersFM"}>
            {playing ? "Ⅱ" : "▶"}
          </button>
          <div className="radioVolume">
            <button
              className="volumeButton"
              onClick={toggleMute}
              aria-label={volume > 0 ? "Mute TruckersFM" : "Unmute TruckersFM"}
              title={volume > 0 ? "Mute" : "Unmute"}
            >
              {volume === 0 ? "🔇" : volume < 0.45 ? "🔈" : volume < 0.8 ? "🔉" : "🔊"}
            </button>
            <input
              className="volumeSlider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(volume * 100)}
              onChange={(event) => updateVolume(Number(event.target.value) / 100)}
              aria-label="TruckersFM volume"
            />
            <span className="volumeValue">{Math.round(volume * 100)}%</span>
          </div>
        </div>
        <audio ref={audioRef} preload="none" />
      </div>
    </div>
  );
}
