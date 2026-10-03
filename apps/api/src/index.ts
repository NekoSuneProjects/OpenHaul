import { timingSafeEqual } from "node:crypto";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { Fine, Job, Vtc, initDatabase } from "./db.js";
import { requireScope, requireVtcApiKey } from "./auth.js";
import { getLiveDrivers, setLiveDriver } from "./live.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const liveSchema = z.object({
  driverId: z.string().min(1).max(80),
  username: z.string().min(1).max(120),
  game: z.enum(["ets2", "ats"]),
  vtcId: z.number().int().positive().nullable().optional(),
  vtcName: z.string().max(120).nullable().optional(),
  vtcTag: z.string().max(32).nullable().optional(),
  x: z.number(),
  y: z.number().optional(),
  z: z.number(),
  heading: z.number(),
  speedKph: z.number().min(0).max(300),
  truck: z.string().max(160).nullable().optional(),
  cargo: z.string().max(160).nullable().optional(),
  sourceCity: z.string().max(120).nullable().optional(),
  destinationCity: z.string().max(120).nullable().optional(),
  server: z.string().max(120).nullable().optional(),
});

function safeSecretEquals(actual: string | undefined, expected: string | undefined) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

app.get("/health", async () => ({ ok: true, service: "openhaul-api" }));

app.get("/api/v1/public/live", async (request) => {
  const query = z.object({ vtc: z.coerce.number().int().positive().optional() }).parse(request.query);
  const drivers = await getLiveDrivers(query.vtc);
  return { count: drivers.length, drivers };
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
  const ingestHeader = request.headers["x-ingest-key"];
  const actual = Array.isArray(ingestHeader) ? ingestHeader[0] : ingestHeader;
  if (!safeSecretEquals(actual, process.env.OPENHAUL_INGEST_KEY)) {
    return reply.code(401).send({ error: "invalid_ingest_key" });
  }

  const body = liveSchema.parse(request.body);
  const driver = { ...body, updatedAt: new Date().toISOString() };
  await setLiveDriver(driver);
  return reply.code(202).send({ accepted: true });
});

app.get("/api/v1/vtc/me", { preHandler: [requireVtcApiKey] }, async (request) => {
  const vtc = await Vtc.findByPk(request.openhaulVtc!.id, { attributes: ["id", "name", "slug", "tag"] });
  return { vtc, scopes: request.openhaulVtc!.scopes };
});

app.get("/api/v1/vtc/live", { preHandler: [requireVtcApiKey, requireScope("telemetry:read")] }, async (request) => {
  const drivers = await getLiveDrivers(request.openhaulVtc!.id);
  return { count: drivers.length, drivers };
});

app.get("/api/v1/vtc/jobs", { preHandler: [requireVtcApiKey, requireScope("jobs:read")] }, async (request) => {
  const jobs = await Job.findAll({
    where: { vtcId: request.openhaulVtc!.id },
    order: [["id", "DESC"]],
    limit: 100,
  });
  return { jobs };
});

app.get("/api/v1/vtc/fines", { preHandler: [requireVtcApiKey, requireScope("fines:read")] }, async (request) => {
  const fines = await Fine.findAll({
    where: { vtcId: request.openhaulVtc!.id },
    order: [["occurredAt", "DESC"]],
    limit: 100,
  });
  return { fines };
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({ error: "validation_error", issues: error.issues });
  }
  app.log.error(error);
  return reply.code(500).send({ error: "internal_error" });
});

await initDatabase();
const port = Number(process.env.API_PORT ?? 3001);
await app.listen({ host: "0.0.0.0", port });
