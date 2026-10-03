import "./globals.css";
import Link from "next/link";
import { RadioPlayer } from "../components/RadioPlayer";

export const metadata = {
  title: "OpenHaul",
  description: "Open-source ETS2 and ATS telemetry, VTC and convoy platform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <div className="shell navInner">
            <Link className="brand" href="/">Open<span>Haul</span></Link>
            <div className="links">
              <Link href="/map">Live Map</Link>
              <Link href="/radio">Radio</Link>
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
