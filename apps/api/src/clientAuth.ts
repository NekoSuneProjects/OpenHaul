import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Op } from "sequelize";
import { z } from "zod";
import { ClientAuthRequest, User, sequelize } from "./db.js";
import { requireUser } from "./accountSession.js";
import { issueClientToken } from "./clientTokens.js";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function appUrl() {
  return (process.env.APP_URL ?? "https://openhaul.nekosunevr.co.uk").replace(/\/$/, "");
}

export async function registerClientAuthRoutes(app: FastifyInstance) {
  app.post("/api/v1/client-auth/start", async (request) => {
    const { clientName } = z.object({
      clientName: z.string().min(1).max(120).default("Windows Client"),
    }).parse(request.body ?? {});

    const requestId = randomBytes(18).toString("base64url");
    const secret = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await ClientAuthRequest.create({
      requestId,
      secretHash: hash(secret),
      userId: null,
      clientName,
      approvedAt: null,
      consumedAt: null,
      expiresAt,
    });

    return {
      requestId,
      secret,
      expiresAt,
      verificationUrl: appUrl() + "/account/connect-client?request=" + encodeURIComponent(requestId),
      pollIntervalMs: 2000,
    };
  });

  app.post("/api/v1/client-auth/poll", async (request, reply) => {
    const { requestId, secret } = z.object({
      requestId: z.string().min(8).max(64),
      secret: z.string().min(16).max(128),
    }).parse(request.body);

    const row = await ClientAuthRequest.findOne({ where: { requestId } });
    if (!row || row.getDataValue("expiresAt") <= new Date()) {
      return reply.code(410).send({ status: "expired" });
    }

    if (row.getDataValue("secretHash") !== hash(secret)) {
      return reply.code(403).send({ status: "invalid" });
    }

    if (row.getDataValue("consumedAt")) {
      return reply.code(410).send({ status: "consumed" });
    }

    const userId = row.getDataValue("userId") as number | null;
    if (!userId || !row.getDataValue("approvedAt")) {
      return { status: "pending" };
    }

    const result = await sequelize.transaction(async (transaction) => {
      const locked = await ClientAuthRequest.findOne({
        where: {
          id: row.id,
          consumedAt: { [Op.is]: null },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!locked) return null;

      const { token } = await issueClientToken(
        userId,
        String(locked.getDataValue("clientName") || "Windows Client"),
        transaction,
      );

      await locked.update({ consumedAt: new Date() }, { transaction });
      const user = await User.findByPk(userId, {
        attributes: ["steamId", "displayName", "avatarUrl"],
        transaction,
      });

      return { token, user };
    });

    if (!result) return reply.code(410).send({ status: "consumed" });

    return {
      status: "approved",
      clientToken: result.token,
      user: result.user,
    };
  });

  app.get("/api/v1/account/client-auth/:requestId", { preHandler: [requireUser] }, async (request, reply) => {
    const { requestId } = z.object({ requestId: z.string().min(8).max(64) }).parse(request.params);

    const row = await ClientAuthRequest.findOne({ where: { requestId } });
    if (!row || row.getDataValue("expiresAt") <= new Date()) {
      return reply.code(404).send({ error: "client_auth_request_not_found" });
    }

    return {
      requestId,
      clientName: row.getDataValue("clientName"),
      expiresAt: row.getDataValue("expiresAt"),
      approved: Boolean(row.getDataValue("approvedAt")),
      consumed: Boolean(row.getDataValue("consumedAt")),
    };
  });

  app.post("/api/v1/account/client-auth/approve", { preHandler: [requireUser] }, async (request, reply) => {
    const { requestId } = z.object({
      requestId: z.string().min(8).max(64),
    }).parse(request.body);

    const row = await ClientAuthRequest.findOne({ where: { requestId } });
    if (!row || row.getDataValue("expiresAt") <= new Date()) {
      return reply.code(404).send({ error: "client_auth_request_not_found" });
    }

    if (row.getDataValue("consumedAt")) {
      return reply.code(409).send({ error: "client_auth_request_consumed" });
    }

    await row.update({
      userId: request.openhaulUser!.id,
      approvedAt: new Date(),
    });

    return { ok: true };
  });
}
