"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { overlayRadioStations } from "../../lib/radioStations";

declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessage: (message: unknown) => void;
      };
    };
  }
}

type Tab = "map" | "drive" | "missions" | "radio" | "music" | "settings";

type RadioStation = {
  id: string;
  name: string;
  url: string;
  genre?: string;
  language?: string;
  bitrateKbps?: number;
  country?: string;
  codec?: string;
  source?: string;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

function OverlayContent() {
  const params = useSearchParams();
  const driver = params.get("driver") ?? "";
  const hotkey = params.get("hotkey") || "Alt+I";
  const initialMode = params.get("mode") ?? "road";
  const initialSize = params.get("size") ?? "medium";
  const initialTraffic = params.get("traffic") !== "0";
  const initialStaff = params.get("staff") !== "0";
  const initialMissions = params.get("missions") !== "0";

  const [tab, setTab] = useState<Tab>("map");
  const [mapMode, setMapMode] = useState(initialMode);
  const [mapSize, setMapSize] = useState(initialSize);
  const [driverData, setDriverData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [intel, setIntel] = useState<any>({ traffic: [], staff: [], specialCargo: [] });
  const [trafficAlerts, setTrafficAlerts] = useState(initialTraffic);
  const [staffAlerts, setStaffAlerts] = useState(initialStaff);
  const [cargoMissions, setCargoMissions] = useState(initialMissions);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [radioStations] = useState<RadioStation[]>(overlayRadioStations);
  const [selectedRadioId, setSelectedRadioId] = useState(overlayRadioStations[0]?.id || "");
  const [radioQuery, setRadioQuery] = useState("");
  const [onlineRadioStations, setOnlineRadioStations] = useState<RadioStation[]>([]);
  const [catalogRadioStations, setCatalogRadioStations] = useState<RadioStation[]>([]);
  const [catalogRadioLoading, setCatalogRadioLoading] = useState(true);
  const [onlineRadioLoading, setOnlineRadioLoading] = useState(false);
  const [onlineRadioError, setOnlineRadioError] = useState("");
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioVolume, setRadioVolume] = useState(0.7);
  const [musicUrl, setMusicUrl] = useState("");
  const [musicEmbedUrl, setMusicEmbedUrl] = useState("");
  const [musicProvider, setMusicProvider] = useState("");
  const [musicError, setMusicError] = useState("");

  useEffect(() => {
    document.body.classList.add("gameOverlayHost");
    window.chrome?.webview?.postMessage({ type: "overlay.ready" });
    return () => document.body.classList.remove("gameOverlayHost");
  }, []);

  useEffect(() => {
    if (!driver) return;
    let active = true;

    const load = async () => {
      try {
        const response = await fetch(api + "/api/v1/public/drivers/" + encodeURIComponent(driver), {
          cache: "no-store",
        });
        if (!active) return;
        if (!response.ok) {
          setConnected(false);
          return;
        }
        setDriverData(await response.json());
        setConnected(true);
      } catch {
        if (active) setConnected(false);
      }
    };

    void load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [driver]);

  useEffect(() => {
    let active = true;
    const load = () => fetch(api + "/api/v1/public/map-intelligence", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { traffic: [], staff: [], specialCargo: [] })
      .then((data) => { if (active) setIntel(data); })
      .catch(() => {});
    void load();
    const timer = setInterval(load, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = radioVolume;
  }, [radioVolume]);

  useEffect(() => {
    let active = true;

    const loadLargeRadioCatalog = async () => {
      setCatalogRadioLoading(true);
      try {
        const response = await fetch(api + "/api/v1/public/radio/catalog?limit=20000", {
          cache: "force-cache",
        });
        if (!response.ok) throw new Error("Large radio catalog returned HTTP " + response.status);

        const data = await response.json() as {
          stations?: Array<{
            id?: string;
            stationUuid?: string | null;
            name?: string;
            country?: string | null;
            language?: string | null;
            genre?: string | null;
            codec?: string | null;
            bitrateKbps?: number | null;
            source?: string | null;
            playback?: { direct?: string | null; browser?: string | null };
          }>;
        };

        if (!active) return;

        const stations: RadioStation[] = (data.stations ?? [])
          .map((station, index) => {
            const url = station.playback?.direct || station.playback?.browser || "";
            if (!url || /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/i.test(url)) return null;
            return {
              id: "catalog-" + (station.id || station.stationUuid || index),
              name: station.name || "Unknown station",
              url,
              country: station.country || undefined,
              language: station.language || undefined,
              genre: station.genre || undefined,
              codec: station.codec || undefined,
              bitrateKbps: station.bitrateKbps || undefined,
              source: station.source || "radio-browser",
            } satisfies RadioStation;
          })
          .filter((station): station is RadioStation => station !== null);

        setCatalogRadioStations(stations);
      } catch {
        if (active) setCatalogRadioStations([]);
      } finally {
        if (active) setCatalogRadioLoading(false);
      }
    };

    void loadLargeRadioCatalog();
    return () => { active = false; };
  }, []);

  const setPreference = (key: "traffic" | "staff" | "missions", value: boolean) => {
    if (key === "traffic") setTrafficAlerts(value);
    if (key === "staff") setStaffAlerts(value);
    if (key === "missions") setCargoMissions(value);
    window.chrome?.webview?.postMessage({ type: "overlay.preference", key, value });
  };

  const filteredRadioStations = useMemo(() => {
    const query = radioQuery.trim().toLowerCase();
    const combined = [...radioStations, ...catalogRadioStations];
    if (!query) return combined;
    return combined.filter((station) =>
      [station.name, station.genre, station.language, station.country, station.codec]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [radioQuery, radioStations, catalogRadioStations]);

  const allRadioSearchResults = useMemo(() => {
    const seen = new Set<string>();
    return [...filteredRadioStations, ...onlineRadioStations].filter((station) => {
      const key = (station.url + "|" + station.name).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredRadioStations, onlineRadioStations]);

  const allVisibleRadioStations = useMemo(
    () => allRadioSearchResults.slice(0, radioQuery.trim() ? 1000 : 500),
    [allRadioSearchResults, radioQuery],
  );

  const selectedRadio = useMemo(
    () => [...radioStations, ...catalogRadioStations, ...onlineRadioStations].find((station) => station.id === selectedRadioId)
      ?? radioStations[0]
      ?? catalogRadioStations[0]
      ?? onlineRadioStations[0]
      ?? null,
    [radioStations, catalogRadioStations, onlineRadioStations, selectedRadioId],
  );

  const searchOnlineRadio = async () => {
    const query = radioQuery.trim();
    if (!query) return;

    setOnlineRadioLoading(true);
    setOnlineRadioError("");
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "100",
        country: "ALL",
        q: query,
      });
      const response = await fetch(api + "/api/v1/public/radio/directory?" + params.toString(), {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Public radio search returned HTTP " + response.status);

      const data = await response.json() as {
        stations?: Array<{
          id?: string;
          stationUuid?: string | null;
          name?: string;
          country?: string | null;
          language?: string | null;
          genre?: string | null;
          codec?: string | null;
          bitrateKbps?: number | null;
          source?: string | null;
          playback?: { direct?: string | null; browser?: string | null };
        }>;
      };

      const stations: RadioStation[] = (data.stations ?? [])
        .map((station, index) => {
          const url = station.playback?.direct || station.playback?.browser || "";
          if (!url || /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/i.test(url)) return null;
          return {
            id: "online-" + (station.id || station.stationUuid || index),
            name: station.name || "Unknown station",
            url,
            country: station.country || undefined,
            language: station.language || undefined,
            genre: station.genre || undefined,
            codec: station.codec || undefined,
            bitrateKbps: station.bitrateKbps || undefined,
            source: station.source || "public-directory",
          } satisfies RadioStation;
        })
        .filter((station): station is RadioStation => station !== null);

      setOnlineRadioStations(stations);
    } catch (error) {
      setOnlineRadioStations([]);
      setOnlineRadioError(error instanceof Error ? error.message : String(error));
    } finally {
      setOnlineRadioLoading(false);
    }
  };

  const buildMusicEmbed = (value: string) => {
    const raw = value.trim();
    if (!raw) throw new Error("Paste a music link first.");

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error("That is not a valid URL.");
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtu.be") {
      let videoId = "";
      let playlistId = parsed.searchParams.get("list") || "";

      if (host === "youtu.be") {
        videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
      } else if (parsed.pathname === "/watch") {
        videoId = parsed.searchParams.get("v") || "";
      } else {
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (["shorts", "embed", "live"].includes(parts[0] || "")) videoId = parts[1] || "";
      }

      if (videoId) {
        const params = new URLSearchParams({ autoplay: "1", playsinline: "1" });
        if (playlistId) params.set("list", playlistId);
        return {
          provider: "YouTube",
          url: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`,
        };
      }

      if (playlistId) {
        return {
          provider: "YouTube",
          url: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(playlistId)}&autoplay=1`,
        };
      }

      throw new Error("Could not find a YouTube video or playlist ID in that link.");
    }

    if (host === "soundcloud.com" || host.endsWith(".soundcloud.com")) {
      return {
        provider: "SoundCloud",
        url: "https://w.soundcloud.com/player/?url=" + encodeURIComponent(raw) + "&auto_play=true&show_artwork=true&visual=true",
      };
    }

    if (host === "open.spotify.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const type = parts[0];
      const id = parts[1];
      if (!type || !id || !["track", "album", "playlist", "artist", "episode", "show"].includes(type)) {
        throw new Error("Paste a Spotify track, album, playlist, artist, episode, or show URL.");
      }
      return {
        provider: "Spotify",
        url: `https://open.spotify.com/embed/${type}/${encodeURIComponent(id)}?utm_source=openhaul`,
      };
    }

    if (host === "mixcloud.com") {
      const feed = parsed.pathname.endsWith("/") ? parsed.pathname : parsed.pathname + "/";
      if (feed === "/") throw new Error("Paste a Mixcloud show, track, playlist, or profile URL.");
      return {
        provider: "Mixcloud",
        url: "https://www.mixcloud.com/widget/iframe/?hide_cover=1&mini=0&autoplay=1&feed=" + encodeURIComponent(feed),
      };
    }

    if (host === "music.apple.com") {
      return {
        provider: "Apple Music",
        url: "https://embed.music.apple.com" + parsed.pathname + parsed.search,
      };
    }

    throw new Error("Supported without an API key: YouTube, SoundCloud, Spotify, Mixcloud, and Apple Music.");
  };

  const loadMusicUrl = () => {
    try {
      const embed = buildMusicEmbed(musicUrl);
      setMusicProvider(embed.provider);
      setMusicEmbedUrl(embed.url);
      setMusicError("");
    } catch (error) {
      setMusicProvider("");
      setMusicEmbedUrl("");
      setMusicError(error instanceof Error ? error.message : String(error));
    }
  };

  const playRadio = async (station: RadioStation) => {
    const audio = audioRef.current;
    const stream = station.url;
    if (!audio || !stream) return;

    if (selectedRadioId === station.id && !audio.paused) {
      audio.pause();
      setRadioPlaying(false);
      return;
    }

    setSelectedRadioId(station.id);
    if (audio.src !== stream) audio.src = stream;

    try {
      await audio.play();
      setRadioPlaying(true);
    } catch {
      setRadioPlaying(false);
    }
  };

  const mapUrl = useMemo(() => {
    const qs = new URLSearchParams({ embed: "1", mode: mapMode });
    if (driver) qs.set("driver", driver);
    return "/map?" + qs.toString();
  }, [driver, mapMode]);

  const updateMapMode = (value: string) => {
    setMapMode(value);
    window.chrome?.webview?.postMessage({ type: "overlay.mapType", value });
  };

  const updateMapSize = (value: string) => {
    setMapSize(value);
    window.chrome?.webview?.postMessage({ type: "overlay.mapSize", value });
  };

  const close = () => {
    window.chrome?.webview?.postMessage({ type: "overlay.hide" });
  };

  const live = driverData?.live;
  const stats = driverData?.stats ?? {};
  const recentJob = driverData?.recentJobs?.[0];

  return (
    <main className={"gameOverlay gameOverlay-" + mapSize}>
      <aside className="gameOverlayRail">
        <div className="gameOverlayBrand">
          <span className="gameOverlayMark">OH</span>
          <div>
            <strong>OpenHaul</strong>
            <small>GAME OVERLAY</small>
          </div>
        </div>

        <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>
          <span>◎</span><span>Map</span>
        </button>
        <button className={tab === "drive" ? "active" : ""} onClick={() => setTab("drive")}>
          <span>▦</span><span>Drive</span>
        </button>
        <button className={tab === "missions" ? "active" : ""} onClick={() => setTab("missions")}>
          <span>★</span><span>Missions</span>
        </button>
        <button className={tab === "radio" ? "active" : ""} onClick={() => setTab("radio")}>
          <span>♫</span><span>Radio</span>
        </button>
        <button className={tab === "music" ? "active" : ""} onClick={() => setTab("music")}>
          <span>▶</span><span>Music</span>
        </button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          <span>⚙</span><span>Settings</span>
        </button>

        <div className="gameOverlayRailSpacer" />

        <div className={"gameOverlayConnection " + (connected ? "online" : "offline")}>
          <span />
          {connected ? "LIVE" : "WAITING"}
        </div>
        <button onClick={close}><span>×</span><span>Close</span></button>
      </aside>

      <section className="gameOverlayPanel">
        <header className="gameOverlayHeader">
          <div>
            <strong>{tab === "map" ? "Live Map" : tab === "drive" ? "Drive Session" : tab === "missions" ? "OpenHaul Cargo Missions" : tab === "radio" ? "Live Radio" : tab === "music" ? "Music Player" : "Overlay Settings"}</strong>
            <small>{driver || "No OpenHaul driver linked"}</small>
          </div>
          <div className="gameOverlayStatus">
            <span className="gameOverlayKey">{hotkey}</span>
            <span>show / hide</span>
          </div>
        </header>

        {tab === "map" ? (
          <div className="gameOverlayMapWrap">
            <iframe src={mapUrl} title="OpenHaul live map" className="gameOverlayMap" />
            <div className="gameOverlayMapBadge">
              <strong>{live?.username || driverData?.user?.displayName || "Your truck"}</strong>
              <span>{live ? Math.round(Number(live.speedKph || 0)) + " km/h" : "Waiting for live telemetry"}</span>
            </div>
          </div>
        ) : null}

        {tab === "drive" ? (
          <div className="gameOverlayDrive">
            <div className="gameOverlayMetric">
              <small>Speed</small>
              <strong>{live ? Math.round(Number(live.speedKph || 0)) : 0}</strong>
              <span>km/h</span>
            </div>
            <div className="gameOverlayMetric">
              <small>Speed limit</small>
              <strong>{live?.speedLimitKph ? Math.round(Number(live.speedLimitKph)) : "—"}</strong>
              <span>km/h</span>
            </div>
            <div className="gameOverlayMetric">
              <small>Fuel</small>
              <strong>{live?.fuel ? Math.round(Number(live.fuel)) : "—"}</strong>
              <span>litres</span>
            </div>
            <div className="gameOverlayMetric">
              <small>Career distance</small>
              <strong>{Math.round(Number(stats.distanceKm || 0)).toLocaleString()}</strong>
              <span>km</span>
            </div>

            <article className="gameOverlayJob">
              <div className="pill">CURRENT / RECENT JOB</div>
              <h2>{live?.cargo || recentJob?.cargo || "Free drive"}</h2>
              <p>
                {(live?.sourceCity || recentJob?.sourceCity || "Unknown")} → {(live?.destinationCity || recentJob?.destinationCity || "Unknown")}
              </p>
              <div className="gameOverlayJobStats">
                <span>{live?.navigationDistanceM ? Math.round(Number(live.navigationDistanceM) / 1000) + " km remaining" : "No navigation distance"}</span>
                <span>{live?.truck || "Truck unknown"}</span>
                <span>{String(live?.game || recentJob?.game || "").toUpperCase()}</span>
                {live?.cargo ? <span>Cargo damage {Number(live?.cargoDamagePercent ?? 0).toFixed(1)}%</span> : <span>Truck damage {Number(live?.truckDamagePercent ?? 0).toFixed(1)}%</span>}
                {live?.cargo ? <span>Trailer damage {Number(live?.trailerDamagePercent ?? 0).toFixed(1)}%</span> : null}
                {live?.specialJob ? <span>⭐ SCS Special Transport</span> : null}
              </div>
            </article>
          </div>
        ) : null}

        {tab === "missions" ? (
          <div className="gameOverlaySettings">
            <section>
              <h2>Special cargo events</h2>
              <p>OpenHaul missions are overlay challenges. They do not inject jobs into the SCS economy; you accept or match them while hauling the requested cargo/route.</p>
              <div className="grid" style={{ padding: 0 }}>
                {(cargoMissions ? intel.specialCargo ?? [] : []).map((mission: any) => (
                  <article className="card" key={mission.id ?? mission.key}>
                    <div className="pill">{mission.eventType || "SPECIAL CARGO"}</div>
                    <h3>{mission.title || mission.cargo || mission.key}</h3>
                    <p>{mission.description || [mission.sourceCity, mission.destinationCity].filter(Boolean).join(" → ") || "OpenHaul event mission"}</p>
                    <small className="muted">
                      {mission.cargo ? "Cargo: " + mission.cargo : ""}
                      {mission.reward ? " · Reward: " + mission.reward : ""}
                    </small>
                  </article>
                ))}
                {cargoMissions && (intel.specialCargo ?? []).length === 0 ? <article className="card"><p>No OpenHaul special cargo missions are active.</p></article> : null}
                {!cargoMissions ? <article className="card"><p>Cargo missions are disabled in overlay settings.</p></article> : null}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "radio" ? (
          <div className="gameOverlayRadio">
            <section className="gameOverlayRadioNow">
              <div className="gameOverlayRadioArt">
                <span>♫</span>
              </div>
              <div className="gameOverlayRadioMeta">
                <small>NOW TUNED</small>
                <h2>{selectedRadio?.name || "Choose a station"}</h2>
                <p>
                  {[selectedRadio?.genre, selectedRadio?.language, selectedRadio?.bitrateKbps ? selectedRadio.bitrateKbps + " kbps" : null]
                    .filter(Boolean)
                    .join(" · ") || "OpenHaul radio"}
                </p>
                <span className="gameOverlayRadioRoute">Direct station stream · no OpenHaul proxy</span>
              </div>
              <div className="gameOverlayRadioControls">
                <button
                  className="gameOverlayRadioPlay"
                  disabled={!selectedRadio}
                  onClick={() => selectedRadio && void playRadio(selectedRadio)}
                >
                  {radioPlaying ? "Ⅱ Pause" : "▶ Play"}
                </button>
                <label>
                  <span>Volume {Math.round(radioVolume * 100)}%</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(radioVolume * 100)}
                    onChange={(event) => setRadioVolume(Number(event.target.value) / 100)}
                  />
                </label>
              </div>
            </section>

            <section className="gameOverlayRadioLocal">
              <strong>Local PC playback</strong>
              <small>
                The overlay keeps your bundled stations and loads up to 20,000 additional public stations for browsing and search.
                OpenHaul is used only to fetch station metadata; playback always uses the selected station's original stream URL directly on your PC.
              </small>
            </section>

            <section className="gameOverlayRadioDirectory">
              <div className="gameOverlayRadioDirectoryHead">
                <div>
                  <h2>Stations</h2>
                  <p>
                    {catalogRadioLoading
                      ? "Loading 20,000-station catalog…"
                      : (radioStations.length + catalogRadioStations.length).toLocaleString() + " stations available"}
                    {onlineRadioStations.length ? " · " + onlineRadioStations.length + " extra search results" : ""}
                  </p>
                </div>
                <div className="gameOverlayRadioSearch">
                  <input
                    value={radioQuery}
                    onChange={(event) => {
                      setRadioQuery(event.target.value);
                      setOnlineRadioStations([]);
                      setOnlineRadioError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void searchOnlineRadio();
                    }}
                    placeholder="Search station, country, genre, language or codec"
                    aria-label="Search radio stations"
                  />
                  <button
                    type="button"
                    disabled={!radioQuery.trim() || onlineRadioLoading}
                    onClick={() => void searchOnlineRadio()}
                  >
                    {onlineRadioLoading ? "Searching…" : "Search online"}
                  </button>
                </div>
              </div>

              <div className="gameOverlayRadioStations">
                {allVisibleRadioStations.map((station) => {
                  const active = selectedRadio?.id === station.id;
                  return (
                    <button
                      key={station.id}
                      className={active ? "active" : ""}
                      onClick={() => void playRadio(station)}
                    >
                      <span className="gameOverlayRadioStationIcon">♫</span>
                      <span>
                        <strong>{station.name}</strong>
                        <small>
                          {[station.country, station.genre, station.language, station.codec?.toUpperCase(), station.bitrateKbps ? station.bitrateKbps + " kbps" : null]
                            .filter(Boolean)
                            .join(" · ") || "Internet radio"}
                        </small>
                      </span>
                      <span className="gameOverlayRadioStationAction">
                        {active && radioPlaying ? "Ⅱ" : "▶"}
                      </span>
                    </button>
                  );
                })}
                {allVisibleRadioStations.length === 0 ? (
                  <div className="gameOverlayRadioEmpty">No stations match that search.</div>
                ) : null}
                {allRadioSearchResults.length > allVisibleRadioStations.length ? (
                  <div className="gameOverlayRadioEmpty">
                    Showing {allVisibleRadioStations.length.toLocaleString()} of {allRadioSearchResults.length.toLocaleString()} matches. Search to narrow the list.
                  </div>
                ) : null}
                {onlineRadioError ? (
                  <div className="gameOverlayRadioEmpty">Online search failed: {onlineRadioError}</div>
                ) : null}
              </div>
            </section>
            <audio
              ref={audioRef}
              preload="none"
              onPlay={() => setRadioPlaying(true)}
              onPause={() => setRadioPlaying(false)}
              onEnded={() => setRadioPlaying(false)}
            />
          </div>
        ) : null}

        {tab === "music" ? (
          <div className="gameOverlayMusic">
            <section className="gameOverlayMusicInput">
              <div>
                <h2>Play music from a link</h2>
                <p>
                  Paste a public link from YouTube, SoundCloud, Spotify, Mixcloud, or Apple Music.
                  OpenHaul uses the platform's official embedded player and does not download or proxy the media.
                </p>
              </div>
              <div className="gameOverlayMusicUrl">
                <input
                  value={musicUrl}
                  onChange={(event) => {
                    setMusicUrl(event.target.value);
                    setMusicError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") loadMusicUrl();
                  }}
                  placeholder="https://youtube.com/watch?v=... or SoundCloud / Spotify / Mixcloud / Apple Music"
                  aria-label="Music URL"
                />
                <button type="button" disabled={!musicUrl.trim()} onClick={loadMusicUrl}>
                  Load player
                </button>
              </div>
              <div className="gameOverlayMusicProviders">
                <span>YouTube</span>
                <span>SoundCloud</span>
                <span>Spotify</span>
                <span>Mixcloud</span>
                <span>Apple Music</span>
              </div>
              {musicError ? <div className="gameOverlayRadioEmpty">{musicError}</div> : null}
            </section>

            <section className="gameOverlayMusicPlayer">
              {musicEmbedUrl ? (
                <>
                  <div className="gameOverlayMusicPlayerHead">
                    <strong>{musicProvider}</strong>
                    <small>Official embedded player · no OpenHaul media proxy</small>
                  </div>
                  <iframe
                    key={musicEmbedUrl}
                    src={musicEmbedUrl}
                    title={musicProvider + " player"}
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </>
              ) : (
                <div className="gameOverlayMusicEmpty">
                  <strong>No music loaded</strong>
                  <span>Paste a supported public link above to open its player.</span>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {tab === "settings" ? (
          <div className="gameOverlaySettings">
            <section>
              <h2>Map style</h2>
              <p>Choose the same map styles available on the OpenHaul website.</p>
              <div className="gameOverlayChoices">
                {["road", "satellite", "xray"].map((value) => (
                  <button key={value} className={mapMode === value ? "active" : ""} onClick={() => updateMapMode(value)}>
                    {value === "road" ? "Road" : value === "satellite" ? "Satellite" : "X-Ray"}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2>Map panel size</h2>
              <p>Controls how much of the game the overlay workspace occupies.</p>
              <div className="gameOverlayChoices">
                {["compact", "medium", "large"].map((value) => (
                  <button key={value} className={mapSize === value ? "active" : ""} onClick={() => updateMapSize(value)}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2>Tracking</h2>
              <p>
                When the overlay map opens it automatically follows your OpenHaul driver in real time.
                The website live map now also starts following any player you click.
              </p>
            </section>

            <section>
              <h2>Detection & alerts</h2>
              <div className="gameOverlayChoices">
                <button className={trafficAlerts ? "active" : ""} onClick={() => setPreference("traffic", !trafficAlerts)}>
                  Traffic jams {trafficAlerts ? "ON" : "OFF"}
                </button>
                <button className={staffAlerts ? "active" : ""} onClick={() => setPreference("staff", !staffAlerts)}>
                  Staff markers {staffAlerts ? "ON" : "OFF"}
                </button>
                <button className={cargoMissions ? "active" : ""} onClick={() => setPreference("missions", !cargoMissions)}>
                  Cargo missions {cargoMissions ? "ON" : "OFF"}
                </button>
              </div>
              <p style={{ marginTop: 14 }}>
                TruckersMP staff markers only appear when the server owner configures a trusted TruckersMP staff presence feed.
                OpenHaul staff markers come from OpenHaul's own admin records.
              </p>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}


export default function OverlayPage() {
  return (
    <Suspense fallback={<main className="gameOverlay"><section className="gameOverlayPanel"><div className="gameOverlayHeader"><strong>Loading OpenHaul overlay…</strong></div></section></main>}>
      <OverlayContent />
    </Suspense>
  );
}
