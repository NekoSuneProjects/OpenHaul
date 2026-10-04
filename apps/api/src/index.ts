import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { Op } from "sequelize";
import { z } from "zod";
import { DriverPosition, Fine, Job, PlatformRecord, TelemetryEvent, User, Vtc, VtcActivityEvent, VtcLedgerEntry, VtcMember, VtcModerationAction, initDatabase, sequelize } from "./db.js";
import { requireScope, requireVtcApiKey } from "./auth.js";
import { getLiveDrivers, removeLiveDriver, setLiveDriver } from "./live.js";
import { addRealtimeClient, broadcastDriver, broadcastOffline } from "./realtime.js";
import { registerDonationRoutes } from "./donations.js";
import { registerStatsRoutes } from "./stats.js";
import { registerMapAssetRoutes } from "./mapAssets.js";
import { registerAccountRoutes } from "./accountRoutes.js";
import { registerCommunityVtcRoutes } from "./communityVtc.js";
import { registerSteamDlcRoutes } from "./steamDlc.js";
import { registerPublicDriverRoutes } from "./publicDrivers.js";
import { registerUserApiKeyRoutes } from "./userApiKeys.js";
import { registerTwitchRoutes } from "./twitch.js";
import { registerVtcApiKeyManagementRoutes } from "./vtcApiKeyManagement.js";
import { registerClientTokenRoutes } from "./clientTokens.js";
import { registerClientAuthRoutes } from "./clientAuth.js";
import { registerTruckersMpRoutes } from "./truckersMp.js";
import { registerNewsRoutes } from "./news.js";
import { requireTelemetryIdentity, resolveUserVtc } from "./telemetryAuth.js";
import { recordVtcActivity, registerVtcOperationsRoutes } from "./vtcOperations.js";
import { registerDashboardRoutes } from "./dashboard.js";
import { registerLogbookRoutes } from "./logbook.js";
import { registerPlatformFeatureRoutes } from "./platformFeatures.js";
import { resolveVtcIdentifier } from "./vtcLookup.js";
import { registerVersioningRoutes } from "./versioning.js";
import { registerManualJobRoutes } from "./manualJobs.js";
import { registerProgressionRoutes } from "./progression.js";
import { registerEconomyRoutes } from "./economy.js";
import { registerVtcSimulationRoutes } from "./vtcSimulation.js";
import { registerPaymentAdapterRoutes } from "./paymentAdapters.js";
import { registerMapIntelligenceRoutes } from "./mapIntelligence.js";
import { registerDiscordLinkRoutes } from "./discordLink.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true, credentials: true });
await app.register(cookie);
await app.register(websocket);
await registerDonationRoutes(app);
await registerStatsRoutes(app);
await registerMapAssetRoutes(app);
await registerAccountRoutes(app);
await registerCommunityVtcRoutes(app);
await registerSteamDlcRoutes(app);
await registerPublicDriverRoutes(app);
await registerUserApiKeyRoutes(app);
await registerTwitchRoutes(app);
await registerVtcApiKeyManagementRoutes(app);
await registerClientTokenRoutes(app);
await registerClientAuthRoutes(app);
await registerTruckersMpRoutes(app);
await registerNewsRoutes(app);
await registerVtcOperationsRoutes(app);
await registerDashboardRoutes(app);
await registerLogbookRoutes(app);
await registerPlatformFeatureRoutes(app);
await registerVersioningRoutes(app);
await registerManualJobRoutes(app);
await registerProgressionRoutes(app);
await registerEconomyRoutes(app);
await registerVtcSimulationRoutes(app);
await registerPaymentAdapterRoutes(app);
await registerMapIntelligenceRoutes(app);
await registerDiscordLinkRoutes(app);

