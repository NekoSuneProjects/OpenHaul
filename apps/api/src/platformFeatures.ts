import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Op } from "sequelize";
import { z } from "zod";
import {
  ClientToken,
  PlatformRecord,
  UserApiKey,
  Vtc,
  VtcApiKey,
  VtcMember,
} from "./db.js";
import { requireUser } from "./accountSession.js";

const publicCategories = new Set([
  "announcements",
  "partners",
  "events",
  "cargo-market",
  "fuel-prices",
  "seasons",
  "awards",
  "achievements",
  "challenges",
  "recruitment",
]);

const userCategories = new Set([
  "albums",
  "screenshots",
  "preferences",
  "achievements",
  "challenges",
  "awards",
  "reputation",
  "insurance",
  "reports",
  "appeals",
  "sessions",
]);

const vtcCategories = new Set([
  "roles",
  "permissions",
  "fleet",
  "garages",
  "depots",
  "contracts",
  "dispatch",
  "certifications",
  "training",
  "shifts",
  "goals",
  "seasons",
  "convoys",
  "events",
  "achievements",
  "awards",
  "challenges",
  "reputation",
  "insurance",
  "webhooks",
  "history",
  "policies",
  "recruitment",
  "supporters",
]);

const recordSchema = z.object({
  key: z.string().min(1).max(120).optional(),
  status: z.string().min(1).max(32).default("active"),
  data: z.record(z.any()).default({}),
});

function adminAuthorized(request: FastifyRequest) {
  const raw = request.headers["x-admin-key"];
  const provided = Array.isArray(raw) ? raw[0] : raw;
  const expected = process.env.OPENHAUL_ADMIN_KEY?.trim();
  return Boolean(expected && provided && provided === expected);
}

async function requireVtcManager(request: FastifyRequest, reply: FastifyReply) {
  await requireUser(request, reply);
  if (reply.sent) return null;
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const member = await VtcMember.findOne({
    where: { vtcId: id, userId: request.openhaulUser!.id, status: "active" },
  });
  if (!member || !["owner", "admin", "staff"].includes(String(member.getDataValue("role")))) {
    reply.code(403).send({ error: "vtc_manager_required" });
    return null;
  }
  return member;
}

function randomKey(prefix: string) {
  return prefix + randomBytes(12).toString("base64url");
}

