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

const navSections = [
  {
    title: "Discover",
    items: [
      ["/", "⌂", "Home"],
      ["/dashboard", "▦", "Dashboard"],
      ["/map", "◎", "Live Map"],
      ["/logbook", "≣", "Logbook"],
    ],
  },
  {
    title: "Driver",
    items: [
      ["/cargo-market", "◇", "Cargo Market"],
      ["/fuel-station", "◉", "Fuel Station"],
      ["/economy", "£", "Economy"],
      ["/progression", "✦", "Progression"],
      ["/manual-job", "＋", "Manual Job"],
    ],
  },
  {
    title: "VTC",
    items: [
      ["/vtcs", "◆", "Companies"],
      ["/vtc-match", "⌕", "Find a VTC"],
      ["/community", "◌", "Community"],
      ["/streamers", "◉", "Streamers"],
    ],
  },
  {
    title: "OpenHaul",
    items: [
      ["/news", "▤", "News"],
      ["/releases", "⇩", "Downloads"],
      ["/tickets", "◫", "Tickets"],
      ["/radio", "♫", "Radio"],
      ["/support", "♡", "Support"],
      ["/api-docs", "⌘", "API"],
      ["/account", "●", "Profile"],
    ],
  },
] as const;

function SidebarLinks() {
  return (
    <>
      {navSections.map((section) => (
        <section className="sidebarSection" key={section.title}>
          <div className="sidebarLabel">{section.title}</div>
          <div className="sidebarLinks">
            {section.items.map(([href, icon, label]) => (
              <Link href={href} key={href}>
                <span className="sidebarIcon">{icon}</span>
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="appShell">
          <aside className="sidebar">
            <Link className="sidebarBrand" href="/" aria-label="OpenHaul home">
              <Image src="/branding/openhaul-icon-192.png" alt="" width={46} height={46} priority />
              <div>
                <strong>Open<span>Haul</span></strong>
                <small>DRIVER NETWORK</small>
              </div>
            </Link>

            <div className="sidebarStatus">
              <ClientStatus />
              <span className="statusHint">ETS2 · ATS</span>
            </div>

            <nav className="sidebarNav">
              <SidebarLinks />
            </nav>

            <div className="sidebarFooter">
              <a href="https://github.com/NekoSuneProjects/OpenHaul">
                <span className="sidebarIcon">⌘</span>
                <span>GitHub</span>
              </a>
              <small>Open source · self hosted</small>
            </div>
          </aside>

          <div className="appMain">
            <header className="mobileTopbar">
              <Link className="brand" href="/">
                <Image src="/branding/openhaul-icon-192.png" alt="" width={36} height={36} />
                <span className="brandWordmark">Open<span>Haul</span></span>
              </Link>
              <details className="mobileNav">
                <summary aria-label="Open navigation">☰</summary>
                <div className="mobileNavMenu">
                  <SidebarLinks />
                </div>
              </details>
            </header>

            <div className="contentFrame">
              {children}
            </div>
          </div>
        </div>
        <RadioPlayer />
      </body>
    </html>
  );
}
