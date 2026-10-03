import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import Image from "next/image";
import { RadioPlayer } from "../components/RadioPlayer";

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
            <div className="links">
              <Link href="/map">Live Map</Link>
              <Link href="/vtcs">VTCs</Link>
              <Link href="/account">Account</Link>
              <Link href="/radio">Radio</Link>
              <Link href="/streamers">Streamers</Link>
              <Link href="/support">Support</Link>
              <Link href="/api-docs">API</Link>
              <a href="https://github.com/NekoSuneProjects/OpenHaul">GitHub</a>
            </div>
          </div>
        </nav>
        {children}
        <RadioPlayer />
      </body>
    </html>
  );
}