export async function registerPlatformFeatureRoutes(app: FastifyInstance) {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "strict-origin-when-cross-origin");
    reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    reply.header("cross-origin-opener-policy", "same-origin");
    return payload;
  });

  app.get("/api/v1/public/community/:category", async (request, reply) => {
    const { category } = z.object({ category: z.string().min(1).max(64) }).parse(request.params);
    if (!publicCategories.has(category)) return reply.code(404).send({ error: "category_not_public" });
    const records = await PlatformRecord.findAll({
      where: { scopeType: "global", scopeId: "public", category, status: { [Op.ne]: "deleted" } },
      order: [["updatedAt", "DESC"]],
      limit: 250,
    });
    reply.header("cache-control", "public, max-age=30");
    return { category, records };
  });

  app.get("/api/v1/account/features/:category", { preHandler: [requireUser] }, async (request, reply) => {
    const { category } = z.object({ category: z.string().min(1).max(64) }).parse(request.params);
    if (!userCategories.has(category)) return reply.code(404).send({ error: "unsupported_category" });
    return {
      category,
      records: await PlatformRecord.findAll({
        where: { scopeType: "user", scopeId: String(request.openhaulUser!.id), category, status: { [Op.ne]: "deleted" } },
        order: [["updatedAt", "DESC"]],
      }),
    };
  });

  app.post("/api/v1/account/features/:category", { preHandler: [requireUser] }, async (request, reply) => {
    const { category } = z.object({ category: z.string().min(1).max(64) }).parse(request.params);
    if (!userCategories.has(category)) return reply.code(404).send({ error: "unsupported_category" });
    const body = recordSchema.parse(request.body ?? {});
    const record = await PlatformRecord.create({
      scopeType: "user",
      scopeId: String(request.openhaulUser!.id),
      category,
      key: body.key || randomKey(category + "_"),
      status: body.status,
      data: body.data,
      createdByUserId: request.openhaulUser!.id,
    });
    return reply.code(201).send({ record });
  });

  app.patch("/api/v1/account/features/:category/:recordId", { preHandler: [requireUser] }, async (request, reply) => {
    const params = z.object({ category: z.string().min(1).max(64), recordId: z.coerce.number().int().positive() }).parse(request.params);
    if (!userCategories.has(params.category)) return reply.code(404).send({ error: "unsupported_category" });
    const body = recordSchema.partial().parse(request.body ?? {});
    const record = await PlatformRecord.findOne({
      where: { id: params.recordId, scopeType: "user", scopeId: String(request.openhaulUser!.id), category: params.category },
    });
    if (!record) return reply.code(404).send({ error: "record_not_found" });
    await record.update(body);
    return { record };
  });

  app.delete("/api/v1/account/features/:category/:recordId", { preHandler: [requireUser] }, async (request, reply) => {
    const params = z.object({ category: z.string().min(1).max(64), recordId: z.coerce.number().int().positive() }).parse(request.params);
    const record = await PlatformRecord.findOne({
      where: { id: params.recordId, scopeType: "user", scopeId: String(request.openhaulUser!.id), category: params.category },
    });
    if (!record) return reply.code(404).send({ error: "record_not_found" });
    await record.update({ status: "deleted" });
    return reply.code(204).send();
  });

  app.get("/api/v1/account/vtcs/:id/features/:category", { preHandler: [requireVtcManager] }, async (request, reply) => {
    if (reply.sent) return;
    const params = z.object({ id: z.coerce.number().int().positive(), category: z.string().min(1).max(64) }).parse(request.params);
    if (!vtcCategories.has(params.category)) return reply.code(404).send({ error: "unsupported_category" });
    return {
      category: params.category,
      records: await PlatformRecord.findAll({
        where: { scopeType: "vtc", scopeId: String(params.id), category: params.category, status: { [Op.ne]: "deleted" } },
        order: [["updatedAt", "DESC"]],
      }),
    };
  });

  app.post("/api/v1/account/vtcs/:id/features/:category", { preHandler: [requireVtcManager] }, async (request, reply) => {
    if (reply.sent) return;
    const params = z.object({ id: z.coerce.number().int().positive(), category: z.string().min(1).max(64) }).parse(request.params);
    if (!vtcCategories.has(params.category)) return reply.code(404).send({ error: "unsupported_category" });
    const body = recordSchema.parse(request.body ?? {});
    const record = await PlatformRecord.create({
      scopeType: "vtc",
      scopeId: String(params.id),
      category: params.category,
      key: body.key || randomKey(params.category + "_"),
      status: body.status,
      data: body.data,
      createdByUserId: request.openhaulUser!.id,
    });
    return reply.code(201).send({ record });
  });

  app.patch("/api/v1/account/vtcs/:id/features/:category/:recordId", { preHandler: [requireVtcManager] }, async (request, reply) => {
    if (reply.sent) return;
    const params = z.object({
      id: z.coerce.number().int().positive(),
      category: z.string().min(1).max(64),
      recordId: z.coerce.number().int().positive(),
    }).parse(request.params);
    const record = await PlatformRecord.findOne({
      where: { id: params.recordId, scopeType: "vtc", scopeId: String(params.id), category: params.category },
    });
    if (!record) return reply.code(404).send({ error: "record_not_found" });
    await record.update(recordSchema.partial().parse(request.body ?? {}));
    return { record };
  });

  app.delete("/api/v1/account/vtcs/:id/features/:category/:recordId", { preHandler: [requireVtcManager] }, async (request, reply) => {
    if (reply.sent) return;
    const params = z.object({
      id: z.coerce.number().int().positive(),
      category: z.string().min(1).max(64),
      recordId: z.coerce.number().int().positive(),
    }).parse(request.params);
    const record = await PlatformRecord.findOne({
      where: { id: params.recordId, scopeType: "vtc", scopeId: String(params.id), category: params.category },
    });
    if (!record) return reply.code(404).send({ error: "record_not_found" });
    await record.update({ status: "deleted" });
    return reply.code(204).send();
  });

  app.post("/api/v1/account/client-tokens/:id/rotate", { preHandler: [requireUser] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const token = await ClientToken.findOne({ where: { id, userId: request.openhaulUser!.id, revokedAt: null } });
    if (!token) return reply.code(404).send({ error: "client_token_not_found" });
    await token.update({ revokedAt: new Date() });
    return reply.code(201).send({ rotated: true, message: "Create/sign in from the Windows client to issue the replacement token." });
  });

  app.post("/api/v1/account/api-keys/:id/rotate", { preHandler: [requireUser] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const key = await UserApiKey.findOne({ where: { id, userId: request.openhaulUser!.id, revokedAt: null } });
    if (!key) return reply.code(404).send({ error: "api_key_not_found" });
    await key.update({ revokedAt: new Date() });
    return reply.code(200).send({ rotated: true, message: "The old key is revoked. Create a replacement key from Account." });
  });

  app.post("/api/v1/account/vtcs/:id/api-keys/:keyId/rotate", { preHandler: [requireVtcManager] }, async (request, reply) => {
    if (reply.sent) return;
    const params = z.object({ id: z.coerce.number().int().positive(), keyId: z.coerce.number().int().positive() }).parse(request.params);
    const key = await VtcApiKey.findOne({ where: { id: params.keyId, vtcId: params.id, revokedAt: null } });
    if (!key) return reply.code(404).send({ error: "vtc_api_key_not_found" });
    await key.update({ revokedAt: new Date() });
    return { rotated: true, message: "The old VTC key is revoked. Create a replacement key from the VTC dashboard." };
  });

  app.get("/api/v1/account/export", { preHandler: [requireUser] }, async (request, reply) => {
    const user = request.openhaulUser!;
    const records = await PlatformRecord.findAll({ where: { scopeType: "user", scopeId: String(user.id) } });
    reply.header("content-disposition", 'attachment; filename="openhaul-account-export.json"');
    return {
      exportedAt: new Date().toISOString(),
      user,
      featureRecords: records,
    };
  });

  app.delete("/api/v1/account", { preHandler: [requireUser] }, async (request, reply) => {
    const confirm = String(request.headers["x-confirm-delete"] ?? "");
    if (confirm !== request.openhaulUser!.steamId) return reply.code(409).send({ error: "delete_confirmation_required" });
    await PlatformRecord.update({ status: "deleted" }, { where: { scopeType: "user", scopeId: String(request.openhaulUser!.id) } });
    await ClientToken.update({ revokedAt: new Date() }, { where: { userId: request.openhaulUser!.id, revokedAt: null } });
    await UserApiKey.update({ revokedAt: new Date() }, { where: { userId: request.openhaulUser!.id, revokedAt: null } });
    return { deletionRequested: true, retainedIdentity: true, message: "Personal feature data was tombstoned and active tokens were revoked." };
  });

  app.get("/api/v1/setup/status", async () => ({
    configured: Boolean(process.env.OPENHAUL_ADMIN_KEY && process.env.DATABASE_URL && process.env.OPENHAUL_INGEST_KEY),
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    adminConfigured: Boolean(process.env.OPENHAUL_ADMIN_KEY),
    ingestConfigured: Boolean(process.env.OPENHAUL_INGEST_KEY),
    publicUrl: process.env.APP_URL ?? null,
  }));

  app.get("/api/v1/admin/records", async (request, reply) => {
    if (!adminAuthorized(request)) return reply.code(401).send({ error: "admin_required" });
    const query = z.object({
      category: z.string().max(64).optional(),
      scopeType: z.string().max(16).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(200),
    }).parse(request.query);
    const where: any = {};
    if (query.category) where.category = query.category;
    if (query.scopeType) where.scopeType = query.scopeType;
    return { records: await PlatformRecord.findAll({ where, order: [["updatedAt", "DESC"]], limit: query.limit }) };
  });

  app.post("/api/v1/admin/community/:category", async (request, reply) => {
    if (!adminAuthorized(request)) return reply.code(401).send({ error: "admin_required" });
    const { category } = z.object({ category: z.string().min(1).max(64) }).parse(request.params);
    if (!publicCategories.has(category)) return reply.code(400).send({ error: "unsupported_public_category" });
    const body = recordSchema.parse(request.body ?? {});
    const record = await PlatformRecord.create({
      scopeType: "global",
      scopeId: "public",
      category,
      key: body.key || randomKey(category + "_"),
      status: body.status,
      data: body.data,
      createdByUserId: null,
    });
    return reply.code(201).send({ record });
  });

  app.patch("/api/v1/admin/records/:recordId", async (request, reply) => {
    if (!adminAuthorized(request)) return reply.code(401).send({ error: "admin_required" });
    const { recordId } = z.object({ recordId: z.coerce.number().int().positive() }).parse(request.params);
    const record = await PlatformRecord.findByPk(recordId);
    if (!record) return reply.code(404).send({ error: "record_not_found" });
    await record.update(recordSchema.partial().parse(request.body ?? {}));
    return { record };
  });

  app.get("/api/v1/openapi.json", async () => ({
    openapi: "3.1.0",
    info: { title: "OpenHaul API", version: "1.0.0" },
    servers: [{ url: process.env.APP_URL ?? "http://localhost:3000" }],
    paths: {
      "/api/v1/public/live": { get: { summary: "Live OpenHaul drivers" } },
      "/api/v1/public/vtcs": { get: { summary: "VTC directory" } },
      "/api/v1/public/platform/stats": { get: { summary: "Platform totals" } },
      "/api/v1/account/dashboard": { get: { summary: "Signed-in driver dashboard" } },
      "/api/v1/account/logbook": { get: { summary: "Driver logbook" } },
      "/api/v1/account/vtcs/{id}/features/{category}": {
        get: { summary: "List VTC operational records" },
        post: { summary: "Create VTC operational record" },
      },
    },
  }));
}
