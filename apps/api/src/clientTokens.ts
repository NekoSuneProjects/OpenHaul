import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ClientToken } from "./db.js";
import { requireUser } from "./accountSession.js";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function registerClientTokenRoutes(app: FastifyInstance) {
  app.get("/api/v1/account/client-tokens", { preHandler: [requireUser] }, async (request) => ({
    tokens: await ClientToken.findAll({
      where: { userId: request.openhaulUser!.id },
      attributes: ["id", "name", "prefix", "lastUsedAt", "revokedAt", "createdAt"],
      order: [["id", "DESC"]],
    }),
  }));

  app.post("/api/v1/account/client-tokens", { preHandler: [requireUser] }, async (request, reply) => {
    const { name } = z.object({
      name: z.string().min(1).max(120).default("Windows Client"),
    }).parse(request.body ?? {});

    const token = "oh_client_" + randomBytes(30).toString("base64url");
    const prefix = token.slice(0, 20);

    const record = await ClientToken.create({
      userId: request.openhaulUser!.id,
      name,
      prefix,
      tokenHash: hashToken(token),
      lastUsedAt: null,
      revokedAt: null,
    });

    return reply.code(201).send({
      token,
      record: {
        id: record.id,
        name: record.getDataValue("name"),
        prefix: record.getDataValue("prefix"),
      },
      warning: "This token is only shown once.",
    });
  });

  app.delete("/api/v1/account/client-tokens/:id", { preHandler: [requireUser] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);

    const token = await ClientToken.findOne({
      where: { id, userId: request.openhaulUser!.id },
    });
    if (!token) return reply.code(404).send({ error: "client_token_not_found" });

    await token.update({ revokedAt: new Date() });
    return { ok: true };
  });
}
