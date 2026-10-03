import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { VtcApiKey, VtcMember } from "./db.js";
import { requireUser } from "./accountSession.js";

const scopes = [
  "telemetry:read",
  "jobs:read",
  "fines:read",
  "statistics:read",
  "members:read",
  "convoys:read",
  "events:read",
] as const;

async function requireVtcAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireUser(request, reply);
  if (reply.sent) return;

  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const membership = await VtcMember.findOne({
    where: {
      userId: request.openhaulUser!.id,
      vtcId: id,
      status: "active",
    },
  });

  const role = String(membership?.getDataValue("role") ?? "");
  if (!["owner", "admin"].includes(role)) {
    return reply.code(403).send({ error: "vtc_owner_or_admin_required" });
  }
}

export async function registerVtcApiKeyManagementRoutes(app: FastifyInstance) {
  app.get("/api/v1/account/vtcs/:id/api-keys", { preHandler: [requireVtcAdmin] }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);

    return {
      keys: await VtcApiKey.findAll({
        where: { vtcId: id },
        attributes: ["id", "name", "scopes", "revokedAt", "createdAt"],
        order: [["id", "DESC"]],
      }),
    };
  });

  app.post("/api/v1/account/vtcs/:id/api-keys", { preHandler: [requireVtcAdmin] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = z.object({
      name: z.string().min(1).max(120).default("VTC integration"),
      scopes: z.array(z.enum(scopes)).min(1).default([
        "telemetry:read",
        "jobs:read",
        "fines:read",
        "statistics:read",
      ]),
    }).parse(request.body ?? {});

    const raw = "oh_vtc_" + randomBytes(30).toString("base64url");
    const keyHash = createHash("sha256").update(raw).digest("hex");

    const record = await VtcApiKey.create({
      vtcId: id,
      name: body.name,
      keyHash,
      scopes: body.scopes,
      revokedAt: null,
    });

    return reply.code(201).send({
      apiKey: raw,
      record: {
        id: record.id,
        name: record.name,
        scopes: record.scopes,
      },
      warning: "This VTC API key is only shown once.",
    });
  });

  app.delete("/api/v1/account/vtcs/:id/api-keys/:keyId", { preHandler: [requireVtcAdmin] }, async (request, reply) => {
    const params = z.object({
      id: z.coerce.number().int().positive(),
      keyId: z.coerce.number().int().positive(),
    }).parse(request.params);

    const key = await VtcApiKey.findOne({
      where: { id: params.keyId, vtcId: params.id },
    });
    if (!key) return reply.code(404).send({ error: "vtc_api_key_not_found" });

    await key.update({ revokedAt: new Date() });
    return { ok: true };
  });
}
