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
- Optional real SCS road/prefab/city map overlay from locally generated PMTiles
- Smoothed/interpolated live truck movement between telemetry updates
- Steam OpenID account login and automatic account creation
- Steam-visible ETS2/ATS ownership plus DLC detection
- Public Steam-linked driver profiles
- Community VTC creation, recruitment, roles and member management
- Per-member VTC performance tracking
- VTC finance ledger with balance/income/expense totals
- Revocable per-account Windows client tokens
- Steam OpenID account creation/login
- Steam-visible ETS2/ATS ownership and DLC detection
- Public Steam-linked driver profiles
- Community VTC creation, recruitment, member roles and management
- Per-member VTC performance tracking
- VTC finance ledger with balance/income/expense totals
- Revocable per-account Windows client tokens

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
GET /api/v1/public/map/assets
GET /api/v1/public/map/ets2.pmtiles
GET /api/v1/public/map/ats.pmtiles
GET /api/v1/public/drivers/:steamId
GET /api/v1/public/vtcs/:id/community
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

Telemetry can use either a per-account client token or the deployment-level instance ingest key. Public users should create an `oh_client_...` token from `/account`; the shared ingest key is intended for instance administration/testing:

```http
POST   /api/v1/telemetry/live
DELETE /api/v1/telemetry/live/:driverId
Authorization: Bearer oh_client_...
# or, for instance administration:
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


## Real SCS road map data

OpenHaul automatically downloads maintainer-published ETS2/ATS PMTiles from the `map-data` GitHub Release on startup and checks for updates every six hours. Ordinary installations do not need game files, map-building tools, or `map:import`. The API downloads in the background, validates each archive's SHA-256 checksum, size and PMTiles v3 header, then replaces the cached map. Failed updates leave the previous map available. Before the first release is published (or while the initial download runs), the existing fallback map remains available.

Docker persists downloaded maps in `./data-runtime/maps`. Native API runs default to the repository's `data-runtime/maps` directory. Configure these optional settings in the API environment (Docker Compose reads them from `.env`):

```env
OPENHAUL_MAP_AUTO_UPDATE=true
OPENHAUL_MAP_MANIFEST_URL=https://github.com/NekoSuneProjects/OpenHaul/releases/download/map-data/maps.json
OPENHAUL_MAP_UPDATE_HOURS=6
```

Set `OPENHAUL_MAP_AUTO_UPDATE=false` to use only manually imported maps. An interval from 1 to 168 hours is supported. Restarting the API triggers an immediate check. Clients download tiles from the OpenHaul API, which retains HTTP byte-range support; they do not access GitHub directly.

### Maintaining and publishing maps

Build both maps locally using the helper below. From the OpenHaul repository root, authenticate the GitHub CLI with an account that can publish releases, then run:

```powershell
# Validate and stage both archives without uploading anything.
npm run map:publish -- --prepare-only

# Publish the maps from data-runtime/maps to NekoSuneProjects/OpenHaul.
npm run map:publish
```

For other input locations or a separate public map repository:

```powershell
npm run map:publish -- --ets2 "D:\maps\ets2.pmtiles" --ats "D:\maps\ats.pmtiles" --repo "OWNER/REPOSITORY"
```

Both archives are required for each publication; to update one game, keep the other game's existing local archive. The command creates a dedicated `map-data` release, uploads content-addressed archives, and uploads `maps.json` last. Unchanged archives are not uploaded again. The map release is not marked as the latest application release. Use a public repository with mutable releases for this channel; if you choose another repository, set `OPENHAUL_MAP_MANIFEST_URL` to its `releases/download/map-data/maps.json` URL on installations.

GitHub release attachments must each be under 2 GiB ([GitHub limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)). Generated files stay outside Git history. Older archives remain attached so cached manifests continue to work; the publisher does not delete them. Run only one publisher at a time.

### Building maps locally (maintainer or custom maps)

First clone the [TruckSim Maps source repository](https://github.com/truckermudgeon/maps) including its submodules:

```powershell
git clone --recurse-submodules https://github.com/truckermudgeon/maps.git C:\src\maps
```

`-TruckSimMapsPath` must be the source checkout root containing `package.json` and `packages/clis/parser`, not an empty `GameMap/ETS2` or `GameMap/ATS` directory. Both games can use the same checkout. For an existing clone, run `git -C C:\src\maps submodule update --init --recursive`.

Install Node.js/npm, Docker, and the node-gyp prerequisites (Python and Visual Studio C++ Build Tools on Windows). The helper installs missing dependencies and builds the native parser addons before parsing. It also adds block-comment support to the TruckSim Maps SII lexer when missing, so definitions such as ETS2's `model.stable.sii` can be read. It also supports BGRX sRGB icon textures (DXGI format 93), with opaque alpha for BGRX data. These are local compatibility edits in the supplied TruckSim Maps checkout; installed game files are not modified.

A helper is included. Run these commands from the OpenHaul repository root (from `GameMap`, use `..\tools\maps\build-scs-map.ps1`):

```powershell
# ETS2
.\tools\maps\build-scs-map.ps1 `
  -Game ets2 `
  -GamePath "C:\Program Files (x86)\Steam\steamapps\common\Euro Truck Simulator 2" `
  -TruckSimMapsPath "C:\src\maps"

# ATS
.\tools\maps\build-scs-map.ps1 `
  -Game ats `
  -GamePath "C:\Program Files (x86)\Steam\steamapps\common\American Truck Simulator" `
  -TruckSimMapsPath "C:\src\maps"
