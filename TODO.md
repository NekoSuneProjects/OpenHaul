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
- [ ] WebSocket live-position fan-out
- [ ] Account authentication and VTC administration UI
- [ ] API key creation/rotation UI with per-key scopes

## ETS2 / ATS client
- [ ] Windows desktop client
- [ ] SCS Telemetry SDK plugin
- [ ] Automatic ETS2/ATS installation detection
- [ ] Automatic telemetry plugin installer/updater
- [ ] Per-driver authentication tokens
- [ ] Offline telemetry queue
- [ ] Job start/complete detection
- [ ] Fine events: red light, speeding, wrong way and other penalties
- [ ] Collision and damage events
- [ ] Truck/trailer/cargo data
- [ ] TruckersMP process/server detection
- [ ] Signed client releases from GitHub Actions

## Mapping
- [ ] ETS2 map asset pipeline
- [ ] ATS map asset pipeline
- [ ] Game-coordinate to map-coordinate transforms
- [ ] Smooth realtime truck markers
- [ ] Global map
- [x] VTC query filter contract: /map?vtc=ID
- [ ] Convoy overlays and route rendering
- [ ] Optional TruckersMP-wide provider if an allowed live-position source is available

## VTC/community
- [ ] VTC creation and profiles
- [ ] Roles and permissions
- [ ] Recruitment/applications
- [ ] Drivers and fleets
- [ ] Job history
- [ ] Fines/events history
- [ ] Statistics and leaderboards
- [ ] Achievements
- [ ] Convoy/events manager
- [ ] Webhooks

## Discord
- [ ] Slash commands
- [ ] Driver account linking
- [ ] Completed-job embeds
- [ ] Fine embeds
- [ ] Online/offline events
- [ ] Convoy announcements
- [ ] Role synchronization
- [ ] Per-VTC channel configuration

## Media and support
- [x] TruckersFM API/player foundation
- [ ] Full radio page with history, next track and DJ information
- [ ] Donation goals
- [ ] DLC funding goals
- [ ] Supporter badges/Discord roles
- [ ] Payment-provider adapters
