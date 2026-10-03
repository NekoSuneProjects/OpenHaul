import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Fine, Job, TwitchAccount, User, UserApiKey, Vtc, VtcMember } from "./db.js";
import { requireUser } from "./accountSession.js";

const allowedScopes = [
  "profile:read",
  "jobs:read",
  "fines:read",
  "vtcs:read",
  "stream:read",
] as const;

type UserApiScope = typeof allowedScopes[number];

declare module "fastify" {
  interface FastifyRequest {
    openhaulApiUser?: User;
    openhaulUserApiKey?: UserApiKey;
  }
}

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function bearerOrHeader(request: FastifyRequest) {
  const header = request.headers["x-api-key"];
  if (typeof header === "string") return header;
  if (Array.isArray(header) && header[0]) return header[0];

  const authorization = request.headers.authorization;
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return undefined;
}

async function requireUserApiKey(request: FastifyRequest, reply: FastifyReply) {
  const raw = bearerOrHeader(request);
  if (!raw?.startsWith("oh_user_")) {
    return reply.code(401).send({ error: "invalid_user_api_key" });
  }

  const key = await UserApiKey.findOne({
    where: { keyHash: hashKey(raw), revokedAt: null },
  });

  if (!key) return reply.code(401).send({ error: "invalid_user_api_key" });

  const user = await User.findByPk(key.userId);
  if (!user) return reply.code(401).send({ error: "api_key_user_not_found" });

  await key.update({ lastUsedAt: new Date() });
  request.openhaulApiUser = user;
  request.openhaulUserApiKey = key;
}

function requireUserScope(scope: UserApiScope) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const scopes = request.openhaulUserApiKey?.scopes ?? [];
    if (!scopes.includes(scope)) {
      return reply.code(403).send({ error: "missing_scope", required: scope });
    }
  };
}

async function createKey(userId: number, name: string, scopes: UserApiScope[]) {
  const raw = "oh_user_" + randomBytes(30).toString("base64url");
  const prefix = raw.slice(0, 18);

  const key = await UserApiKey.create({
    userId,
    name,
    prefix,
    keyHash: hashKey(raw),
    scopes,
    lastUsedAt: null,
    revokedAt: null,
  });

  return {
    raw,
    key: {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      scopes: key.scopes,
    },
  };
}

export async function registerUserApiKeyRoutes(app: FastifyInstance) {
  app.get("/api/v1/account/api-keys", { preHandler: [requireUser] }, async (request) => ({
    keys: await UserApiKey.findAll({
      where: { userId: request.openhaulUser!.id },
      attributes: ["id", "name", "prefix", "scopes", "lastUsedAt", "revokedAt", "createdAt"],
      order: [["id", "DESC"]],
    }),
  }));

  app.post("/api/v1/account/api-keys", { preHandler: [requireUser] }, async (request, reply) => {
    const body = z.object({
      name: z.string().min(1).max(120).default("Account API"),
      scopes: z.array(z.enum(allowedScopes)).min(1).default([...allowedScopes]),
    }).parse(request.body ?? {});

    const created = await createKey(request.openhaulUser!.id, body.name, body.scopes);
    return reply.code(201).send({
      apiKey: created.raw,
      record: created.key,
      warning: "This API key is only shown once.",
    });
  });

  app.post("/api/v1/account/api-keys/default", { preHandler: [requireUser] }, async (request, reply) => {
    const existing = await UserApiKey.count({
      where: { userId: request.openhaulUser!.id, revokedAt: null },
    });
    if (existing > 0) return { created: false };

    const created = await createKey(
      request.openhaulUser!.id,
      "Default account API",
      [...allowedScopes],
    );

    return reply.code(201).send({
      created: true,
      apiKey: created.raw,
      record: created.key,
      warning: "This default API key is only shown once.",
    });
  });

  app.delete("/api/v1/account/api-keys/:id", { preHandler: [requireUser] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const key = await UserApiKey.findOne({
      where: { id, userId: request.openhaulUser!.id },
    });
    if (!key) return reply.code(404).send({ error: "api_key_not_found" });

    await key.update({ revokedAt: new Date() });
    return { ok: true };
  });

  app.get("/api/v1/user/me", {
    preHandler: [requireUserApiKey, requireUserScope("profile:read")],
  }, async (request) => ({ user: request.openhaulApiUser }));

  app.get("/api/v1/user/jobs", {
    preHandler: [requireUserApiKey, requireUserScope("jobs:read")],
  }, async (request) => ({
    jobs: await Job.findAll({
      where: { driverId: request.openhaulApiUser!.steamId },
      order: [["completedAt", "DESC"]],
      limit: 100,
    }),
  }));

  app.get("/api/v1/user/fines", {
    preHandler: [requireUserApiKey, requireUserScope("fines:read")],
  }, async (request) => ({
    fines: await Fine.findAll({
      where: { driverId: request.openhaulApiUser!.steamId },
      order: [["occurredAt", "DESC"]],
      limit: 100,
    }),
  }));

  app.get("/api/v1/user/vtcs", {
    preHandler: [requireUserApiKey, requireUserScope("vtcs:read")],
  }, async (request) => ({
    memberships: await VtcMember.findAll({
      where: { userId: request.openhaulApiUser!.id },
      include: [{ model: Vtc }],
      order: [["id", "ASC"]],
    }),
  }));

  app.get("/api/v1/user/vtcs/:id/summary", {
    preHandler: [requireUserApiKey, requireUserScope("vtcs:read")],
  }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);

    const membership = await VtcMember.findOne({
      where: { userId: request.openhaulApiUser!.id, vtcId: id, status: "active" },
    });
    if (!membership) return reply.code(403).send({ error: "not_member_of_vtc" });

    const [vtc, members, jobs, fines] = await Promise.all([
      Vtc.findByPk(id),
      VtcMember.count({ where: { vtcId: id, status: "active" } }),
      Job.count({ where: { vtcId: id } }),
      Fine.count({ where: { vtcId: id } }),
    ]);

    return {
      vtc,
      membership: {
        role: membership.getDataValue("role"),
        title: membership.getDataValue("title"),
        status: membership.getDataValue("status"),
      },
      stats: { members, jobs, fines },
    };
  });

  app.get("/api/v1/user/twitch", {
    preHandler: [requireUserApiKey, requireUserScope("stream:read")],
  }, async (request) => ({
    twitch: await TwitchAccount.findOne({
      where: { userId: request.openhaulApiUser!.id },
    }),
  }));
}