const liveSchema = z.object({
  driverId: z.string().min(1).max(80),
  username: z.string().min(1).max(120),
  game: z.enum(["ets2", "ats"]),
  vtcId: z.number().int().positive().nullable().optional(),
  vtcName: z.string().max(120).nullable().optional(),
  vtcTag: z.string().max(32).nullable().optional(),
  x: z.number(), y: z.number().optional(), z: z.number(),
  heading: z.number(), speedKph: z.number().min(0).max(300),
  truck: z.string().max(160).nullable().optional(),
  cargo: z.string().max(160).nullable().optional(),
  sourceCity: z.string().max(120).nullable().optional(),
  destinationCity: z.string().max(120).nullable().optional(),
  sourceCompany: z.string().max(160).nullable().optional(),
  destinationCompany: z.string().max(160).nullable().optional(),
  rpm: z.number().nonnegative().nullable().optional(),
  fuel: z.number().nonnegative().nullable().optional(),
  odometerKm: z.number().nonnegative().nullable().optional(),
  navigationDistanceM: z.number().nonnegative().nullable().optional(),
  navigationTimeS: z.number().nonnegative().nullable().optional(),
  speedLimitKph: z.number().nonnegative().max(300).nullable().optional(),
  truckDamagePercent: z.number().min(0).max(100).nullable().optional(),
  engineDamagePercent: z.number().min(0).max(100).nullable().optional(),
  transmissionDamagePercent: z.number().min(0).max(100).nullable().optional(),
  cabinDamagePercent: z.number().min(0).max(100).nullable().optional(),
  chassisDamagePercent: z.number().min(0).max(100).nullable().optional(),
  wheelDamagePercent: z.number().min(0).max(100).nullable().optional(),
  trailerDamagePercent: z.number().min(0).max(100).nullable().optional(),
  trailerChassisDamagePercent: z.number().min(0).max(100).nullable().optional(),
  cargoDamagePercent: z.number().min(0).max(100).nullable().optional(),
  specialJob: z.boolean().nullable().optional(),
  cargoLoaded: z.boolean().nullable().optional(),
  server: z.string().max(120).nullable().optional(),
  sessionMode: z.enum(["singleplayer", "truckersmp"]).nullable().optional(),
  driverStatus: z.enum(["offline", "client-online", "menu", "driving", "on-job", "paused"]).nullable().optional(),
  sessionId: z.string().max(120).nullable().optional(),
});

const fineSchema = z.object({
  vtcId: z.number().int().positive().nullable().optional(),
  driverId: z.string().min(1).max(80),
  game: z.enum(["ets2", "ats"]),
  type: z.enum(["red_light", "speeding", "wrong_way", "collision", "parking", "toll", "other"]),
  amount: z.number().int().nonnegative(),
  currency: z.string().min(1).max(8).default("EUR"),
  city: z.string().max(120).nullable().optional(),
  occurredAt: z.coerce.date().default(() => new Date()),
  externalId: z.string().max(160).nullable().optional(),
});

const jobSchema = z.object({
  vtcId: z.number().int().positive().nullable().optional(),
  driverId: z.string().min(1).max(80),
  game: z.enum(["ets2", "ats"]),
  mode: z.enum(["casual", "standard", "simulation"]).default("standard"),
  status: z.enum(["accepted", "in_progress", "completed", "cancelled", "abandoned"]).default("completed"),
  cargo: z.string().max(160).nullable().optional(),
  cargoMassKg: z.number().nonnegative().nullable().optional(),
  sourceCity: z.string().max(120).nullable().optional(),
  sourceCompany: z.string().max(160).nullable().optional(),
  sourceCountry: z.string().max(120).nullable().optional(),
  destinationCity: z.string().max(120).nullable().optional(),
  destinationCompany: z.string().max(160).nullable().optional(),
  destinationCountry: z.string().max(120).nullable().optional(),
  distanceKm: z.number().nonnegative().nullable().optional(),
  income: z.number().int().nonnegative().nullable().optional(),
  expenses: z.number().int().nonnegative().default(0),
  late: z.boolean().default(false),
  cargoDamagePercent: z.number().min(0).max(100).default(0),
  truckDamagePercent: z.number().min(0).max(100).default(0),
  trailerDamagePercent: z.number().min(0).max(100).default(0),
  completedAt: z.coerce.date().default(() => new Date()),
  externalId: z.string().max(160).nullable().optional(),
  sourceX: z.number().nullable().optional(),
  sourceZ: z.number().nullable().optional(),
  destinationX: z.number().nullable().optional(),
  destinationZ: z.number().nullable().optional(),
});

const telemetryEventSchema = z.object({
  vtcId: z.number().int().positive().nullable().optional(),
  driverId: z.string().min(1).max(80),
  game: z.enum(["ets2", "ats"]),
  type: z.string().min(1).max(64),
  externalId: z.string().min(1).max(160),
  occurredAt: z.coerce.date().default(() => new Date()),
  amount: z.number().nullable().optional(),
  currency: z.string().max(8).nullable().optional(),
  x: z.number().nullable().optional(),
  y: z.number().nullable().optional(),
  z: z.number().nullable().optional(),
  cargo: z.string().max(160).nullable().optional(),
  sourceCity: z.string().max(120).nullable().optional(),
  destinationCity: z.string().max(120).nullable().optional(),
  damagePercent: z.number().min(0).max(100).nullable().optional(),
  detail: z.string().max(1000).nullable().optional(),
});

