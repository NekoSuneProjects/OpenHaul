"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type SiiStation = {
  id: string;
  url: string;
  name: string;
  genre: string;
  language: string;
  bitrate: string;
  favorite: boolean;
  healthStatus?: "unchecked" | "scanning" | "working" | "repaired" | "broken";
  healthRoute?: string;
  healthReason?: string;
  detectedCodec?: string;
  originalUrl?: string;
  proxyCountry?: string;
  detectedCountry?: string;
  detectedBy?: string;
  matchedStation?: string;
};

type DirectoryStation = {
  id: string;
  name: string;
  country?: string | null;
  state?: string | null;
  language?: string | null;
  genre?: string | null;
  bitrateKbps?: number | null;
  routing?: { proxyRequired?: boolean; country?: string | null; region?: string | null };
  playback?: { gameMp3?: string | null };
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "";

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function decodeSiiText(value: string) {
  return value
    .replace(/\\\\/g, "\\")
    .replace(/\\\"/g, '"');
}

function encodeSiiText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, " ")
    .replace(/\|/g, "/")
    .trim();
}

function parseLiveStreams(text: string): SiiStation[] {
  if (!/^\s*SiiNunit\b/m.test(text) || !/live_stream_def\s*:/m.test(text)) {
    throw new Error("This does not look like an ETS2/ATS live_streams.sii file.");
  }

  const entries: SiiStation[] = [];
  const regex = /stream_data\[\d+\]\s*:\s*"((?:\\.|[^"])*)"/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    const decoded = decodeSiiText(match[1]);
    const parts = decoded.split("|");
    if (parts.length < 2) continue;

    entries.push({
      id: makeId(),
      url: parts[0]?.trim() ?? "",
      name: parts[1]?.trim() ?? "",
      genre: parts[2]?.trim() ?? "",
      language: parts[3]?.trim() ?? "",
      bitrate: parts[4]?.trim() || "128",
      favorite: (parts[5]?.trim() ?? "0") === "1",
      healthStatus: "unchecked",
      proxyCountry: "",
    });
  }

  if (!entries.length) {
    throw new Error("No stream_data entries were found in this file.");
  }
  return entries;
}

