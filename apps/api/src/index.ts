import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { z } from "zod";
import { Fine, Job, User, Vtc, VtcMember, initDatabase } from "./db.js";
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
import { requireTelemetryIdentity, resolveUserVtc } from "./telemetryAuth.js";

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
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const vtc = await Vtc.findByPk(id, { attributes: ["id", "name", "slug", "tag"] });
  if (!vtc) return reply.code(404).send({ error: "vtc_not_found" });
  return { vtc };
});

app.get("/api/v1/public/vtcs/:id/live", async (request) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const drivers = await getLiveDrivers(id);
  return { vtcId: id, count: drivers.length, drivers };
});

app.get("/api/v1/public/vtcs", async () => {
  const vtcs = await Vtc.findAll({ attributes: ["id", "name", "slug", "tag"], order: [["name", "ASC"]] });
  return { vtcs };
});

app.get("/api/v1/public/radio/truckersfm", async (_request, reply) => {
  const url = process.env.TRUCKERSFM_NOWPLAYING_URL ?? "https://azuracast.truckers.fm/api/nowplaying/1";
  const response = await fetch(url, { headers: { "user-agent": "OpenHaul/0.1 (+https://github.com/NekoSuneProjects/OpenHaul)" } });
  if (!response.ok) return reply.code(502).send({ error: "truckersfm_unavailable" });
  reply.header("cache-control", "public, max-age=10");
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

  await setLiveDriver(driver);
  broadcastDriver(driver);

  return reply.code(202).send({ accepted: true, driverId: driver.driverId });
});

app.delete("/api/v1/telemetry/live/:driverId", async (request, reply) => {
  const identity = await requireTelemetryIdentity(request, reply);
  if (!identity) return;

  const params = z.object({ driverId: z.string().min(1).max(80) }).parse(request.params);
  const driverId = identity.kind === "user" ? identity.user.steamId : params.driverId;

  const driver = await removeLiveDriver(driverId);
  broadcastOffline(driverId, driver?.vtcId);

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
