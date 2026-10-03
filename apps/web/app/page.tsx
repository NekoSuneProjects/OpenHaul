import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Open source · self hosted</span>
        <h1>Your VTC, telemetry and convoys in one stack.</h1>
        <p className="lede">
          OpenHaul is a community-owned platform for Euro Truck Simulator 2 and American Truck Simulator:
          live drivers, VTC tooling, jobs, fines, Discord activity, convoy tracking, public APIs and radio.
        </p>
        <div className="actions">
          <Link className="button primary" href="/map">Open live map</Link>
          <a className="button" href="https://github.com/NekoSuneProjects/OpenHaul">View source</a>
        </div>
      </section>

      <section className="grid">
        <article className="card"><h3>Global + VTC live views</h3><p>Show every OpenHaul driver or filter the same live feed with <code>?vtc=ID</code>.</p></article>
        <article className="card"><h3>VTC-scoped API keys</h3><p>Each protected key resolves to one VTC on the server, with granular scopes for jobs, fines and telemetry.</p></article>
        <article className="card"><h3>TruckersFM built in</h3><p>A persistent player uses the live AzuraCast metadata for artwork, song, presenter and listener stats.</p></article>
        <article className="card"><h3>Discord ready</h3><p>Bot foundations are included for red-light fines, speeding, jobs, online drivers and convoy announcements.</p></article>
        <article className="card"><h3>Docker first</h3><p>PostgreSQL, Redis, API, web and Discord bot can be deployed from one Docker Compose stack.</p></article>
        <article className="card"><h3>Community extensible</h3><p>The public live API needs no key while private VTC operational data stays behind scoped credentials.</p></article>
      </section>
    </main>
  );
}