const lastPositionStoredAt = new Map<string, number>();

app.get("/health", async () => ({ ok: true, service: "openhaul-api" }));

app.get("/api/v1/public/live", async (request) => {
  const query = z.object({ vtc: z.coerce.number().int().positive().optional() }).parse(request.query);
  const drivers = await getLiveDrivers(query.vtc);
  return { count: drivers.length, drivers };
});

app.get("/api/v1/public/openhaul/status", async (_request, reply) => {
  const drivers = await getLiveDrivers();
  const ets2 = drivers.filter((driver) => driver.game === "ets2").length;
  const ats = drivers.filter((driver) => driver.game === "ats").length;

  reply.header("cache-control", "public, max-age=5");

  return {
    online: drivers.length,
    ets2,
    ats,
    ttlSeconds: 45,
    updatedAt: new Date().toISOString(),
  };
});

app.get("/api/v1/public/live/ws", { websocket: true }, (socket, request) => {
  const query = z.object({ vtc: z.coerce.number().int().positive().optional() }).parse(request.query);
  addRealtimeClient(socket, query.vtc);

  void getLiveDrivers(query.vtc)
    .then((drivers) => socket.send(JSON.stringify({ type: "snapshot", drivers })))
    .catch((error) => {
      app.log.error(error);
      socket.close(1011, "Unable to load live snapshot");
    });
});

app.get("/api/v1/public/vtcs/:id", async (request, reply) => {
  const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
  const resolved = await resolveVtcIdentifier(id);
  if (!resolved) return reply.code(404).send({ error: "vtc_not_found" });
  const vtc = await Vtc.findByPk(resolved.id, { attributes: ["id", "name", "slug", "tag"] });
  return { vtc };
});

app.get("/api/v1/public/vtcs/:id/live", async (request, reply) => {
  const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
  const vtc = await resolveVtcIdentifier(id);
  if (!vtc) return reply.code(404).send({ error: "vtc_not_found" });
  const drivers = await getLiveDrivers(vtc.id);
  return { vtcId: vtc.id, slug: vtc.slug, count: drivers.length, drivers };
});

app.get("/api/v1/public/vtcs", async (request) => {
  const query = z.object({
    q: z.string().max(120).optional(),
    recruitment: z.enum(["all", "open", "closed"]).default("all"),
  }).parse(request.query);

  const vtcs = await Vtc.findAll({
    attributes: [
      "id", "name", "slug", "tag", "description", "logoUrl", "recruitmentOpen", "recruitmentMode",
      [sequelize.literal(`(
        SELECT COUNT(*)::int
        FROM vtc_members
        WHERE vtc_members.vtc_id = "Vtc"."id"
          AND vtc_members.status = 'active'
      )`), "memberCount"],
    ],
    order: [["name", "ASC"]],
  });

  const needle = query.q?.trim().toLowerCase();
  return {
    vtcs: vtcs.filter((vtc) => {
      if (Number(vtc.getDataValue("memberCount")) <= 0) return false;
      const recruitmentOpen = Boolean(vtc.getDataValue("recruitmentOpen"));
      if (query.recruitment === "open" && !recruitmentOpen) return false;
      if (query.recruitment === "closed" && recruitmentOpen) return false;
      if (!needle) return true;
      return [
        vtc.getDataValue("name"),
        vtc.getDataValue("slug"),
        vtc.getDataValue("tag"),
        vtc.getDataValue("description"),
      ].some((value) => String(value ?? "").toLowerCase().includes(needle));
    }),
  };
});

let truckersFmCache: { value: any; expiresAt: number; fetchedAt: string } | null = null;