function serializeLiveStreams(stations: SiiStation[]) {
  const rows = stations.map((station, index) => {
    const value = [
      encodeSiiText(station.url),
      encodeSiiText(station.name),
      encodeSiiText(station.genre),
      encodeSiiText(station.language),
      encodeSiiText(station.bitrate || "128"),
      station.favorite ? "1" : "0",
    ].join("|");
    return ` stream_data[${index}]: "${value}"`;
  });

  return [
    "SiiNunit",
    "{",
    "live_stream_def : _nameless.1b4.1e6a.8108 {",
    ` stream_data: ${stations.length}`,
    ...rows,
    "}",
    "",
    "}",
    "",
  ].join("\n");
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function blankStation(): SiiStation {
  return {
    id: makeId(),
    url: "",
    name: "New radio station",
    genre: "",
    language: "EN",
    bitrate: "128",
    favorite: false,
    healthStatus: "unchecked",
    proxyCountry: "",
  };
}

export default function RadioSiiEditorPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stations, setStations] = useState<SiiStation[]>([]);
  const [filename, setFilename] = useState("live_streams.sii");
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("Upload your current live_streams.sii or start a new list.");
  const [country, setCountry] = useState("CA");
  const [radioSearch, setRadioSearch] = useState("");
  const [directory, setDirectory] = useState<DirectoryStation[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });


  useEffect(() => {
    try {
      const key = "openhaul-radio-sii-queue";
      const queued = JSON.parse(window.localStorage.getItem(key) || "[]");
      if (!Array.isArray(queued) || queued.length === 0) return;

      const mapped: SiiStation[] = queued
        .filter((item: any) => item?.url && item?.name)
        .map((item: any) => ({
          id: makeId(),
          url: String(item.url),
          name: String(item.name),
          genre: String(item.genre || ""),
          language: String(item.language || "EN"),
          bitrate: String(item.bitrate || "128"),
          favorite: Boolean(item.favorite),
        }));

      if (mapped.length) {
        setStations((current) => {
          const urls = new Set(current.map((station) => station.url));
          return [...current, ...mapped.filter((station) => !urls.has(station.url))];
        });
        setMessage(`Loaded ${mapped.length} station${mapped.length === 1 ? "" : "s"} selected from the OpenHaul Radio page.`);
      }
      window.localStorage.removeItem(key);
    } catch {
      // Ignore a malformed browser queue and leave the editor usable.
    }
  }, []);

  const visibleStations = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return stations.map((station, index) => ({ station, index }));
    return stations
      .map((station, index) => ({ station, index }))
      .filter(({ station }) =>
        [station.name, station.url, station.genre, station.language]
          .some((value) => value.toLowerCase().includes(q))
      );
  }, [stations, filter]);

  const runHealthScan = async (inputStations: SiiStation[] = stations) => {
    if (!inputStations.length || scanning) return;

    setScanning(true);
    setScanProgress({ done: 0, total: inputStations.length });
    setStations((current) => current.map((station) => ({
      ...station,
      healthStatus: inputStations.some((candidate) => candidate.id === station.id) ? "scanning" : station.healthStatus,
    })));
    setMessage(`Scanning ${inputStations.length} radio URLs. OpenHaul will try direct playback, MP3 repair, then a residential proxy fallback.`);

    let done = 0;
    const chunkSize = 8;

    try {
      for (let start = 0; start < inputStations.length; start += chunkSize) {
        const chunk = inputStations.slice(start, start + chunkSize);
        const response = await fetch(`${api}/api/v1/public/radio/scan`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            stations: chunk.map((station) => ({
              id: station.id,
              url: station.url,
              ...(station.proxyCountry?.trim() ? { preferredCountry: station.proxyCountry.trim().toUpperCase() } : {}),
            })),
          }),
        });

        if (!response.ok) throw new Error(`Radio scanner returned HTTP ${response.status}`);
        const data = await response.json();
        const results = new Map<string, any>((data.results ?? []).map((row: any) => [String(row.id), row]));

        setStations((current) => current.map((station) => {
          const row = results.get(station.id);
          if (!row) return station;

          const replacement = row.replacementUrl ? String(row.replacementUrl) : null;
          return {
            ...station,
            originalUrl: replacement && replacement !== station.url ? (station.originalUrl || station.url) : station.originalUrl,
            url: replacement || station.url,
            bitrate: replacement ? "128" : station.bitrate,
            healthStatus: row.status === "working" ? "working" : row.status === "repaired" ? "repaired" : "broken",
            healthRoute: String(row.route || ""),
            healthReason: String(row.reason || ""),
            detectedCodec: row.codec ? String(row.codec).toUpperCase() : "",
            proxyCountry: row.proxy?.country
              ? String(row.proxy.country)
              : row.detectedCountry
                ? String(row.detectedCountry)
                : station.proxyCountry,
            detectedCountry: row.detectedCountry ? String(row.detectedCountry) : station.detectedCountry,
            detectedBy: row.detectedBy ? String(row.detectedBy) : station.detectedBy,
            matchedStation: row.matchedStation ? String(row.matchedStation) : station.matchedStation,
          };
        }));

        done += chunk.length;
        setScanProgress({ done, total: inputStations.length });
      }

      setMessage("Radio scan complete. Repaired URLs were applied automatically. Review broken stations before downloading the .sii file.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Radio health scan failed.");
      setStations((current) => current.map((station) =>
        station.healthStatus === "scanning" ? { ...station, healthStatus: "unchecked" } : station
      ));
    } finally {
      setScanning(false);
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = parseLiveStreams(await file.text());
      setStations(parsed);
      setFilename(file.name || "live_streams.sii");
      setMessage(`Imported ${parsed.length} stations. Starting radio health scan…`);
      window.setTimeout(() => void runHealthScan(parsed), 0);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to read this .sii file.");
    } finally {
      event.target.value = "";
    }
  };

  const patch = (index: number, change: Partial<SiiStation>) => {
    setStations((current) => current.map((station, i) => i === index ? { ...station, ...change } : station));
  };

  const remove = (index: number) => {
    setStations((current) => current.filter((_, i) => i !== index));
  };

  const move = (index: number, direction: -1 | 1) => {
    setStations((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  };

  const loadDirectory = async () => {
    setDirectoryLoading(true);
    try {
      const params = new URLSearchParams({ country, page: "1", pageSize: "100" });
      if (radioSearch.trim()) params.set("q", radioSearch.trim());
      const response = await fetch(`${api}/api/v1/public/radio/directory?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load OpenHaul Radio.");
      const data = await response.json();
      setDirectory(data.stations ?? []);
    } catch {
      setDirectory([]);
    } finally {
      setDirectoryLoading(false);
    }
  };

  const addDirectoryStation = (radio: DirectoryStation) => {
    if (!radio.playback?.gameMp3) return;
    setStations((current) => [...current, {
      id: makeId(),
      url: radio.playback!.gameMp3!,
      name: radio.name,
      genre: radio.genre || "",
      language: (radio.language || "EN").split(",")[0].trim().slice(0, 8),
      bitrate: String(radio.bitrateKbps || 128),
      favorite: false,
      healthStatus: "unchecked",
      proxyCountry: radio.country || "",
    }]);
    setMessage(`Added ${radio.name} using its OpenHaul ATS/ETS2 MP3 URL.`);
  };

  const exportFile = () => {
    if (!stations.length) {
      setMessage("Add or import at least one radio station first.");
      return;
    }
    downloadText(filename.endsWith(".sii") ? filename : "live_streams.sii", serializeLiveStreams(stations));
    setMessage(`Downloaded ${stations.length} stations. The count and stream_data indexes were rebuilt automatically.`);
  };

  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 24 }}>
        <span className="eyebrow">SCS radio tool</span>
        <h1 style={{ fontSize: "clamp(2.5rem,6vw,4.8rem)" }}>live_streams.sii Editor</h1>
        <p className="lede">
          Import your Euro Truck Simulator 2 or American Truck Simulator radio file, edit it safely, add stations from OpenHaul Radio, then download a game-ready replacement.
        </p>
        <div className="actions">
          <button className="button primary" onClick={() => fileRef.current?.click()}>Import .sii</button>
          <button className="button" onClick={() => setStations((current) => [...current, blankStation()])}>Add blank station</button>
          <button className="button" disabled={scanning || !stations.length} onClick={() => void runHealthScan()}>
            {scanning ? `Scanning ${scanProgress.done}/${scanProgress.total}` : "Scan & repair radios"}
          </button>
          <button className="button" onClick={() => {
            const broken = stations.filter((station) => station.healthStatus === "broken").length;
            if (!broken) return;
            if (window.confirm(`Delete ${broken} broken radio station${broken === 1 ? "" : "s"}?`)) {
              setStations((current) => current.filter((station) => station.healthStatus !== "broken"));
              setMessage(`Deleted ${broken} broken radio station${broken === 1 ? "" : "s"}.`);
            }
          }}>Delete broken</button>
          <button className="button" onClick={exportFile}>Download edited .sii</button>
          <Link className="button" href="/radio">Back to Radio</Link>
          <input ref={fileRef} type="file" accept=".sii,text/plain" hidden onChange={importFile} />
        </div>
      </section>

      <section className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
          <div><small className="muted">File</small><strong style={{ display: "block", marginTop: 5 }}>{filename}</strong></div>
          <div><small className="muted">Stations</small><strong style={{ display: "block", marginTop: 5 }}>{stations.length}</strong></div>
          <div><small className="muted">Favourite stations</small><strong style={{ display: "block", marginTop: 5 }}>{stations.filter((s) => s.favorite).length}</strong></div>
          <div><small className="muted">Working</small><strong style={{ display: "block", marginTop: 5 }}>{stations.filter((s) => s.healthStatus === "working").length}</strong></div>
          <div><small className="muted">Repaired</small><strong style={{ display: "block", marginTop: 5 }}>{stations.filter((s) => s.healthStatus === "repaired").length}</strong></div>
          <div><small className="muted">Broken</small><strong style={{ display: "block", marginTop: 5, color: stations.some((s) => s.healthStatus === "broken") ? "var(--danger)" : undefined }}>{stations.filter((s) => s.healthStatus === "broken").length}</strong></div>
          <div><small className="muted">Status</small><span style={{ display: "block", marginTop: 5 }}>{message}</span></div>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 22 }}>
        <div className="sectionTitle" style={{ paddingTop: 0 }}>
          <div>
            <span className="eyebrow">OpenHaul directory</span>
            <h2 style={{ marginTop: 12 }}>Add international radios</h2>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "130px minmax(220px,1fr) auto", gap: 10 }}>
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="CA">Canada</option>
            <option value="US">United States</option>
            <option value="GB">United Kingdom</option>
            <option value="DE">Germany</option>
            <option value="FR">France</option>
            <option value="NL">Netherlands</option>
            <option value="BE">Belgium</option>
            <option value="ES">Spain</option>
            <option value="IT">Italy</option>
            <option value="PL">Poland</option>
            <option value="SE">Sweden</option>
            <option value="NO">Norway</option>
            <option value="FI">Finland</option>
            <option value="DK">Denmark</option>
            <option value="AU">Australia</option>
            <option value="NZ">New Zealand</option>
          </select>
          <input
            value={radioSearch}
            onChange={(e) => setRadioSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void loadDirectory(); }}
            placeholder="Search radios..."
          />
          <button className="button primary" onClick={() => void loadDirectory()} disabled={directoryLoading}>
            {directoryLoading ? "Loading…" : "Search"}
          </button>
        </div>

        {directory.length > 0 ? (
          <div className="driverList" style={{ padding: "16px 0 0" }}>
            {directory.slice(0, 30).map((radio) => (
              <div className="driver" key={radio.id} style={{ gridTemplateColumns: "1.4fr .8fr .8fr auto" }}>
                <div><strong>{radio.name}</strong><small>{[radio.state, radio.country].filter(Boolean).join(" · ")}</small></div>
                <div><strong>{radio.genre || "Radio"}</strong><small>{radio.language || "—"}</small></div>
                <div>
                  <span className="pill">{radio.routing?.proxyRequired ? `Residential · ${radio.routing.country || radio.routing.region}` : "Direct"}</span>
                  <small style={{ display: "block", marginTop: 5 }}>{radio.bitrateKbps || 128} kbps</small>
                </div>
                <button className="button" onClick={() => addDirectoryStation(radio)}>Add to .sii</button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card">
        <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 16 }}>
          <label style={{ flex: "1 1 280px" }}>
            <small>Filter imported stations</small>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name, genre, URL or language…" style={{ marginTop: 6 }} />
          </label>
          <button className="button" onClick={() => setStations([])}>Clear list</button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1320 }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ padding: 8 }}>#</th>
                <th style={{ padding: 8 }}>Station</th>
                <th style={{ padding: 8 }}>Stream URL</th>
                <th style={{ padding: 8 }}>Genre</th>
                <th style={{ padding: 8 }}>Lang</th>
                <th style={{ padding: 8 }}>kbps</th>
                <th style={{ padding: 8 }}>Fav</th>
                <th style={{ padding: 8 }}>Health</th>
                <th style={{ padding: 8 }}>Proxy country</th>
                <th style={{ padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleStations.map(({ station, index }) => (
                <tr key={station.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: 8, color: "var(--muted)" }}>{index}</td>
                  <td style={{ padding: 8 }}><input value={station.name} onChange={(e) => patch(index, { name: e.target.value })} /></td>
                  <td style={{ padding: 8 }}><input value={station.url} onChange={(e) => patch(index, { url: e.target.value })} /></td>
                  <td style={{ padding: 8 }}><input value={station.genre} onChange={(e) => patch(index, { genre: e.target.value })} /></td>
                  <td style={{ padding: 8 }}><input value={station.language} onChange={(e) => patch(index, { language: e.target.value })} style={{ width: 70 }} /></td>
                  <td style={{ padding: 8 }}><input value={station.bitrate} inputMode="numeric" onChange={(e) => patch(index, { bitrate: e.target.value.replace(/\D/g, "").slice(0, 4) })} style={{ width: 76 }} /></td>
                  <td style={{ padding: 8, textAlign: "center" }}>
                    <input type="checkbox" checked={station.favorite} onChange={(e) => patch(index, { favorite: e.target.checked })} />
                  </td>
                  <td style={{ padding: 8 }}>
                    <span className="pill" style={{ color: station.healthStatus === "broken" ? "var(--danger)" : undefined }}>
                      {station.healthStatus === "working" ? "Working" :
                       station.healthStatus === "repaired" ? (station.healthRoute === "residential-proxy" ? "Repaired · proxy" : "Repaired · MP3") :
                       station.healthStatus === "broken" ? "Broken" :
                       station.healthStatus === "scanning" ? "Scanning…" : "Unchecked"}
                    </span>
                    <small title={station.healthReason || ""} style={{ display: "block", marginTop: 5 }}>
                      {[station.detectedCodec, station.healthRoute].filter(Boolean).join(" · ") || "—"}
                    </small>
                    {station.detectedCountry ? (
                      <small style={{ display: "block", marginTop: 5 }}>
                        Country: {station.detectedCountry}
                        {station.detectedBy ? ` · ${station.detectedBy}` : ""}
                        {station.matchedStation ? ` · ${station.matchedStation}` : ""}
                      </small>
                    ) : null}
                  </td>
                  <td style={{ padding: 8 }}>
                    <input
                      value={station.proxyCountry || ""}
                      maxLength={2}
                      placeholder="Auto"
                      title="Optional 2-letter residential proxy country used if direct playback fails"
                      onChange={(e) => patch(index, { proxyCountry: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) })}
                      style={{ width: 72 }}
                    />
                  </td>
                  <td style={{ padding: 8 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="button" title="Move up" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                      <button className="button" title="Move down" disabled={index === stations.length - 1} onClick={() => move(index, 1)}>↓</button>
                      <button className="button" title="Remove" onClick={() => remove(index)}>×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!stations.length ? (
          <div style={{ padding: "34px 8px", textAlign: "center" }}>
            <h3>No radio file loaded</h3>
            <p className="muted">Import live_streams.sii, add a blank station, or search the OpenHaul radio directory above.</p>
          </div>
        ) : null}
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h3>Install the downloaded file</h3>
        <p>
          Replace your game's existing <code>live_streams.sii</code> with the downloaded file in the game's user profile/config location. Keep a backup of your old file first.
          The editor automatically writes the correct <code>stream_data</code> count and sequential indexes.
        </p>
      </section>
    </main>
  );
}
