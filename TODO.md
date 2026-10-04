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
- [x] Fix/keep all Windows client, SCS plugin and Docker CI builds green
- [x] Build the SCS plugin whenever client/telemetry/shared contracts change
- [x] Publish client + matching SCS plugin from the same commit/release
- [x] Version compatibility contract between website, client and telemetry plugin
- [x] Release manifest with version, download URL and SHA-256 checksum
- [x] Automatic client updater with update/download/install/restart flow
- [x] Automatic telemetry plugin updater
- [x] Website/client update status: latest version, installed version, plugin version, compatible/outdated
- [x] Stable/Beta release channels and release history/changelog
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
- [x] Track cargo, source/destination company/city, mass, distance, income, expenses and final profit/loss
- [ ] Track late delivery, cargo/truck/trailer damage and penalties
- [x] Persist raw/normalized event history for auditing and future statistics
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
- [x] Player dot/truck arrow rotates to show exactly which direction the driver is facing
- [x] Marker details: driver, VTC, truck, cargo, speed, destination, job state and server
- [x] Filters for ETS2/ATS, VTC, driver, online/driving/on-job and TruckersMP server
- [x] Driver/VTC shareable map links
- [ ] Convoy overlays, route rendering and convoy-member grouping
- [ ] Route/job origin and destination markers
- [x] Mobile full-screen live-map mode
- [ ] Optional TruckersMP-wide provider if an allowed live-position source is available

## P0 — Accounts, profiles and Steam
- [x] Steam account authentication
- [x] Steam-linked driver profiles
- [x] Public/private profile controls
- [x] Verify ETS2/ATS ownership through Steam where available
- [x] Display owned ETS2/ATS DLC where Steam exposes it
- [ ] Discord account linking
- [x] Profile avatar/banner, country, bio and social links
- [x] Profile tabs: About, Logbook, Statistics, Road Trip, Reputation, Achievements, Challenges, Awards and Albums
- [x] Account level/XP and progression
- [ ] Driver status: offline, client online, menu, driving, on-job and paused
- [x] Recent movement/activity timeline
- [x] Career summary: deliveries, distance, longest job, total profit, average/job, best month and activity
- [x] Personal warnings, mutes, bans, kicks/disciplinary actions and name-change history with appropriate visibility
- [x] Driver game filters: All / ETS2 / ATS

## P0 — VTC/company system
- [x] VTC creation and profile foundation
- [x] Core owner/admin/staff/member roles and permissions
- [x] Recruitment/applications foundation
- [x] Steam-linked VTC member tracking
- [x] Job data storage/API foundation
- [x] Fines/events data storage/API foundation
- [x] Statistics and leaderboards
- [x] Remove meaningless bootstrap/empty VTC IDs from normal user views
- [x] Create VTC with unique name/slug, logo/banner, description, rules, socials and recruitment state
- [x] Invite members with expiring/one-use invite links
- [x] Join, leave, kick and ownership-transfer flows with owner protection
- [x] Public/open join, invite-only and application-required recruitment modes
- [x] Custom VTC roles, granular permissions and role ordering
- [x] Member directory with status, role, join date and contribution stats
- [x] VTC dashboard: members online, jobs today/month, distance, revenue, expenses and profit/loss
- [x] VTC logbook with search, filters, pagination and export
- [x] VTC member action/audit log
- [x] Log promotions/demotions, role changes, joins/leaves/kicks, warnings, mutes, bans and name changes
- [x] VTC disciplinary system: warnings, strikes/points, notes, temporary/permanent mutes and bans
- [x] Permission controls for who can see/add/edit disciplinary records
- [x] Fleet/garage management: trucks, trailers, garages and assignments
- [x] Company ledger/balance with job income, fines, fuel/repair/toll expenses and adjustments
- [x] Per-member earnings/contribution and losses from penalties/red lights/damage
- [x] VTC statistics, rankings and monthly trends
- [x] VTC achievements, awards and challenges
- [x] VTC reputation system
- [x] Convoy/events manager with attendance
- [x] Company/VTC list and searchable discovery/recruitment page
- [x] VTC API keys, webhooks and protected VTC data


