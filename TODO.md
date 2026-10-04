# OpenHaul roadmap

OpenHaul is an open-source, self-hostable ETS2/ATS driver, telemetry and VTC platform. Docker deployments and official hosted deployments should expose the same core feature set.

## P0 — Reliability, releases and updater
- [x] Docker Compose stack
- [x] PostgreSQL and Redis
- [x] GitHub Actions container builds
- [x] Windows client foundation and GitHub Actions build
- [x] SCS Telemetry SDK native plugin
- [x] Automatic ETS2/ATS installation detection
- [x] Automatic telemetry plugin installer
- [ ] Fix/keep all Windows client, SCS plugin and Docker CI builds green
- [ ] Build the SCS plugin whenever client/telemetry/shared contracts change
- [ ] Publish client + matching SCS plugin from the same commit/release
- [ ] Version compatibility contract between website, client and telemetry plugin
- [ ] Release manifest with version, download URL and SHA-256 checksum
- [ ] Automatic client updater with update/download/install/restart flow
- [ ] Automatic telemetry plugin updater
- [ ] Website/client update status: latest version, installed version, plugin version, compatible/outdated
- [ ] Stable/Beta release channels and release history/changelog
- [ ] Signed client/plugin releases from GitHub Actions
- [ ] Rollback/recovery when an update fails
- [ ] Offline telemetry queue and reconnect/resend
- [ ] Client health/status diagnostics and useful error reporting

## P0 — Telemetry and job logging
- [x] Named-pipe telemetry bridge contract
- [x] Client simulator for map/API testing
- [x] Per-driver/account client authentication tokens
- [x] Core truck/job/cargo telemetry: position, heading, speed, RPM, fuel, odometer, navigation, truck and cargo
- [x] Job complete detection from real SCS events
- [x] Fine events: red light, speeding, wrong way, collision and other SCS penalties
- [ ] Job start/accepted/cancelled/abandoned detection from real SCS events
- [ ] Collision and damage events
- [ ] Trailer/wheel/advanced damage telemetry
- [ ] Fuel purchase/refuel events and cost
- [ ] Toll/ferry/train/repair/service expenses where telemetry permits
- [ ] Track cargo, source/destination company/city, mass, distance, income, expenses and final profit/loss
- [ ] Track late delivery, cargo/truck/trailer damage and penalties
- [ ] Persist raw/normalized event history for auditing and future statistics
- [ ] TruckersMP process/server detection
- [ ] Detect ETS2 vs ATS, single-player vs TruckersMP and relevant session metadata
- [ ] Anti-duplicate job/event protection and reconnect-safe job IDs

## P0 — Live map
- [x] ETS2 PMTiles map asset pipeline
- [x] ATS PMTiles map asset pipeline
- [x] ETS2/ATS game-coordinate to WGS84 transforms
- [x] Geographic MapLibre truck markers and heading
- [x] Interpolated/tweened movement between telemetry frames
- [x] Global live-data map
- [x] VTC filter contract: /map?vtc=ID
- [x] Realtime WebSocket updates
- [ ] Player dot/truck arrow rotates to show exactly which direction the driver is facing
- [ ] Marker details: driver, VTC, truck, cargo, speed, destination, job state and server
- [ ] Filters for ETS2/ATS, VTC, driver, online/driving/on-job and TruckersMP server
- [ ] Driver/VTC shareable map links
- [ ] Convoy overlays, route rendering and convoy-member grouping
- [ ] Route/job origin and destination markers
- [ ] Mobile full-screen live-map mode
- [ ] Optional TruckersMP-wide provider if an allowed live-position source is available

## P0 — Accounts, profiles and Steam
- [x] Steam account authentication
- [x] Steam-linked driver profiles
- [ ] Public/private profile controls
- [ ] Verify ETS2/ATS ownership through Steam where available
- [ ] Display owned ETS2/ATS DLC where Steam exposes it
- [ ] Discord account linking
- [ ] Profile avatar/banner, country, bio and social links
- [ ] Profile tabs: About, Logbook, Statistics, Road Trip, Reputation, Achievements, Challenges, Awards and Albums
- [ ] Account level/XP and progression
- [ ] Driver status: offline, client online, menu, driving, on-job and paused
- [ ] Recent movement/activity timeline
- [ ] Career summary: deliveries, distance, longest job, total profit, average/job, best month and activity
- [ ] Personal warnings, mutes, bans, kicks/disciplinary actions and name-change history with appropriate visibility
- [ ] Driver game filters: All / ETS2 / ATS