app.get("/api/v1/public/radio/truckersfm", async (_request, reply) => {
  const url = process.env.TRUCKERSFM_NOWPLAYING_URL ?? "https://azuracast.truckers.fm/api/nowplaying/1";

  if (truckersFmCache && truckersFmCache.expiresAt > Date.now()) {
    reply.header("cache-control", "public, max-age=10, stale-if-error=120");
    reply.header("x-openhaul-radio-cache", "fresh");
    return truckersFmCache.value;
  }

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: {
        "accept": "application/json",
        "user-agent": "OpenHaul/1.0 (+https://github.com/NekoSuneProjects/OpenHaul)",
        "cache-control": "no-cache",
        "pragma": "no-cache",
      },
    });

    if (!response.ok) throw new Error("TruckersFM upstream returned HTTP " + response.status);

    const value = await response.json();
    truckersFmCache = {
      value,
      expiresAt: Date.now() + 15_000,
      fetchedAt: new Date().toISOString(),
    };

    reply.header("cache-control", "public, max-age=10, stale-if-error=120");
    reply.header("x-openhaul-radio-cache", "miss");
    return value;
  } catch (cause) {
    if (truckersFmCache) {
      reply.header("cache-control", "public, max-age=5, stale-if-error=300");
      reply.header("x-openhaul-radio-cache", "stale");
      reply.header("x-openhaul-radio-upstream", "degraded");
      return truckersFmCache.value;
    }

    reply.header("cache-control", "public, max-age=5");
    reply.header("x-openhaul-radio-upstream", "degraded");
    return {
      station: {
        name: "TruckersFM",
        listen_url: "https://radio.truckers.fm",
      },
      listeners: { current: null },
      live: { is_live: false, streamer_name: null },
      now_playing: {
        song: {
          artist: "TruckersFM",
          title: "Now playing temporarily unavailable",
          art: null,
        },
      },
      openhaul: {
        degraded: true,
        reason: cause instanceof Error ? cause.message : "upstream_unavailable",
      },
    };
  }
});

app.post("/api/v1/telemetry/live", async (request, reply) => {
  const identity = await requireTelemetryIdentity(request, reply);
  if (!identity) return;

  const body = liveSchema.parse(request.body);
  let driver = { ...body, updatedAt: new Date().toISOString() };

  if (identity.kind === "user") {
    const membership = await resolveUserVtc(identity.user, body.vtcId);

    if (body.vtcId && !membership) {
      return reply.code(403).send({ error: "not_member_of_vtc" });
    }

    driver = {
      ...driver,
      driverId: identity.user.steamId,
      username: identity.user.displayName,
      vtcId: membership?.vtc.id ?? null,
      vtcName: membership ? String(membership.vtc.getDataValue("name")) : null,
      vtcTag: membership ? (membership.vtc.getDataValue("tag") as string | null) : null,
    };
  }

  const liveState = await setLiveDriver(driver);
  broadcastDriver(driver);

  const nowMs = Date.now();
  const lastStored = lastPositionStoredAt.get(driver.driverId) ?? 0;
  if (nowMs - lastStored >= 10_000) {
    lastPositionStoredAt.set(driver.driverId, nowMs);
    void DriverPosition.create({
      driverId: driver.driverId,
      vtcId: driver.vtcId ?? null,
      game: driver.game,
      x: driver.x,
      y: driver.y ?? 0,
      z: driver.z,
      heading: driver.heading,
      speedKph: driver.speedKph,
      sessionId: driver.sessionId ?? null,
      recordedAt: new Date(),
    }).catch((error) => app.log.warn({ error }, "Unable to store driver replay position"));
  }

  if (!liveState.wasOnline && driver.vtcId) {
    await recordVtcActivity({
      vtcId: driver.vtcId,
      driverId: driver.driverId,
      actorUserId: identity.kind === "user" ? identity.user.id : null,
      type: "driver.online",
      title: driver.username + " started driving",
      detail: [driver.game.toUpperCase(), driver.truck, driver.cargo].filter(Boolean).join(" · "),
      metadata: {
        game: driver.game,
        truck: driver.truck,
        cargo: driver.cargo,
        sourceCity: driver.sourceCity,
        destinationCity: driver.destinationCity,
      },
    });
  }

  if (!liveState.wasOnline) {
    await TelemetryEvent.create({
      driverId: driver.driverId,
      vtcId: driver.vtcId ?? null,
      game: driver.game,
      type: "session.started",
      source: "telemetry",
      raw: body,
      normalized: driver,
      occurredAt: new Date(),
    });
  }

  return reply.code(202).send({ accepted: true, driverId: driver.driverId });
});

