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

type Tab = "map" | "drive" | "missions" | "radio" | "settings";

type RadioStation = {
  id: string;
  name: string;
  url: string;
  genre?: string;
  language?: string;
  bitrateKbps?: number;
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
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioVolume, setRadioVolume] = useState(0.7);

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

  const setPreference = (key: "traffic" | "staff" | "missions", value: boolean) => {
    if (key === "traffic") setTrafficAlerts(value);
    if (key === "staff") setStaffAlerts(value);
    if (key === "missions") setCargoMissions(value);
    window.chrome?.webview?.postMessage({ type: "overlay.preference", key, value });
  };

  const filteredRadioStations = useMemo(() => {
    const query = radioQuery.trim().toLowerCase();
    if (!query) return radioStations;
    return radioStations.filter((station) =>
      [station.name, station.genre, station.language]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [radioQuery, radioStations]);

  const selectedRadio = useMemo(
    () => radioStations.find((station) => station.id === selectedRadioId) ?? radioStations[0] ?? null,
    [radioStations, selectedRadioId],
  );

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
            <strong>{tab === "map" ? "Live Map" : tab === "drive" ? "Drive Session" : tab === "missions" ? "OpenHaul Cargo Missions" : tab === "radio" ? "Live Radio" : "Overlay Settings"}</strong>
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
                The station catalog is bundled directly with /overlay, and OpenHaul plays each station's original stream URL on your PC.
                No radio-directory API, OpenHaul audio proxy, or NekoRoute relay is used for playback.
              </small>
            </section>

            <section className="gameOverlayRadioDirectory">
              <div className="gameOverlayRadioDirectoryHead">
                <div>
                  <h2>Stations</h2>
                  <p>{filteredRadioStations.length + " stations shown · bundled with /overlay"}</p>
                </div>
                <input
                  value={radioQuery}
                  onChange={(event) => setRadioQuery(event.target.value)}
                  placeholder="Search station, genre or language"
                  aria-label="Search radio stations"
                />
              </div>

              <div className="gameOverlayRadioStations">
                {filteredRadioStations.map((station) => {
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
                          {[station.genre, station.language, station.bitrateKbps ? station.bitrateKbps + " kbps" : null]
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
                {filteredRadioStations.length === 0 ? (
                  <div className="gameOverlayRadioEmpty">No stations match that search.</div>
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
