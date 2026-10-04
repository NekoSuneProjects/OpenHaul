import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import Image from "next/image";
import { RadioPlayer } from "../components/RadioPlayer";
import { ClientStatus } from "../components/ClientStatus";

export const metadata = {
  title: "OpenHaul",
  description: "Open-source ETS2 and ATS telemetry, VTC and convoy platform.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/branding/openhaul-icon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/branding/openhaul-icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <div className="shell navInner">
            <Link className="brand" href="/" aria-label="OpenHaul home">
              <Image src="/branding/openhaul-icon-192.png" alt="" width={38} height={38} priority />
              <span className="brandWordmark">Open<span>Haul</span></span>
            </Link>
            <ClientStatus />
            <div className="links desktopLinks">
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/map">Live Map</Link>
              <Link href="/vtcs">VTCs</Link>
              <Link href="/vtc-match">Find VTC</Link>
              <Link href="/logbook">Logbook</Link>
              <Link href="/cargo-market">Cargo</Link>
              <Link href="/fuel-station">Fuel</Link>
              <Link href="/economy">Economy</Link>
              <Link href="/progression">Progression</Link>
              <Link href="/community">Community</Link>
              <Link href="/news">News</Link>
              <Link href="/releases">Downloads</Link>
              <Link href="/tickets">Tickets</Link>
              <Link href="/account">Profile</Link>
              <Link href="/radio">Radio</Link>
              <Link href="/streamers">Streamers</Link>
              <Link href="/support">Support</Link>
              <Link href="/api-docs">API</Link>
              <a href="https://github.com/NekoSuneProjects/OpenHaul">GitHub</a>
            </div>
            <details className="mobileNav">
              <summary aria-label="Open navigation">☰</summary>
              <div className="mobileNavMenu">
                <Link href="/">Home</Link>
                <Link href="/dashboard">Dashboard</Link>
                <Link href="/map">Live Map</Link>
                <Link href="/vtcs">VTC / Company</Link>
                <Link href="/vtc-match">Find a VTC</Link>
                <Link href="/logbook">Logbook</Link>
                <Link href="/cargo-market">Cargo Market</Link>
                <Link href="/fuel-station">Fuel Station</Link>
                <Link href="/economy">Economy</Link>
                <Link href="/progression">Rankings / Progression</Link>
                <Link href="/community">Community / Members</Link>
                <Link href="/news">News</Link>
                <Link href="/releases">Download Client</Link>
                <Link href="/tickets">Tickets</Link>
                <Link href="/account">Profile / Account</Link>
                <Link href="/radio">Radio</Link>
                <Link href="/streamers">Streamers</Link>
                <Link href="/support">Support</Link>
                <Link href="/api-docs">API</Link>
                <a href="https://github.com/NekoSuneProjects/OpenHaul">GitHub</a>
              </div>
            </details>
          </div>
        </nav>
        {children}
        <RadioPlayer />
      </body>
    </html>
  );
}