## P1 — Living VTC / shared company simulation
- [x] VTC operating mode: Casual / Standard / Simulation so companies can choose how strict the system is
- [x] Company depots/branches in ETS2/ATS cities with configurable home depot and expansion history
- [x] Shared VTC contracts that split large freight orders across multiple drivers and track collective completion
- [x] Live Dispatch Center showing available/on-job drivers and allowing authorized dispatchers to offer jobs
- [ ] Driver dispatch accept/decline flow in the OpenHaul client with expiry, reassignment and audit history
- [x] Company economy where completed jobs add revenue and fuel, tolls, ferries, repairs, damage and fines reduce the balance
- [x] Shared virtual fleet with persistent truck/trailer identity, mileage, earnings, assigned drivers, condition and service history
- [x] Fleet maintenance/reliability model derived from telemetry, with repair/service costs and retire/replace workflows
- [x] Driver certifications/licences for ADR, fragile, refrigerated, heavy haul, oversized/special transport and long-distance work
- [x] VTC-defined training/certification requirements and automatic qualification from verified telemetry history
- [x] Driver shift system: start/end shift, driving time, jobs, distance, revenue, expenses, incidents and shift summary
- [x] Company operations feed for deliveries, promotions, penalties, milestones, fleet events and achievements
- [x] Cooperative VTC goals/contracts where members contribute cargo, tonnes, distance or clean deliveries toward one target
- [x] Seasonal VTC competitions and historical seasons without resetting permanent company/driver history
- [x] Multi-factor driver reputation based on safety, reliability, delivery quality, activity and VTC contribution instead of distance alone
- [x] Convoy Operations Center: route, meeting point, departure, DLC/mod requirements, slots, attendance, live participants and after-action stats
- [x] VTC recruitment matching by ETS2/ATS, language, timezone, Casual/Standard/Simulation, TruckersMP/Convoy, mileage and voice requirements
- [x] Alternative/manual job submission workflow for drivers who cannot install telemetry (for example cloud gaming), with screenshot/evidence and staff approval
- [x] VTC-configurable policy deciding whether manual jobs count toward economy, rankings, challenges and reputation
- [x] Company history/archive preserving completed contracts, seasons, awards, fleet milestones, leadership changes and major events
- [x] Dispatcher, Fleet Manager, Recruiter, Trainer and Driver role presets built on granular VTC permissions

## P1 — Discord bot per VTC
- [x] Discord bot foundation and slash commands
- [x] Steam-linked OpenHaul driver accounts
- [x] Completed-job embeds
- [x] Fine embeds
- [x] Online/offline events
- [x] Let a VTC add/install the OpenHaul bot from its VTC dashboard
- [x] VTC Discord server binding and ownership/permission verification
- [x] Per-VTC Discord channel configuration UI
- [x] Notification channels for jobs, fines, joins/leaves, applications, moderation, achievements and convoys
- [x] Application system: submit/review/accept/deny from website and Discord
- [ ] Role synchronization between OpenHaul VTC roles and Discord roles
- [x] Configurable job/fine/penalty embeds
- [x] Driver lookup, VTC stats, leaderboard, current-driver-status and recent-job commands
- [x] Convoy/event announcements and reminders
- [x] Audit/moderation notifications
- [x] Optional welcome/leave messages
- [x] Per-VTC bot feature toggles and permissions

## P1 — Dashboard and VTLog-inspired statistics
- [x] Responsive mobile-first dashboard
- [x] Global platform totals: registered drivers, VTCs, kilometres/miles logged, completed deliveries and drivers online now
- [x] Getting Started checklist that automatically detects completed steps
- [x] Checklist: account, Steam, Discord, client, plugin, game telemetry, first delivery and create/join VTC
- [x] Deliveries this month card
- [x] Earnings this month with income vs expenses/losses
- [x] Account level card
- [x] Recent movement with All / ETS2 / ATS filters
- [x] Company/VTC daily summary
- [x] Optional virtual insurance system
- [x] Monthly trend charts for distance, profit, jobs, cargo and penalties
- [x] Boards/share-of-deliveries charts such as Arcade/Realistic/Masterclass where OpenHaul has equivalent modes
- [x] Where-you-drive statistics: ETS2/ATS, countries/cities and game/mode
- [x] Distance-driven-on-job totals
- [x] Career statistics and activity graphs
- [x] Exportable statistics and logbooks