app.delete("/api/v1/telemetry/live/:driverId", async (request, reply) => {
  const identity = await requireTelemetryIdentity(request, reply);
  if (!identity) return;

  const params = z.object({ driverId: z.string().min(1).max(80) }).parse(request.params);
  const driverId = identity.kind === "user" ? identity.user.steamId : params.driverId;

  const driver = await removeLiveDriver(driverId);
  broadcastOffline(driverId, driver?.vtcId);
  if (driver?.vtcId) {
    await recordVtcActivity({
      vtcId: driver.vtcId,
      driverId,
      actorUserId: identity.kind === "user" ? identity.user.id : null,
      type: "driver.offline",
      title: (driver.username || driverId) + " stopped driving",
      detail: driver.game.toUpperCase(),
      metadata: { game: driver.game, truck: driver.truck, cargo: driver.cargo },
    });
  }

  if (driver) {
    await TelemetryEvent.create({
      driverId,
      vtcId: driver.vtcId ?? null,
      game: driver.game,
      type: "session.ended",
      source: "telemetry",
      raw: {},
      normalized: driver,
      occurredAt: new Date(),
    });
  }

  return { removed: Boolean(driver), driverId };
});

app.post("/api/v1/telemetry/fines", async (request, reply) => {
  const identity = await requireTelemetryIdentity(request, reply);
  if (!identity) return;

  const body = fineSchema.parse(request.body);

  if (body.externalId) {
    const duplicate = await TelemetryEvent.findOne({ where: { externalId: body.externalId } });
    if (duplicate) return reply.code(200).send({ accepted: true, duplicate: true, eventId: duplicate.id });
  }

  if (identity.kind === "user") {
    const membership = await resolveUserVtc(identity.user, body.vtcId);
    if (body.vtcId && !membership) return reply.code(403).send({ error: "not_member_of_vtc" });

    const fine = await Fine.create({
      ...body,
      driverId: identity.user.steamId,
      vtcId: membership?.vtc.id ?? null,
    });
    if (membership && body.amount > 0) {
      await VtcLedgerEntry.create({
        vtcId: membership.vtc.id,
        createdByUserId: identity.user.id,
        type: "penalty",
        description: identity.user.displayName + " penalty: " + body.type.replaceAll("_", " "),
        amount: -Math.abs(body.amount),
        currency: body.currency,
      });
    }
    if (membership) {
      await recordVtcActivity({
        vtcId: membership.vtc.id,
        driverId: identity.user.steamId,
        type: "fine",
        title: identity.user.displayName + " received " + body.type.replaceAll("_", " "),
        detail: body.city ? "Location: " + body.city : null,
        amount: body.amount,
        currency: body.currency,
        metadata: { fineId: fine.id, game: body.game, offence: body.type },
        occurredAt: body.occurredAt,
      });
    }
    await TelemetryEvent.create({
      driverId: identity.user.steamId,
      vtcId: membership?.vtc.id ?? null,
      game: body.game,
      type: "penalty." + body.type,
      source: "telemetry",
      externalId: body.externalId ?? null,
      raw: body,
      normalized: fine.toJSON(),
      occurredAt: body.occurredAt,
    });
    return reply.code(201).send({ fine });
  }

  const fine = await Fine.create(body);
  return reply.code(201).send({ fine });
});

app.post("/api/v1/telemetry/jobs/completed", async (request, reply) => {
  const identity = await requireTelemetryIdentity(request, reply);
  if (!identity) return;

  const body = jobSchema.parse(request.body);

  if (body.externalId) {
    const duplicate = await TelemetryEvent.findOne({ where: { externalId: body.externalId } });
    if (duplicate) return reply.code(200).send({ accepted: true, duplicate: true, eventId: duplicate.id });
  }

  if (identity.kind === "user") {
    const membership = await resolveUserVtc(identity.user, body.vtcId);
    if (body.vtcId && !membership) return reply.code(403).send({ error: "not_member_of_vtc" });

    const job = await Job.create({
      ...body,
      driverId: identity.user.steamId,
      vtcId: membership?.vtc.id ?? null,
      submissionType: "telemetry",
      approvalStatus: "approved",
      profit: Number(body.income ?? 0) - Number(body.expenses ?? 0),
    });
    if (membership && body.income) {
      await VtcLedgerEntry.create({
        vtcId: membership.vtc.id,
        createdByUserId: identity.user.id,
        type: "job_income",
        description: identity.user.displayName + " delivery income",
        amount: Number(body.income) - Number(body.expenses ?? 0),
        currency: body.game === "ats" ? "USD" : "EUR",
      });
    }
    if (membership) {
      await recordVtcActivity({
        vtcId: membership.vtc.id,
        driverId: identity.user.steamId,
        type: "job.completed",
        title: identity.user.displayName + " completed a delivery",
        detail: [body.cargo, body.sourceCity && body.destinationCity ? body.sourceCity + " → " + body.destinationCity : null].filter(Boolean).join(" · "),
        amount: body.income ?? null,
        currency: body.game === "ats" ? "USD" : "EUR",
        metadata: {
          jobId: job.id,
          game: body.game,
          cargo: body.cargo,
          sourceCity: body.sourceCity,
          destinationCity: body.destinationCity,
          distanceKm: body.distanceKm,
        },
        occurredAt: body.completedAt,
      });
    }
    await TelemetryEvent.create({
      driverId: identity.user.steamId,
      vtcId: membership?.vtc.id ?? null,
      game: body.game,
      type: "job.completed",
      source: "telemetry",
      externalId: body.externalId ?? null,
      raw: body,
      normalized: job.toJSON(),
      occurredAt: body.completedAt,
    });
    return reply.code(201).send({ job });
  }

  const job = await Job.create(body);
  return reply.code(201).send({ job });
});

