import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <section className="hero homeHero">
        <div>
          <span className="eyebrow">OpenHaul driver network</span>
          <h1>Truck smarter. Run your VTC your way.</h1>
          <p className="lede">
            A self-hostable ETS2 and ATS platform for live telemetry, driver logbooks,
            VTC operations, convoys, economy, Discord automation and an in-game OpenHaul overlay.
          </p>
          <div className="actions">
            <Link className="button primary" href="/dashboard">Open driver hub</Link>
            <Link className="button" href="/map">View live map</Link>
            <Link className="button" href="/releases">Download client</Link>
          </div>
        </div>

        <div className="homeVisual" aria-hidden="true">
          <div className="homeVisualRing" />
          <div className="homeVisualCard">
            <Image src="/branding/openhaul-icon-192.png" alt="" width={58} height={58} />
            <h3>OpenHaul</h3>
            <p className="muted">ETS2 + ATS telemetry network</p>
            <div style={{ marginTop: 22, display: "grid", gap: 10 }}>
              <div className="pill"><span className="liveDot" /> Client + telemetry connected</div>
              <div className="driver" style={{ gridTemplateColumns: "1fr auto", padding: 12 }}>
                <div><strong>Live driver overlay</strong><small>Speed · route · cargo · ETA</small></div>
                <strong style={{ color: "var(--accent)" }}>F8</strong>
              </div>
              <div className="driver" style={{ gridTemplateColumns: "1fr auto", padding: 12 }}>
                <div><strong>VTC operations</strong><small>Members · economy · dispatch</small></div>
                <strong style={{ color: "var(--accent)" }}>LIVE</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="statsStrip">
        <div><small>Games</small><strong>ETS2 + ATS</strong></div>
        <div><small>Deployment</small><strong>Self hosted</strong></div>
        <div><small>Client</small><strong>Windows + overlay</strong></div>
        <div><small>Platform</small><strong>Open source</strong></div>
      </section>

      <div className="sectionTitle">
        <div>
          <span className="eyebrow">Everything connected</span>
          <h2 style={{ marginTop: 12 }}>One place for the whole haul.</h2>
        </div>
      </div>

      <section className="grid">
        <article className="card">
          <div className="pill">LIVE</div>
          <h3 style={{ marginTop: 14 }}>Driver telemetry</h3>
          <p>Live position, speed, truck, cargo, route, fines, jobs and game overlay data from your OpenHaul telemetry plugin.</p>
        </article>
        <article className="card">
          <div className="pill">VTC</div>
          <h3 style={{ marginTop: 14 }}>Company operations</h3>
          <p>Members, recruitment, roles, warnings, shifts, fleet, contracts, dispatch, financial reports and Discord automation.</p>
        </article>
        <article className="card">
          <div className="pill">DRIVER</div>
          <h3 style={{ marginTop: 14 }}>Career & logbook</h3>
          <p>Searchable deliveries, career stats, progression, economy, challenges, achievements and public driver profiles.</p>
        </article>
        <article className="card">
          <div className="pill">MAP</div>
          <h3 style={{ marginTop: 14 }}>Live tracking</h3>
          <p>Filter drivers by game, VTC, status and server with heading arrows, follow camera modes and shareable map links.</p>
        </article>
        <article className="card">
          <div className="pill">DISCORD</div>
          <h3 style={{ marginTop: 14 }}>Bot integration</h3>
          <p>Applications, job notifications, moderation, statistics, events, achievements and configurable VTC channels.</p>
        </article>
        <article className="card">
          <div className="pill">OPEN</div>
          <h3 style={{ marginTop: 14 }}>Own your stack</h3>
          <p>Docker-first deployment, PostgreSQL migrations, scoped APIs, backup/restore tooling and no dependency on a closed VTC service.</p>
        </article>
      </section>
    </main>
  );
}