## P1 — Logbook and job details
- [x] Driver logbook with job ID/city/cargo search
- [x] Month/date, ETS2/ATS, VTC, cargo, mode and status filters
- [x] Job detail page with complete telemetry-derived summary
- [ ] Job timeline: accepted, departed, penalties, refuels, damage, arrival and completion
- [ ] Route map/replay where enough position history is retained
- [x] Income, expenses and net-profit breakdown
- [x] CSV/JSON export and VTC-authorized export
- [x] Pagination and large-history performance

## P1 — Challenges, achievements, reputation and awards
- [x] Challenge framework for driver and VTC challenges
- [x] Automatic progress from telemetry/jobs rather than manual completion
- [x] Daily/weekly/monthly/seasonal challenges
- [x] Achievement definitions and automatic unlocks
- [x] Awards/badges displayed on profiles
- [x] Reputation/scoring rules with transparent event history
- [x] Level/XP rewards without locking core self-hosted features

## P1 — Website/navigation/content
- [x] Responsive sidebar/drawer with client ONLINE/OFFLINE indicator
- [x] Navigation: Home, Tickets, Dashboard, Profile, Cargo Market, Fuel Station, Live Map, VTC/Company, Logbook, Members, Rankings, Company List, User List, Rules and Download Client
- [x] News dashboard for OpenHaul announcements
- [x] Optional SCS Software and TruckersMP news feeds with source links
- [x] Client release/update centre
- [x] Support/Ticket Center
- [x] Partner cards with logo, description, website and optional live-map link
- [x] Mobile card layouts for tables/logbooks
- [x] Theme/branding stays OpenHaul; use references for functionality rather than copying another site's branding/assets

## P2 — Cargo market and economy
- [x] Cargo market from collected/allowed telemetry data
- [x] Cargo statistics and popular routes
- [x] Fuel station/fuel-price data model where a reliable source is available
- [x] Economy dashboards for income, fuel, repairs, tolls, fines and damage
- [x] VTC financial reports by day/week/month/year
- [x] Currency/unit preferences

## P2 — API, integrations and self-hosting
- [x] Public live-driver REST API
- [x] VTC-filtered live API
- [x] VTC-scoped API-key middleware
- [x] WebSocket live-position fan-out
- [x] Human-readable API docs page
- [x] API key creation/rotation UI with per-key scopes
- [x] Public API rate limiting and abuse controls
- [x] VTC-scoped REST endpoints for jobs, members, stats, events and moderation
- [x] Webhook subscriptions and delivery/retry logs
- [x] OpenAPI specification and examples
- [x] Self-hosting setup wizard/admin bootstrap
- [x] Database migrations and upgrade-safe schema versioning
- [x] Backup/restore documentation and tooling
- [x] Docker health checks and dependency readiness
- [x] Environment-variable documentation and production examples
- [x] GitHub Container Registry images with versioned tags
- [x] Keep core OpenHaul features usable in self-hosted Docker deployments

## P2 — Admin, moderation and security
- [x] Platform admin dashboard
- [x] User/VTC moderation with warnings, mutes, suspensions and bans
- [x] Internal admin notes and audit trail
- [x] Report/appeal workflow
- [x] Session/device/token management
- [x] Client token revoke/rotate
- [x] VTC API-key revoke/rotate
- [x] Rate limits, validation and anti-spam protections
- [x] Security headers, CSRF/auth hardening and secrets review
- [x] Data retention/privacy controls and account deletion/export

## P2 — Media, community and support
- [x] TruckersFM API/player foundation
- [x] Full radio page with history, next track and DJ information
- [x] Donation goal storage/API
- [x] DLC funding goal page
- [x] Admin goal-management API
- [x] Supporter badges/Discord roles
- [x] Payment-provider adapters
- [x] Albums/screenshots on driver profiles
- [x] Community announcements and event highlights

## UX rules / implementation notes
- [x] Do not expose raw meaningless database IDs as the primary VTC identity
- [x] Prefer names/slugs and human-readable identifiers in UI/routes
- [x] Do not show empty/bootstrap VTCs as real companies
- [x] Make desktop tables usable as cards on mobile
- [x] Keep map interactions touch-friendly
- [x] Make job/penalty/moderation histories auditable with timestamps and actor/source
- [x] Automatically derive statistics from stored events instead of manually maintained counters
- [x] Keep client/plugin/server protocol versions explicit and backwards-compatible where practical
