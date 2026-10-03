# OpenHaul roadmap

## Foundation
- [x] Docker Compose stack
- [x] PostgreSQL and Redis
- [x] Public live-driver REST API
- [x] VTC-filtered live API
- [x] VTC-scoped API-key middleware
- [x] TruckersFM now-playing proxy
- [x] Discord bot foundation
- [x] GitHub Actions container builds
- [x] WebSocket live-position fan-out
- [x] Human-readable API docs page
- [ ] Account authentication and VTC administration UI
- [ ] API key creation/rotation UI with per-key scopes
- [ ] Rate limiting and abuse controls for public API

## ETS2 / ATS client
- [x] Windows client foundation
- [x] Named-pipe telemetry bridge contract
- [x] Client simulator for map/API testing
- [x] Windows GitHub Actions build
- [x] SCS Telemetry SDK native plugin
- [x] Automatic ETS2/ATS installation detection
- [x] Automatic telemetry plugin installer
- [ ] Automatic telemetry plugin updater
- [ ] Per-driver authentication tokens
- [ ] Offline telemetry queue
- [ ] Job start detection from real SCS events
- [x] Job complete detection from real SCS events
- [x] Fine events: red light, speeding, wrong way, collision and other SCS penalties
- [ ] Collision and damage events
- [x] Core truck/job/cargo telemetry (position, speed, RPM, fuel, odometer, navigation, truck, cargo)
- [ ] Trailer/wheel/advanced damage telemetry
- [ ] TruckersMP process/server detection
- [ ] Signed client releases from GitHub Actions

## Mapping
- [ ] ETS2 map asset pipeline
- [ ] ATS map asset pipeline
- [x] ETS2/ATS game-coordinate to WGS84 transforms
- [x] Geographic MapLibre truck markers and heading
- [ ] Interpolated/tweened truck movement between telemetry frames
- [x] Global live-data map view
- [x] VTC query filter contract: /map?vtc=ID
- [x] Realtime WebSocket updates
- [ ] Convoy overlays and route rendering
- [ ] Optional TruckersMP-wide provider if an allowed live-position source is available

## VTC/community
- [ ] VTC creation and profiles UI
- [ ] Roles and permissions
- [ ] Recruitment/applications
- [ ] Drivers and fleets
- [x] Job data storage/API foundation
- [x] Fines/events data storage/API foundation
- [x] Statistics and leaderboards
- [ ] Achievements
- [ ] Convoy/events manager
- [ ] Webhooks

## Discord
- [x] Slash command foundation
- [ ] Driver account linking
- [x] Completed-job embeds
- [x] Fine embeds
- [x] Online/offline events
- [ ] Convoy announcements
- [ ] Role synchronization
- [ ] Per-VTC channel configuration UI

## Media and support
- [x] TruckersFM API/player foundation
- [x] Full radio page with history, next track and DJ information
- [x] Donation goal storage/API
- [x] DLC funding goal page
- [x] Admin goal-management API
- [ ] Supporter badges/Discord roles
- [ ] Payment-provider adapters
