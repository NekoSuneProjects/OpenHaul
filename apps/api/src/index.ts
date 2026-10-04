import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { z } from "zod";
import { Fine, Job, User, Vtc, VtcMember, initDatabase, sequelize } from "./db.js";
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
  server: z.string().max(120).nullable().optional(),
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
});

const jobSchema = z.object({
  vtcId: z.number().int().positive().nullable().optional(),
  driverId: z.string().min(1).max(80),
  game: z.enum(["ets2", "ats"]),
  cargo: z.string().max(160).nullable().optional(),
  sourceCity: z.string().max(120).nullable().optional(),
  destinationCity: z.string().max(120).nullable().optional(),
  distanceKm: z.number().nonnegative().nullable().optional(),
  income: z.number().int().nonnegative().nullable().optional(),
  completedAt: z.coerce.date().default(() => new Date()),
});

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

app.get("/api/v1/public/radio/truckersfm", async (_request, reply) => {
  const url = process.env.TRUCKERSFM_NOWPLAYING_URL ?? "https://azuracast.truckers.fm/api/nowplaying/1";
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "user-agent": "OpenHaul/0.1 (+https://github.com/NekoSuneProjects/OpenHaul)",
      "cache-control": "no-cache",
      "pragma": "no-cache",
    },
  });
  if (!response.ok) return reply.code(502).send({ error: "truckersfm_unavailable" });
  reply.header("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  reply.header("pragma", "no-cache");
  reply.header("expires", "0");
  return response.json();
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

  return { removed: Boolean(driver), driverId };
});

app.post("/api/v1/telemetry/fines", async (request, reply) => {
  const identity = await requireTelemetryIdentity(request, reply);
  if (!identity) return;

  const body = fineSchema.parse(request.body);

  if (identity.kind === "user") {
    const membership = await resolveUserVtc(identity.user, body.vtcId);
    if (body.vtcId && !membership) return reply.code(403).send({ error: "not_member_of_vtc" });

    const fine = await Fine.create({
      ...body,
      driverId: identity.user.steamId,
      vtcId: membership?.vtc.id ?? null,
    });
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
    return reply.code(201).send({ fine });
  }

  const fine = await Fine.create(body);
  return reply.code(201).send({ fine });
});

app.post("/api/v1/telemetry/jobs/completed", async (request, reply) => {
  const identity = await requireTelemetryIdentity(request, reply);
  if (!identity) return;

  const body = jobSchema.parse(request.body);

  if (identity.kind === "user") {
    const membership = await resolveUserVtc(identity.user, body.vtcId);
    if (body.vtcId && !membership) return reply.code(403).send({ error: "not_member_of_vtc" });

    const job = await Job.create({
      ...body,
      driverId: identity.user.steamId,
      vtcId: membership?.vtc.id ?? null,
    });
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
    return reply.code(201).send({ job });
  }

  const job = await Job.create(body);
  return reply.code(201).send({ job });
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
