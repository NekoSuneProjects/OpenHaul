# OpenHaul

OpenHaul is an open-source, self-hosted ETS2 and ATS trucking platform with live telemetry, VTC management, convoy tracking, Discord integration, public APIs, live maps, TruckersMP support, TruckersFM radio, donations and Docker deployment.

## Current foundation

- Global realtime live-driver API and `/map`
- VTC-filtered live data with `?vtc=ID`
- Redis-backed realtime presence
- VTC-scoped API-key middleware
- Jobs and fines data models
- Discord bot foundation for VTC activity/fine feeds
- TruckersFM now-playing proxy, persistent player and full radio page
- Donation/DLC funding goals with admin management
- PostgreSQL + Redis
- Docker Compose self-hosting
- GitHub Actions builds for GHCR
- Windows telemetry client with simulator, Steam ETS2/ATS detection and plugin installer
- Native SCS Telemetry SDK plugin built against official SDK 1.15
- Named-pipe bridge between the in-game DLL and Windows client
- MapLibre geographic ETS2/ATS live map with real game-coordinate projection

## Quick start

```bash
git clone https://github.com/NekoSuneProjects/OpenHaul.git
cd OpenHaul
cp .env.example .env
docker compose up -d --build
```

Then open `http://localhost:3000`. The API listens on `http://localhost:3001`.

## Services

| Service | Purpose |
| --- | --- |
| `web` | Next.js community site, global/VTC map and radio UI |
| `api` | Fastify REST API, live presence, VTC API-key access |
| `bot` | Discord bot for VTC events, jobs and fines |
| `postgres` | Persistent application data |
| `redis` | Realtime driver presence and future websocket fan-out |

## API

Public, no key:

```text
GET /health
GET /api/v1/public/live
GET /api/v1/public/live?vtc=123
GET /api/v1/public/vtcs/:id
GET /api/v1/public/vtcs/:id/live
GET /api/v1/public/vtcs/:id/stats
GET /api/v1/public/vtcs/:id/leaderboard
GET /api/v1/public/donation-goals
GET /api/v1/public/radio/truckersfm
WS  /api/v1/public/live/ws
```

Protected VTC endpoints use either:

```http
Authorization: Bearer oh_vtc_...
```

or:

```http
X-API-Key: oh_vtc_...
```

The API key is resolved to a VTC server-side. Callers cannot choose another VTC ID to escape their scope.

Telemetry ingestion currently uses a deployment-level `OPENHAUL_INGEST_KEY` while the desktop client authentication flow is being built:

```http
POST   /api/v1/telemetry/live
DELETE /api/v1/telemetry/live/:driverId
X-Ingest-Key: your-secret
```

## Map

```text
/map
/map?vtc=123
```

The first shows every OpenHaul driver currently publishing telemetry. The second filters the same realtime source to one VTC.

Raw ETS2/ATS world coordinates are converted to longitude/latitude and rendered with MapLibre. ETS2's legacy UK authored scale is handled separately. Set `NEXT_PUBLIC_MAP_STYLE_URL` to use your own MapLibre style; when unset, OpenHaul uses an OpenStreetMap raster fallback.

## TruckersFM

OpenHaul proxies TruckersFM's AzuraCast now-playing feed from:

```text
https://azuracast.truckers.fm/api/nowplaying/1
```

and the web player uses the station's returned `listen_url`.

## Docker images

The included GitHub Actions workflow builds:

```text
ghcr.io/nekosuneprojects/openhaul-web
ghcr.io/nekosuneprojects/openhaul-api
ghcr.io/nekosuneprojects/openhaul-bot
```

Tags pushed to `main` publish `latest`; Git tags publish matching semantic-version tags.

## Roadmap

See [TODO.md](TODO.md).

## License

MIT


## Windows client

Builds are produced by `.github/workflows/windows-client.yml`.

Useful development commands:

```powershell
# Show detected Steam installations
OpenHaul.Client.exe --detect-games

# Install a built native telemetry DLL into detected ETS2/ATS installs
OpenHaul.Client.exe --install-plugin .\OpenHaul.Telemetry.dll

# Publish simulated ETS2 telemetry for testing the live map/API
OpenHaul.Client.exe --simulate
```

The native SCS plugin writes newline-delimited telemetry events to `\\.\pipe\OpenHaulTelemetry`.

## Native SCS plugin

The plugin is built by `.github/workflows/scs-plugin.yml` against SCS Telemetry SDK 1.15 and produces `OpenHaul.Telemetry.dll`.

It currently publishes world position, heading, speed, RPM, fuel, odometer, navigation data, truck/job configuration, player fines, and completed-job events.
