const publicEndpoints = [
  ["GET", "/health", "API health"],
  ["GET", "/api/v1/public/live", "All live OpenHaul drivers"],
  ["GET", "/api/v1/public/live?vtc=ID", "Only one VTC's live drivers"],
  ["WS", "/api/v1/public/live/ws", "Realtime global driver feed"],
  ["WS", "/api/v1/public/live/ws?vtc=ID", "Realtime VTC-only driver feed"],
  ["GET", "/api/v1/public/vtcs", "Public VTC directory"],
  ["GET", "/api/v1/public/vtcs/:id/live", "Public live members for a VTC"],
  ["GET", "/api/v1/public/radio/truckersfm", "TruckersFM now-playing proxy"],
  ["GET", "/api/v1/public/donation-goals", "Public DLC/community funding goals"],
  ["GET", "/api/v1/public/map/assets", "Available locally generated ETS2/ATS PMTiles"],
  ["GET", "/api/v1/public/map/:game.pmtiles", "Range-enabled ETS2/ATS vector map asset"],
  ["GET", "/api/v1/public/drivers/:steamId", "Public Steam-linked driver profile"],
  ["GET", "/api/v1/public/vtcs/:id/community", "Public VTC company/member/recruitment data"],
];

const accountEndpoints = [
  ["GET", "/api/v1/auth/steam", "Start Steam OpenID login"],
  ["GET", "/api/v1/account/me", "Current Steam-linked account"],
  ["POST", "/api/v1/account/ownership/refresh", "Refresh Steam ownership"],
  ["GET", "/api/v1/account/dlc", "ETS2/ATS DLC catalogue and detection"],
  ["GET", "/api/v1/account/client-tokens", "List telemetry client tokens"],
  ["POST", "/api/v1/account/client-tokens", "Create telemetry client token"],
  ["GET", "/api/v1/account/vtcs", "List account VTC memberships"],
  ["POST", "/api/v1/account/vtcs", "Create Community VTC"],
  ["GET", "/api/v1/account/vtcs/:id/manage", "VTC management data"],
  ["POST", "/api/v1/account/vtcs/:id/apply", "Apply to join a VTC"],
  ["POST", "/api/v1/account/vtcs/:id/ledger", "Add VTC ledger entry"],
];

const protectedEndpoints = [
  ["GET", "/api/v1/vtc/me", "Resolve the VTC attached to the API key"],
  ["GET", "/api/v1/vtc/live", "VTC live telemetry"],
  ["GET", "/api/v1/vtc/jobs", "Recent VTC jobs"],
  ["GET", "/api/v1/vtc/fines", "Recent VTC fines"],
];

const adminEndpoints = [
  ["POST", "/api/v1/admin/donation-goals", "Create a funding goal"],
  ["PATCH", "/api/v1/admin/donation-goals/:id", "Update progress, target or visibility"],
];

const ingestEndpoints = [
  ["POST", "/api/v1/telemetry/live", "Live ETS2/ATS telemetry"],
  ["DELETE", "/api/v1/telemetry/live/:driverId", "Explicit driver offline/disconnect"],
  ["POST", "/api/v1/telemetry/fines", "Fine/penalty events"],
  ["POST", "/api/v1/telemetry/jobs/completed", "Completed jobs"],
];

function EndpointTable({ rows }: { rows: string[][] }) {
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map(([method, path, description]) => (
            <tr key={method + path}>
              <td style={{ padding: "10px 8px", color: "var(--accent)", fontWeight: 900 }}>{method}</td>
              <td style={{ padding: "10px 8px" }}><code>{path}</code></td>
              <td style={{ padding: "10px 8px", color: "var(--muted)" }}>{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <main className="shell">
      <section className="hero" style={{ paddingBottom: 18 }}>
        <span className="eyebrow">OpenHaul API v1</span>
        <h1 style={{ fontSize: "clamp(2.5rem,6vw,4.5rem)" }}>Build on the same trucking data.</h1>
        <p className="lede">
          Public live data does not require an API key. Private VTC operational data uses VTC-scoped keys,
          while telemetry ingestion is reserved for trusted clients.
        </p>
      </section>

      <div className="sectionTitle"><h2>Public API</h2></div>
      <EndpointTable rows={publicEndpoints} />

      <div className="sectionTitle"><h2>Steam account API</h2></div>
      <EndpointTable rows={accountEndpoints} />

      <div className="sectionTitle"><h2>VTC API key</h2></div>
      <div className="card" style={{ marginBottom: 14 }}>
        <p>Send <code>Authorization: Bearer oh_vtc_...</code> or <code>X-API-Key: oh_vtc_...</code>.</p>
        <p className="muted">The API derives the VTC ID from the key itself; a caller cannot switch to another VTC by changing a URL parameter.</p>
      </div>
      <EndpointTable rows={protectedEndpoints} />

      <div className="sectionTitle"><h2>Instance admin API</h2></div>
      <div className="card" style={{ marginBottom: 14 }}><p>Admin routes use <code>X-Admin-Key</code> and are intended for instance management, not VTC integrations.</p></div>
      <EndpointTable rows={adminEndpoints} />

      <div className="sectionTitle"><h2>Telemetry client API</h2></div>
      <div className="card" style={{ marginBottom: 14 }}>
        <p>Public users use account client tokens. Instance administrators can still use the trusted ingest key for server-side testing.</p>
      </div>
      <EndpointTable rows={ingestEndpoints} />
      <div style={{ height: 50 }} />
    </main>
  );
}