```

The helper uses a local checkout of TruckSim Maps to parse your installed SCS map/DLC files, asks it for GeoJSON, then runs Tippecanoe in Docker to create PMTiles. The result is imported to:

```text
data-runtime/maps/ets2.pmtiles
data-runtime/maps/ats.pmtiles
```

The helper uses the published [`ghcr.io/openwatersio/tippecanoe`](https://github.com/openwatersio/tippecanoe) image and checks Docker before parsing. If GeoJSON generation succeeded but the Docker/PMTiles stage failed, resume that stage without parsing again:

```powershell
.\tools\maps\build-scs-map.ps1 -Game ets2 -TilesOnly
# For ATS, use -Game ats. Supply the same -WorkDir if the original build used a custom one.
```

For a manually managed installation, disable automatic updates and import an existing PMTiles file directly:

```bash
npm run map:import -- --game ets2 --file /path/to/ets2.pmtiles
npm run map:import -- --game ats --file /path/to/ats.pmtiles
```

The live map automatically detects available map assets through `GET /api/v1/public/map/assets`. PMTiles are served with HTTP byte-range support so MapLibre only requests the vector tiles it needs.


## Steam accounts and Community VTCs

OpenHaul can use Steam OpenID as the account system. A first Steam login automatically creates the OpenHaul account and links the returned SteamID.

Configure:

```env
STEAM_WEB_API_KEY=
APP_URL=https://openhaul.example.com
OPENHAUL_PUBLIC_API_URL=https://api.openhaul.example.com
OPENHAUL_STEAM_REALM=https://api.openhaul.example.com/
OPENHAUL_COOKIE_SECURE=true
```

For local HTTP development, keep `OPENHAUL_COOKIE_SECURE=false`.

The account dashboard includes:

- ETS2 and ATS ownership state
- Steam-visible ETS2/ATS DLC detection
- revocable Windows client tokens
- public driver-profile link
- VTC memberships
- Community VTC creation

VTC owners/admins can manage company information, recruitment, applications, member roles, public balance visibility, member performance, and a transaction ledger. Active members are also shown on public VTC pages.

### Steam ownership limitation

OpenHaul only marks base-game ownership as verified when Steam returns the user's owned-games list. Private game details are shown as unknown/private rather than falsely reporting the game as unowned.

DLC shown as **Detected** means its app ID appeared in the Steam-visible library snapshot. Missing DLC is shown as **Not confirmed** because exact DLC entitlement checks are publisher/client-side Steamworks capabilities.

## Account client authentication

Create a token from `/account`, then configure the Windows client:

```env
OPENHAUL_API_URL=https://api.openhaul.example.com
OPENHAUL_CLIENT_TOKEN=oh_client_...
OPENHAUL_VTC_ID=123
```

When a client token is used, the API derives the driver SteamID and display name from the account and validates any requested VTC membership. Users can also track independent jobs/fines with no VTC configured.


## Steam accounts

OpenHaul supports Steam OpenID login. The first successful Steam login automatically creates the OpenHaul account and links the returned SteamID.

Self-hosters should configure Steam Web API access, the public website URL, the public API URL, the Steam OpenID realm, and whether authentication cookies should require HTTPS.

The account dashboard provides base-game ownership status, Steam-visible DLC detection, public driver-profile access, VTC memberships, Community VTC creation, and Windows client-token management.

Steam library privacy is respected: if owned games are not visible, OpenHaul reports ownership as private/unknown rather than treating the games as unowned.

## Community VTC accounts

Steam-linked users can create and manage public Community VTCs. Current management features include company name/tag/description/logo, website and Discord links, recruitment state, join applications, owner/admin/staff/member roles, public member roster, per-driver performance totals, optional public balance, and an auditable finance ledger.

## Account-linked telemetry

Normal users can create a revocable client token from the Account page. When the Windows client authenticates with that token, OpenHaul derives the SteamID and display name server-side and validates VTC membership before accepting VTC-linked telemetry. Independent drivers can also log jobs and fines without belonging to a VTC.


## Personal API keys

Every newly created Steam account is offered a default personal API key on first login. Additional keys can be created and revoked from the Account page.

Personal keys start with `oh_user_` and support scoped account access:

- `profile:read`
- `jobs:read`
- `fines:read`
- `vtcs:read`
- `stream:read`

Examples:

```text
GET /api/v1/user/me
GET /api/v1/user/jobs
GET /api/v1/user/fines
GET /api/v1/user/vtcs
GET /api/v1/user/vtcs/:id/summary
GET /api/v1/user/twitch
```

A personal key can only access VTC summaries for VTCs that account is an active member of.

VTC owners/admins can separately create `oh_vtc_` keys from the VTC management dashboard. Those keys are permanently bound to that VTC server-side and can be scoped for telemetry, jobs, fines, statistics, members, convoys and events.

## Twitch linking and streamer detection

Registered OpenHaul users can link a Twitch account from the Account page. OpenHaul uses Twitch OAuth only to prove the broadcaster identity, then uses the server's Twitch app credentials for ongoing public stream-status detection.

Configure:

```env
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
```

Register this OAuth redirect URL in the Twitch Developer Console:

```text
<OPENHAUL_PUBLIC_API_URL>/api/v1/auth/twitch/callback
```

Linked accounts that Twitch reports live in **Euro Truck Simulator 2** or **American Truck Simulator** automatically appear on:

```text
/streamers
GET /api/v1/public/streamers
GET /api/v1/public/streamers?game=ets2
GET /api/v1/public/streamers?game=ats
```

OpenHaul batches linked Twitch user IDs through Helix and refreshes stream state on the server every 60 seconds. Public visitors only read the cached OpenHaul stream state; they cannot force Twitch API refreshes.