app.post("/api/v1/telemetry/events", async (request, reply) => {
  const identity = await requireTelemetryIdentity(request, reply);
  if (!identity) return;

  const body = telemetryEventSchema.parse(request.body);
  const existing = await TelemetryEvent.findOne({ where: { externalId: body.externalId } });
  if (existing) return reply.code(200).send({ accepted: true, duplicate: true, eventId: existing.id });

  let driverId = body.driverId;
  let vtcId = body.vtcId ?? null;
  let actorUserId: number | null = null;
  let displayName = body.driverId;

  if (identity.kind === "user") {
    driverId = identity.user.steamId;
    displayName = identity.user.displayName;
    actorUserId = identity.user.id;
    const membership = await resolveUserVtc(identity.user, body.vtcId);
    if (body.vtcId && !membership) return reply.code(403).send({ error: "not_member_of_vtc" });
    vtcId = membership?.vtc.id ?? null;
  }

  const event = await TelemetryEvent.create({
    driverId,
    vtcId,
    game: body.game,
    type: body.type,
    source: "telemetry",
    externalId: body.externalId,
    raw: body,
    normalized: {
      amount: body.amount,
      currency: body.currency,
      x: body.x,
      y: body.y,
      z: body.z,
      cargo: body.cargo,
      sourceCity: body.sourceCity,
      destinationCity: body.destinationCity,
      damagePercent: body.damagePercent,
      detail: body.detail,
    },
    occurredAt: body.occurredAt,
  });

  if (vtcId) {
    await recordVtcActivity({
      vtcId,
      driverId,
      actorUserId,
      type: body.type,
      title: displayName + " · " + body.type.replaceAll(".", " "),
      detail: body.detail ?? null,
      amount: body.amount ?? null,
      currency: body.currency ?? null,
      metadata: {
        telemetryEventId: event.id,
        cargo: body.cargo,
        sourceCity: body.sourceCity,
        destinationCity: body.destinationCity,
        damagePercent: body.damagePercent,
      },
      occurredAt: body.occurredAt,
    });
  }

  if (vtcId && body.amount && body.amount > 0 && body.type.startsWith("expense.")) {
    await VtcLedgerEntry.create({
      vtcId,
      createdByUserId: actorUserId,
      type: body.type.slice("expense.".length),
      description: displayName + " " + body.type.replaceAll(".", " "),
      amount: -Math.abs(body.amount),
      currency: body.currency ?? (body.game === "ats" ? "USD" : "EUR"),
    });
  }

  return reply.code(201).send({ accepted: true, event });
});

app.get("/api/v1/public/drivers/:driverId/replay", async (request) => {
  const { driverId } = z.object({ driverId: z.string().min(1).max(80) }).parse(request.params);
  const query = z.object({
    sessionId: z.string().max(120).optional(),
    minutes: z.coerce.number().int().min(1).max(720).default(60),
    limit: z.coerce.number().int().min(2).max(5000).default(1000),
  }).parse(request.query);

  // Keep the replay query bounded, then apply the requested rolling time window.
  const positions = await DriverPosition.findAll({
    where: query.sessionId ? { driverId, sessionId: query.sessionId } : { driverId },
    order: [["recordedAt", "DESC"]],
    limit: query.limit,
  });

  const cutoff = Date.now() - query.minutes * 60_000;
  return {
    driverId,
    points: positions
      .filter((point: any) => new Date(point.getDataValue("recordedAt")).getTime() >= cutoff)
      .reverse(),
  };
});