## P0 — VTC/company system
- [x] VTC creation and profile foundation
- [x] Core owner/admin/staff/member roles and permissions
- [x] Recruitment/applications foundation
- [x] Steam-linked VTC member tracking
- [x] Job data storage/API foundation
- [x] Fines/events data storage/API foundation
- [x] Statistics and leaderboards
- [ ] Remove meaningless bootstrap/empty VTC IDs from normal user views
- [ ] Create VTC with unique name/slug, logo/banner, description, rules, socials and recruitment state
- [ ] Invite members with expiring/one-use invite links
- [ ] Join, leave, kick and ownership-transfer flows with owner protection
- [ ] Public/open join, invite-only and application-required recruitment modes
- [ ] Custom VTC roles, granular permissions and role ordering
- [ ] Member directory with status, role, join date and contribution stats
- [ ] VTC dashboard: members online, jobs today/month, distance, revenue, expenses and profit/loss
- [ ] VTC logbook with search, filters, pagination and export
- [ ] VTC member action/audit log
- [ ] Log promotions/demotions, role changes, joins/leaves/kicks, warnings, mutes, bans and name changes
- [ ] VTC disciplinary system: warnings, strikes/points, notes, temporary/permanent mutes and bans
- [ ] Permission controls for who can see/add/edit disciplinary records
- [ ] Fleet/garage management: trucks, trailers, garages and assignments
- [ ] Company ledger/balance with job income, fines, fuel/repair/toll expenses and adjustments
- [ ] Per-member earnings/contribution and losses from penalties/red lights/damage
- [ ] VTC statistics, rankings and monthly trends
- [ ] VTC achievements, awards and challenges
- [ ] VTC reputation system
- [ ] Convoy/events manager with attendance
- [ ] Company/VTC list and searchable discovery/recruitment page
- [ ] VTC API keys, webhooks and protected VTC data

## P1 — Discord bot per VTC
- [x] Discord bot foundation and slash commands
- [x] Steam-linked OpenHaul driver accounts
- [x] Completed-job embeds
- [x] Fine embeds
- [x] Online/offline events
- [ ] Let a VTC add/install the OpenHaul bot from its VTC dashboard
- [ ] VTC Discord server binding and ownership/permission verification
- [ ] Per-VTC Discord channel configuration UI
- [ ] Notification channels for jobs, fines, joins/leaves, applications, moderation, achievements and convoys
- [ ] Application system: submit/review/accept/deny from website and Discord
- [ ] Role synchronization between OpenHaul VTC roles and Discord roles
- [ ] Configurable job/fine/penalty embeds
- [ ] Driver lookup, VTC stats, leaderboard, current-driver-status and recent-job commands
- [ ] Convoy/event announcements and reminders
- [ ] Audit/moderation notifications
- [ ] Optional welcome/leave messages
- [ ] Per-VTC bot feature toggles and permissions

## P1 — Dashboard and VTLog-inspired statistics
- [ ] Responsive mobile-first dashboard
- [ ] Global platform totals: registered drivers, VTCs, kilometres/miles logged, completed deliveries and drivers online now
- [ ] Getting Started checklist that automatically detects completed steps
- [ ] Checklist: account, Steam, Discord, client, plugin, game telemetry, first delivery and create/join VTC
- [ ] Deliveries this month card
- [ ] Earnings this month with income vs expenses/losses
- [ ] Account level card
- [ ] Recent movement with All / ETS2 / ATS filters
- [ ] Company/VTC daily summary
- [ ] Optional virtual insurance system
- [ ] Monthly trend charts for distance, profit, jobs, cargo and penalties
- [ ] Boards/share-of-deliveries charts such as Arcade/Realistic/Masterclass where OpenHaul has equivalent modes
- [ ] Where-you-drive statistics: ETS2/ATS, countries/cities and game/mode
- [ ] Distance-driven-on-job totals
- [ ] Career statistics and activity graphs
- [ ] Exportable statistics and logbooks

