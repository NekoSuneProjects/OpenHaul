"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DirectoryStation = {
  id: string;
  stationUuid?: string | null;
  name: string;
  country?: string | null;
  region?: string | null;
  state?: string | null;
  language?: string | null;
  genre?: string | null;
  codec?: string | null;
  bitrateKbps?: number | null;
  homepage?: string | null;
  favicon?: string | null;
  routing?: {
    mode?: "direct" | "residential-proxy";
    proxyRequired?: boolean;
    country?: string | null;
    region?: string | null;
    networkType?: string | null;
  };
  playback?: {
    browser?: string | null;
    direct?: string | null;
    gameMp3?: string | null;
    ogg?: string | null;
    aac?: string | null;
  };
};

type DirectoryResponse = {
  country: string;
  page: number;
  pageSize: number;
  hasNext: boolean;
  stations: DirectoryStation[];
};

type Country = {
  code: string;
  count: number;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function badgeText(station: DirectoryStation) {
  if (station.routing?.proxyRequired) {
    return `Residential proxy · ${station.routing.country || station.routing.region || "regional"}`;
  }
  return "Direct · no proxy";
}

export default function RadioPage() {
  const [stations, setStations] = useState<DirectoryStation[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState("CA");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [codec, setCodec] = useState("");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetch(`${api}/api/v1/public/radio/countries`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setCountries(data.countries ?? []))
      .catch(() => setCountries([{ code: "CA", count: 0 }, { code: "US", count: 0 }, { code: "GB", count: 0 }]));
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({
        country,
        page: String(page),
        pageSize: "60",
      });
      if (query.trim()) params.set("q", query.trim());
      if (tag.trim()) params.set("tag", tag.trim());
      if (codec) params.set("codec", codec);

      try {
        const response = await fetch(`${api}/api/v1/public/radio/directory?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Radio directory unavailable");
        const data = await response.json() as DirectoryResponse;
        if (!active) return;
        setStations(data.stations ?? []);
        setHasNext(Boolean(data.hasNext));
      } catch {
        if (active) {
          setStations([]);
          setHasNext(false);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [country, query, tag, codec, page]);

  useEffect(() => setPage(1), [country, query, tag, codec]);

  const sortedCountries = useMemo(() => {
    const rows = [...countries];
    rows.sort((a, b) => {
      if (a.code === "CA") return -1;
      if (b.code === "CA") return 1;
      return countryName(a.code).localeCompare(countryName(b.code));
    });
    return rows;
  }, [countries]);

  const play = async (station: DirectoryStation) => {
    const audio = audioRef.current;
    const url = station.playback?.browser;
    if (!audio || !url) return;

    if (playingId === station.id && !audio.paused) {
      audio.pause();
      setPlayingId(null);
      return;
    }

    audio.src = url;
    try {
      await audio.play();
      setPlayingId(station.id);
    } catch {
      setPlayingId(null);
    }
  };

  const copyGameUrl = async (station: DirectoryStation) => {
    const url = station.playback?.gameMp3;
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiedId(station.id);
    window.setTimeout(() => setCopiedId((value) => value === station.id ? null : value), 1800);
  };

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 22 }}>
        <span className="eyebrow">OpenHaul Radio</span>
        <h1 style={{ fontSize: "clamp(2.5rem,6vw,4.8rem)" }}>Worldwide radio for the road.</h1>
        <p className="lede">
          Browse working internet radio by country. Public stations play directly; geo-restricted stations use a matching residential NekoRoute exit only when required.
        </p>
      </section>

      <section className="card" style={{ marginBottom: 22 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
          <label>
            <small className="muted">Country</small>
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              style={{ width: "100%", marginTop: 6 }}
            >
              {sortedCountries.map((item) => (
                <option value={item.code} key={item.code}>
                  {countryName(item.code)} ({item.code}){item.count ? ` · ${item.count}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <small className="muted">Station search</small>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="CBC, rock, jazz..."
              style={{ width: "100%", marginTop: 6 }}
            />
          </label>

          <label>
            <small className="muted">Genre / tag</small>
            <input
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder="rock, news, dance..."
              style={{ width: "100%", marginTop: 6 }}
            />
          </label>

          <label>
            <small className="muted">Source codec</small>
            <select value={codec} onChange={(event) => setCodec(event.target.value)} style={{ width: "100%", marginTop: 6 }}>
              <option value="">Any codec</option>
              <option value="MP3">MP3</option>
              <option value="AAC">AAC</option>
              <option value="AAC+">AAC+</option>
              <option value="OGG">OGG</option>
              <option value="FLAC">FLAC</option>
            </select>
          </label>
        </div>
      </section>

      <div className="sectionTitle">
        <div>
          <h2>{countryName(country)} radio</h2>
          <p className="muted" style={{ margin: 0 }}>
            {loading ? "Loading stations…" : `${stations.length} stations on this page`}
          </p>
        </div>
      </div>

      <section className="driverList" style={{ padding: 0 }}>
        {stations.map((station) => (
          <article
            className="driver"
            key={station.id}
            style={{ gridTemplateColumns: "minmax(240px,2fr) minmax(140px,1fr) minmax(180px,1fr) auto" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              {station.favicon ? (
                <img
                  src={station.favicon}
                  alt=""
                  loading="lazy"
                  style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 10, flex: "0 0 auto" }}
                  onError={(event) => { event.currentTarget.style.display = "none"; }}
                />
              ) : <div className="art" style={{ width: 44, height: 44, borderRadius: 10, flex: "0 0 auto" }} />}
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{station.name}</strong>
                <small>{[station.state, station.country].filter(Boolean).join(" · ") || countryName(country)}</small>
              </div>
            </div>

            <div>
              <strong>{station.genre || "Radio"}</strong>
              <small>{station.language || "—"}</small>
            </div>

            <div>
              <span className="pill">{badgeText(station)}</span>
              <small style={{ display: "block", marginTop: 6 }}>
                {station.codec || "Auto"}{station.bitrateKbps ? ` · ${station.bitrateKbps} kbps` : ""}
              </small>
            </div>

            <div className="actions" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="button" onClick={() => void play(station)}>
                {playingId === station.id ? "Pause" : "Play"}
              </button>
              <button className="button primary" onClick={() => void copyGameUrl(station)}>
                {copiedId === station.id ? "Copied" : "Copy ATS/ETS2 MP3"}
              </button>
            </div>
          </article>
        ))}

        {!loading && stations.length === 0 ? (
          <section className="card">
            <h3>No stations found</h3>
            <p>Try another country, search term, genre or codec.</p>
          </section>
        ) : null}
      </section>

      <div className="actions" style={{ justifyContent: "center", padding: "28px 0 50px" }}>
        <button className="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
          Previous
        </button>
        <span className="pill">Page {page}</span>
        <button className="button" disabled={!hasNext || loading} onClick={() => setPage((value) => value + 1)}>
          Next
        </button>
      </div>

      <audio
        ref={audioRef}
        preload="none"
        onEnded={() => setPlayingId(null)}
        onError={() => setPlayingId(null)}
      />
    </main>
  );
}