app.get("/api/v1/public/drivers/:driverId/timeline", async (request) => {
  const { driverId } = z.object({ driverId: z.string().min(1).max(80) }).parse(request.params);
  const query = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(request.query);
  return {
    driverId,
    events: await TelemetryEvent.findAll({
      where: { driverId },
      order: [["occurredAt", "DESC"]],
      limit: query.limit,
    }),
  };
});

app.get("/api/v1/client/dispatch", async (request, reply) => {
  const identity = await requireTelemetryIdentity(request, reply);
  if (!identity) return;
  if (identity.kind !== "user") return reply.code(403).send({ error: "user_client_required" });

  const memberships = await VtcMember.findAll({
    where: { userId: identity.user.id, status: "active" },
    attributes: ["vtcId"],
  });
  const vtcIds = memberships.map((membership: any) => String(membership.getDataValue("vtcId")));
  if (!vtcIds.length) return { dispatches: [] };

  const records = await PlatformRecord.findAll({
    where: {
      scopeType: "vtc",
      scopeId: { [Op.in]: vtcIds },
      category: "dispatch",
      status: { [Op.in]: ["pending", "accepted"] },
    },
    order: [["updatedAt", "DESC"]],
    limit: 200,
  });

  const now = Date.now();
  const visible = [];
  for (const record of records as any[]) {
    const data = (record.getDataValue("data") ?? {}) as any;
    const assigned = String(data.driverSteamId ?? "");
    const candidates = Array.isArray(data.candidateDriverIds) ? data.candidateDriverIds.map(String) : [];
    const expiresAt = data.expiresAt ? new Date(String(data.expiresAt)).getTime() : null;

    if (expiresAt && Number.isFinite(expiresAt) && expiresAt < now && record.getDataValue("status") === "pending") {
      await record.update({ status: "expired", data: { ...data, expiredAt: new Date().toISOString() } });
      continue;
    }

    if (assigned !== identity.user.steamId && !candidates.includes(identity.user.steamId)) continue;
    visible.push(record);
  }

  return { dispatches: visible };
});

app.post("/api/v1/client/dispatch/:dispatchId/respond", async (request, reply) => {
  const identity = await requireTelemetryIdentity(request, reply);
  if (!identity) return;
  if (identity.kind !== "user") return reply.code(403).send({ error: "user_client_required" });

  const { dispatchId } = z.object({ dispatchId: z.coerce.number().int().positive() }).parse(request.params);
  const body = z.object({ decision: z.enum(["accepted", "declined"]) }).parse(request.body);

  const record = await PlatformRecord.findByPk(dispatchId);
  if (!record || record.getDataValue("category") !== "dispatch") {
    return reply.code(404).send({ error: "dispatch_not_found" });
  }

  const membership = await VtcMember.findOne({
    where: {
      vtcId: Number(record.getDataValue("scopeId")),
      userId: identity.user.id,
      status: "active",
    },
  });
  if (!membership) return reply.code(403).send({ error: "not_member_of_vtc" });

  const data = (record.getDataValue("data") ?? {}) as any;
  const assigned = String(data.driverSteamId ?? "");
  const candidates = Array.isArray(data.candidateDriverIds) ? data.candidateDriverIds.map(String) : [];
  if (assigned !== identity.user.steamId && !candidates.includes(identity.user.steamId)) {
    return reply.code(403).send({ error: "dispatch_not_assigned" });
  }

  const expiresAt = data.expiresAt ? new Date(String(data.expiresAt)).getTime() : null;
  if (expiresAt && Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    await record.update({ status: "expired", data: { ...data, expiredAt: new Date().toISOString() } });
    return reply.code(409).send({ error: "dispatch_expired" });
  }

  const audit = Array.isArray(data.audit) ? data.audit : [];
  audit.push({
    at: new Date().toISOString(),
    driverSteamId: identity.user.steamId,
    decision: body.decision,
  });

  if (body.decision === "accepted") {
    await record.update({
      status: "accepted",
      data: {
        ...data,
        driverSteamId: identity.user.steamId,
        acceptedAt: new Date().toISOString(),
        audit,
      },
    });
  } else {
    const remaining = candidates.filter((candidate: string) => candidate !== identity.user.steamId);
    const nextDriver = data.allowReassign !== false ? remaining[0] : null;
    await record.update({
      status: nextDriver ? "pending" : "declined",
      data: {
        ...data,
        driverSteamId: nextDriver ?? identity.user.steamId,
        candidateDriverIds: remaining,
        declinedAt: new Date().toISOString(),
        reassignedAt: nextDriver ? new Date().toISOString() : null,
        audit,
      },
    });
  }

  await recordVtcActivity({
    vtcId: Number(record.getDataValue("scopeId")),
    driverId: identity.user.steamId,
    actorUserId: identity.user.id,
    type: "dispatch." + body.decision,
    title: identity.user.displayName + " " + body.decision + " dispatch " + String(record.getDataValue("key")),
    metadata: { dispatchId: record.id },
  });

  return { dispatch: record };
});

