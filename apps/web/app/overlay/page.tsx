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

type RepeatMode = "off" | "one" | "all";

type MediaQueueItem = {
  id: string;
  title: string;
  provider: string;
  sourceUrl: string;
  embedUrl: string;
};

type MusicSearchResult = {
  id: string;
  provider: "youtube" | "soundcloud";
  title: string;
  artist?: string;
  url: string;
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
  const musicFrameRef = useRef<HTMLIFrameElement>(null);
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
  const [musicSearchQuery, setMusicSearchQuery] = useState("");
  const [musicSearchResults, setMusicSearchResults] = useState<MusicSearchResult[]>([]);
  const [musicSearchLoading, setMusicSearchLoading] = useState(false);
  const [musicSearchError, setMusicSearchError] = useState("");
  const [musicUrl, setMusicUrl] = useState("");
  const [musicEmbedUrl, setMusicEmbedUrl] = useState("");
  const [musicProvider, setMusicProvider] = useState("");
  const [musicError, setMusicError] = useState("");
  const [musicPaused, setMusicPaused] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.7);
  const [pausedMusicEmbedUrl, setPausedMusicEmbedUrl] = useState("");
  const [mediaQueue, setMediaQueue] = useState<MediaQueueItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [queueReady, setQueueReady] = useState(false);

  useEffect(() => {
    document.body.classList.add("gameOverlayHost");
    window.chrome?.webview?.postMessage({ type: "overlay.ready" });

    try {
      const savedQueue = localStorage.getItem("openhaul.overlay.mediaQueue");
      const savedRepeat = localStorage.getItem("openhaul.overlay.repeatMode");
      if (savedQueue) {
        const parsed = JSON.parse(savedQueue);
        if (Array.isArray(parsed)) {
          setMediaQueue(parsed.filter((item: any) =>
            item && item.kind !== "radio" && typeof item.embedUrl === "string" && item.embedUrl
          ));
        }
      }
      if (savedRepeat === "off" || savedRepeat === "one" || savedRepeat === "all") {
        setRepeatMode(savedRepeat);
      }
    } catch {
      // Ignore invalid or unavailable local storage.
    }
    setQueueReady(true);

    return () => document.body.classList.remove("gameOverlayHost");
  }, []);

  useEffect(() => {
    if (!queueReady) return;
    try {
      localStorage.setItem("openhaul.overlay.mediaQueue", JSON.stringify(mediaQueue));
      localStorage.setItem("openhaul.overlay.repeatMode", repeatMode);
    } catch {
      // Queue persistence is optional.
    }
  }, [mediaQueue, queueReady, repeatMode]);

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

        const stations: RadioStation[] = (data.stations ?? []).flatMap((station, index): RadioStation[] => {
          const url = station.playback?.direct || station.playback?.browser || "";
          if (!url || /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/i.test(url)) return [];
          return [{
            id: "catalog-" + (station.id || station.stationUuid || index),
            name: station.name || "Unknown station",
            url,
            country: station.country || undefined,
            language: station.language || undefined,
            genre: station.genre || undefined,
            codec: station.codec || undefined,
            bitrateKbps: station.bitrateKbps || undefined,
            source: station.source || "radio-browser",
          }];
        });

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

      const stations: RadioStation[] = (data.stations ?? []).flatMap((station, index): RadioStation[] => {
        const url = station.playback?.direct || station.playback?.browser || "";
        if (!url || /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/i.test(url)) return [];
        return [{
          id: "online-" + (station.id || station.stationUuid || index),
          name: station.name || "Unknown station",
          url,
          country: station.country || undefined,
          language: station.language || undefined,
          genre: station.genre || undefined,
          codec: station.codec || undefined,
          bitrateKbps: station.bitrateKbps || undefined,
          source: station.source || "public-directory",
        }];
      });

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
        const params = new URLSearchParams({ autoplay: "1", playsinline: "1", enablejsapi: "1", origin: window.location.origin });
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

    if (host === "music.yandex.ru" || host === "music.yandex.com") {
      const trackMatch = parsed.pathname.match(/\/album\/(\d+)\/track\/(\d+)/);
      if (trackMatch) {
        return {
          provider: "Yandex Music",
          url: "https://music.yandex.ru/iframe/#track/" + encodeURIComponent(trackMatch[2]) + "/" + encodeURIComponent(trackMatch[1]),
        };
      }
      throw new Error("Paste a Yandex Music track URL such as /album/ALBUM_ID/track/TRACK_ID.");
    }

    if (host === "bilibili.com" || host === "www.bilibili.com" || host === "m.bilibili.com" || host === "b23.tv") {
      const match = parsed.pathname.match(/\/(?:video\/)?(BV[A-Za-z0-9]+)/i);
      const bvid = match?.[1] || parsed.searchParams.get("bvid") || "";
      if (!bvid) throw new Error("Paste a Bilibili video URL containing a BV id.");
      return {
        provider: "Bilibili",
        url: "https://player.bilibili.com/player.html?bvid=" + encodeURIComponent(bvid) + "&autoplay=1",
      };
    }

    if (host === "twitch.tv" || host === "m.twitch.tv") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const channel = parts[0] || "";
      if (!channel || ["directory", "downloads", "jobs", "p", "settings", "subscriptions", "videos"].includes(channel.toLowerCase())) {
        throw new Error("Paste a Twitch channel URL such as https://twitch.tv/monstercat.");
      }
      const parent = window.location.hostname || "localhost";
      return {
        provider: "Twitch",
        url: "https://player.twitch.tv/?channel=" + encodeURIComponent(channel) +
          "&parent=" + encodeURIComponent(parent) + "&autoplay=true&muted=false",
      };
    }

    throw new Error("Supported without an API key: YouTube, SoundCloud, Spotify, Mixcloud, Apple Music, Twitch, Yandex Music, and Bilibili.");
  };

  const playQueueItem = async (index: number) => {
    const item = mediaQueue[index];
    if (!item) return;
    setQueueIndex(index);
    setMusicProvider(item.provider);
    setMusicPaused(false);
    setPausedMusicEmbedUrl("");
    setMusicEmbedUrl(item.embedUrl);
  };

  const addQueueItem = (item: MediaQueueItem, playNow = true) => {
    setMediaQueue((current) => {
      const existing = current.findIndex((entry) => entry.sourceUrl === item.sourceUrl);
      const next = existing >= 0 ? current : [...current, item];
      const index = existing >= 0 ? existing : next.length - 1;
      if (playNow) {
        setQueueIndex(index);
        setMusicProvider(next[index].provider);
        setMusicPaused(false);
        setPausedMusicEmbedUrl("");
        setMusicEmbedUrl(next[index].embedUrl);
      }
      return next;
    });
  };

  const nextQueueItem = async () => {
    if (!mediaQueue.length) return;
    if (repeatMode === "one" && queueIndex >= 0) {
      await playQueueItem(queueIndex);
      return;
    }

    const next = queueIndex + 1;
    if (next < mediaQueue.length) {
      await playQueueItem(next);
      return;
    }
    if (repeatMode === "all") await playQueueItem(0);
  };

  const previousQueueItem = async () => {
    if (!mediaQueue.length) return;
    const previous = queueIndex > 0 ? queueIndex - 1 : repeatMode === "all" ? mediaQueue.length - 1 : 0;
    await playQueueItem(previous);
  };

  const removeQueueItem = (index: number) => {
    setMediaQueue((current) => current.filter((_, itemIndex) => itemIndex !== index));
    if (index === queueIndex) {
      setMusicEmbedUrl("");
      setMusicProvider("");
      setQueueIndex(-1);
    } else if (index < queueIndex) {
      setQueueIndex((current) => Math.max(-1, current - 1));
    }
  };

  const clearQueue = () => {
    setMediaQueue([]);
    setQueueIndex(-1);
    setMusicEmbedUrl("");
    setMusicProvider("");
  };

  const cycleRepeatMode = () => {
    setRepeatMode((current) => current === "off" ? "all" : current === "all" ? "one" : "off");
  };

  const searchMusic = async () => {
    const query = musicSearchQuery.trim();
    if (!query) return;

    setMusicSearchLoading(true);
    setMusicSearchError("");
    try {
      const response = await fetch(
        api + "/api/v1/public/music/search?q=" + encodeURIComponent(query) + "&limit=16",
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Music search returned HTTP " + response.status);

      const data = await response.json() as { results?: MusicSearchResult[] };
      setMusicSearchResults(data.results ?? []);
    } catch (error) {
      setMusicSearchResults([]);
      setMusicSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      setMusicSearchLoading(false);
    }
  };

  const addMusicSearchResult = (result: MusicSearchResult) => {
    try {
      const embed = buildMusicEmbed(result.url);
      const item: MediaQueueItem = {
        id: result.id,
        title: [result.artist, result.title].filter(Boolean).join(" - "),
        provider: embed.provider,
        sourceUrl: result.url,
        embedUrl: embed.url,
      };
      addQueueItem(item, true);
      setMusicError("");
    } catch (error) {
      setMusicError(error instanceof Error ? error.message : String(error));
    }
  };

  const loadMusicUrl = () => {
    try {
      const embed = buildMusicEmbed(musicUrl);
      const item: MediaQueueItem = {
        id: "media-" + Date.now(),
        title: musicUrl,
        provider: embed.provider,
        sourceUrl: musicUrl.trim(),
        embedUrl: embed.url,
      };
      setMusicError("");
      addQueueItem(item, true);
    } catch (error) {
      setMusicProvider("");
      setMusicEmbedUrl("");
      setMusicError(error instanceof Error ? error.message : String(error));
    }
  };

  const playRadio = async (station: RadioStation) => {
    const audio = audioRef.current;
    if (!audio || !station.url) return;

    setSelectedRadioId(station.id);
    if (audio.src !== station.url) audio.src = station.url;

    try {
      await audio.play();
      setRadioPlaying(true);
    } catch {
      setRadioPlaying(false);
    }
  };

  const toggleRadioPlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !selectedRadio) return;

    if (!audio.paused) {
      audio.pause();
      setRadioPlaying(false);
      return;
    }

    if (!audio.src) audio.src = selectedRadio.url;
    try {
      await audio.play();
      setRadioPlaying(true);
    } catch {
      setRadioPlaying(false);
    }
  };

  const stopRadio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    setRadioPlaying(false);
  };

  const pauseMusic = () => {
    if (!musicEmbedUrl) return;

    if (musicProvider === "YouTube") {
      musicFrameRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
        "*",
      );
      setMusicPaused(true);
      return;
    }

    setPausedMusicEmbedUrl(musicEmbedUrl);
    setMusicEmbedUrl("");
    setMusicPaused(true);
  };

  const resumeMusic = () => {
    if (musicProvider === "YouTube" && musicFrameRef.current) {
      musicFrameRef.current.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        "*",
      );
      setMusicPaused(false);
      return;
    }

    if (pausedMusicEmbedUrl) {
      setMusicEmbedUrl(pausedMusicEmbedUrl);
      setPausedMusicEmbedUrl("");
      setMusicPaused(false);
    }
  };

  const applyMusicVolume = (value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setMusicVolume(next);

    if (musicProvider === "YouTube") {
      musicFrameRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "setVolume", args: [Math.round(next * 100)] }),
        "*",
      );
    }
  };

  const stopMusic = () => {
    setMusicEmbedUrl("");
    setPausedMusicEmbedUrl("");
    setMusicPaused(false);
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
                <div className="gameOverlayRadioButtonRow">
                  <button
                    className="gameOverlayRadioPlay"
                    disabled={!selectedRadio}
                    onClick={() => void toggleRadioPlayback()}
                  >
                    {radioPlaying ? "Ⅱ Pause" : "▶ Play"}
                  </button>
                  <button
                    className="gameOverlayRadioStop"
                    disabled={!selectedRadio}
                    onClick={stopRadio}
                  >
                    ■ Stop
                  </button>
                </div>
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
                <h2>Search music</h2>
                <p>
                  Search by artist and title, for example <strong>Artist - Title</strong>.
                  OpenHaul searches public YouTube and SoundCloud results, then you can add one directly to the Music playlist.
                </p>
              </div>
              <div className="gameOverlayMusicUrl">
                <input
                  value={musicSearchQuery}
                  onChange={(event) => {
                    setMusicSearchQuery(event.target.value);
                    setMusicSearchError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void searchMusic();
                  }}
                  placeholder="Artist - Title"
                  aria-label="Search music by artist and title"
                />
                <button type="button" disabled={!musicSearchQuery.trim() || musicSearchLoading} onClick={() => void searchMusic()}>
                  {musicSearchLoading ? "Searching…" : "Search"}
                </button>
              </div>

              {musicSearchError ? <div className="gameOverlayRadioEmpty">{musicSearchError}</div> : null}

              {musicSearchResults.length ? (
                <div className="gameOverlayMusicSearchResults">
                  {musicSearchResults.map((result) => (
                    <div key={result.id}>
                      <span>
                        <strong>{result.title}</strong>
                        <small>
                          {[result.artist, result.provider === "youtube" ? "YouTube" : "SoundCloud"].filter(Boolean).join(" · ")}
                        </small>
                      </span>
                      <button type="button" onClick={() => addMusicSearchResult(result)}>Add & play</button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="gameOverlayMusicDivider"><span>or paste a URL</span></div>

              <div>
                <h2>Play music from a link</h2>
                <p>
                  Paste a public link from YouTube (including Live), SoundCloud, Spotify, Mixcloud, Apple Music, Twitch, Yandex Music, or Bilibili.
                  Links are added to the Music playlist and use each platform's official player. Radio stays separate and is never added to this playlist.
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
                  placeholder="YouTube / SoundCloud / Spotify / Mixcloud / Apple Music / Twitch / Yandex / Bilibili URL"
                  aria-label="Music URL"
                />
                <button type="button" disabled={!musicUrl.trim()} onClick={loadMusicUrl}>
                  Add & play
                </button>
              </div>
              <div className="gameOverlayMusicProviders">
                <span>YouTube</span>
                <span>YouTube Live</span>
                <span>SoundCloud</span>
                <span>Spotify</span>
                <span>Mixcloud</span>
                <span>Apple Music</span>
                <span>Twitch</span>
                <span>Yandex Music</span>
                <span>Bilibili</span>
              </div>
              {musicError ? <div className="gameOverlayRadioEmpty">{musicError}</div> : null}
            </section>

            <section className="gameOverlayPlaylist">
              <div className="gameOverlayPlaylistHead">
                <div>
                  <h2>Playlist</h2>
                  <p>{mediaQueue.length} item{mediaQueue.length === 1 ? "" : "s"} · Repeat {repeatMode.toUpperCase()}</p>
                </div>
                <div className="gameOverlayPlaylistActions">
                  <button type="button" onClick={() => void previousQueueItem()} disabled={!mediaQueue.length}>⏮ Previous</button>
                  <button type="button" onClick={() => void nextQueueItem()} disabled={!mediaQueue.length}>Next ⏭</button>
                  <button type="button" onClick={cycleRepeatMode}>Repeat: {repeatMode}</button>
                  <button type="button" onClick={clearQueue} disabled={!mediaQueue.length}>Clear</button>
                </div>
              </div>
              <div className="gameOverlayPlaylistItems">
                {mediaQueue.map((item, index) => (
                  <div key={item.id + "-" + index} className={index === queueIndex ? "active" : ""}>
                    <button type="button" className="gameOverlayPlaylistPlay" onClick={() => void playQueueItem(index)}>
                      <span>{index === queueIndex ? "▶" : String(index + 1)}</span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.provider}</small>
                      </span>
                    </button>
                    <button type="button" className="gameOverlayPlaylistRemove" onClick={() => removeQueueItem(index)}>×</button>
                  </div>
                ))}
                {!mediaQueue.length ? <div className="gameOverlayMusicEmpty"><span>Add music, video, or livestream links to build your Music playlist.</span></div> : null}
              </div>
            </section>

            <section className="gameOverlayMusicPlayer">
              {(musicEmbedUrl || pausedMusicEmbedUrl) ? (
                <>
                  <div className="gameOverlayMusicPlayerHead">
                    <div>
                      <strong>{musicProvider}</strong>
                      <small>Official embedded player · no OpenHaul media proxy</small>
                    </div>
                    <div className="gameOverlayMusicTransport">
                      <button type="button" onClick={musicPaused ? resumeMusic : pauseMusic}>
                        {musicPaused ? "▶ Resume" : "Ⅱ Pause"}
                      </button>
                      <button type="button" onClick={stopMusic}>■ Stop</button>
                      <label className="gameOverlayMusicVolume">
                        <span>Volume {Math.round(musicVolume * 100)}%</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={Math.round(musicVolume * 100)}
                          onChange={(event) => applyMusicVolume(Number(event.target.value) / 100)}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="gameOverlayMusicPlayerPlaceholder">
                    <strong>{musicProvider} is playing</strong>
                    <span>The official player stays mounted so audio/video can continue when you switch overlay tabs.</span>
                  </div>
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

        {musicEmbedUrl ? (
          <div className={"gameOverlayPersistentMedia " + (tab === "music" ? "visible" : "background")}>
            <iframe
              ref={musicFrameRef}
              key={musicEmbedUrl}
              onLoad={() => {
                if (musicProvider === "YouTube") {
                  setTimeout(() => applyMusicVolume(musicVolume), 250);
                }
              }}
              src={musicEmbedUrl}
              title={musicProvider + " background player"}
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
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