## P1 — Logbook and job details
- [ ] Driver logbook with job ID/city/cargo search
- [ ] Month/date, ETS2/ATS, VTC, cargo, mode and status filters
- [ ] Job detail page with complete telemetry-derived summary
- [ ] Job timeline: accepted, departed, penalties, refuels, damage, arrival and completion
- [ ] Route map/replay where enough position history is retained
- [ ] Income, expenses and net-profit breakdown
- [ ] CSV/JSON export and VTC-authorized export
- [ ] Pagination and large-history performance

## P1 — Challenges, achievements, reputation and awards
- [ ] Challenge framework for driver and VTC challenges
- [ ] Automatic progress from telemetry/jobs rather than manual completion
- [ ] Daily/weekly/monthly/seasonal challenges
- [ ] Achievement definitions and automatic unlocks
- [ ] Awards/badges displayed on profiles
- [ ] Reputation/scoring rules with transparent event history
- [ ] Level/XP rewards without locking core self-hosted features

## P1 — Website/navigation/content
- [ ] Responsive sidebar/drawer with client ONLINE/OFFLINE indicator
- [ ] Navigation: Home, Tickets, Dashboard, Profile, Cargo Market, Fuel Station, Live Map, VTC/Company, Logbook, Members, Rankings, Company List, User List, Rules and Download Client
- [ ] News dashboard for OpenHaul announcements
- [ ] Optional SCS Software and TruckersMP news feeds with source links
- [ ] Client release/update centre
- [ ] Support/Ticket Center
- [ ] Partner cards with logo, description, website and optional live-map link
- [ ] Mobile card layouts for tables/logbooks
- [ ] Theme/branding stays OpenHaul; use references for functionality rather than copying another site's branding/assets

## P2 — Cargo market and economy
- [ ] Cargo market from collected/allowed telemetry data
- [ ] Cargo statistics and popular routes
- [ ] Fuel station/fuel-price data model where a reliable source is available
- [ ] Economy dashboards for income, fuel, repairs, tolls, fines and damage
- [ ] VTC financial reports by day/week/month/year
- [ ] Currency/unit preferences

## P2 — API, integrations and self-hosting
- [x] Public live-driver REST API
- [x] VTC-filtered live API
- [x] VTC-scoped API-key middleware
- [x] WebSocket live-position fan-out
- [x] Human-readable API docs page
- [ ] API key creation/rotation UI with per-key scopes
- [ ] Public API rate limiting and abuse controls
- [ ] VTC-scoped REST endpoints for jobs, members, stats, events and moderation
- [ ] Webhook subscriptions and delivery/retry logs
- [ ] OpenAPI specification and examples
- [ ] Self-hosting setup wizard/admin bootstrap
- [ ] Database migrations and upgrade-safe schema versioning
- [ ] Backup/restore documentation and tooling
- [ ] Docker health checks and dependency readiness
- [ ] Environment-variable documentation and production examples
- [ ] GitHub Container Registry images with versioned tags
- [ ] Keep core OpenHaul features usable in self-hosted Docker deployments

## P2 — Admin, moderation and security
- [ ] Platform admin dashboard
- [ ] User/VTC moderation with warnings, mutes, suspensions and bans
- [ ] Internal admin notes and audit trail
- [ ] Report/appeal workflow
- [ ] Session/device/token management
- [ ] Client token revoke/rotate
- [ ] VTC API-key revoke/rotate
- [ ] Rate limits, validation and anti-spam protections
- [ ] Security headers, CSRF/auth hardening and secrets review
- [ ] Data retention/privacy controls and account deletion/export

## P2 — Media, community and support
- [x] TruckersFM API/player foundation
- [x] Full radio page with history, next track and DJ information
- [x] Donation goal storage/API
- [x] DLC funding goal page
- [x] Admin goal-management API
- [ ] Supporter badges/Discord roles
- [ ] Payment-provider adapters
- [ ] Albums/screenshots on driver profiles
- [ ] Community announcements and event highlights

## UX rules / implementation notes
- [ ] Do not expose raw meaningless database IDs as the primary VTC identity
- [ ] Prefer names/slugs and human-readable identifiers in UI/routes
- [ ] Do not show empty/bootstrap VTCs as real companies
- [ ] Make desktop tables usable as cards on mobile
- [ ] Keep map interactions touch-friendly
- [ ] Make job/penalty/moderation histories auditable with timestamps and actor/source
- [ ] Automatically derive statistics from stored events instead of manually maintained counters
- [ ] Keep client/plugin/server protocol versions explicit and backwards-compatible where practical