app.get("/api/v1/vtc/me", { preHandler: [requireVtcApiKey] }, async (request) => {
  const vtc = await Vtc.findByPk(request.openhaulVtc!.id, { attributes: ["id", "name", "slug", "tag"] });
  return { vtc, scopes: request.openhaulVtc!.scopes };
});

app.get("/api/v1/vtc/live", { preHandler: [requireVtcApiKey, requireScope("telemetry:read")] }, async (request) => {
  const drivers = await getLiveDrivers(request.openhaulVtc!.id);
  return { count: drivers.length, drivers };
});

app.get("/api/v1/vtc/jobs", { preHandler: [requireVtcApiKey, requireScope("jobs:read")] }, async (request) => ({
  jobs: await Job.findAll({ where: { vtcId: request.openhaulVtc!.id }, order: [["id", "DESC"]], limit: 100 }),
}));

app.get("/api/v1/vtc/fines", { preHandler: [requireVtcApiKey, requireScope("fines:read")] }, async (request) => ({
  fines: await Fine.findAll({ where: { vtcId: request.openhaulVtc!.id }, order: [["occurredAt", "DESC"]], limit: 100 }),
}));

app.get("/api/v1/vtc/members", { preHandler: [requireVtcApiKey, requireScope("members:read")] }, async (request) => ({
  members: await VtcMember.findAll({
    where: { vtcId: request.openhaulVtc!.id, status: "active" },
    include: [{ model: User, attributes: ["steamId", "displayName", "avatarUrl"] }],
    order: [["id", "ASC"]],
  }),
}));

app.get("/api/v1/vtc/events", { preHandler: [requireVtcApiKey, requireScope("events:read")] }, async (request) => ({
  events: await VtcActivityEvent.findAll({
    where: { vtcId: request.openhaulVtc!.id },
    order: [["id", "DESC"]],
    limit: 250,
  }),
}));

app.get("/api/v1/vtc/moderation", { preHandler: [requireVtcApiKey, requireScope("moderation:read")] }, async (request) => ({
  actions: await VtcModerationAction.findAll({
    where: { vtcId: request.openhaulVtc!.id },
    include: [{ model: User, attributes: ["steamId", "displayName", "avatarUrl"] }],
    order: [["id", "DESC"]],
    limit: 250,
  }),
}));

app.get("/api/v1/vtc/statistics", { preHandler: [requireVtcApiKey, requireScope("statistics:read")] }, async (request) => {
  const vtcId = request.openhaulVtc!.id;
  const [members, jobs, distanceKm, income, fines, fineAmount] = await Promise.all([
    VtcMember.count({ where: { vtcId, status: "active" } }),
    Job.count({ where: { vtcId } }),
    Job.sum("distanceKm", { where: { vtcId } }),
    Job.sum("income", { where: { vtcId } }),
    Fine.count({ where: { vtcId } }),
    Fine.sum("amount", { where: { vtcId } }),
  ]);

  return {
    vtcId,
    members,
    jobs,
    distanceKm: Number(distanceKm || 0),
    income: Number(income || 0),
    fines,
    fineAmount: Number(fineAmount || 0),
  };
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) return reply.code(400).send({ error: "validation_error", issues: error.issues });
  app.log.error(error);
  return reply.code(500).send({ error: "internal_error" });
});

await initDatabase();
await app.listen({ host: "0.0.0.0", port: Number(process.env.API_PORT ?? 3001) });
