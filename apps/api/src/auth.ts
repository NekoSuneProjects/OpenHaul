import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { VtcApiKey } from "./db.js";

declare module "fastify" {
  interface FastifyRequest {
    openhaulVtc?: {
      id: number;
      apiKeyId: number;
      scopes: string[];
    };
  }
}

function extractKey(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const direct = request.headers["x-api-key"];
  return Array.isArray(direct) ? direct[0] : direct;
}

export async function requireVtcApiKey(request: FastifyRequest, reply: FastifyReply) {
  const rawKey = extractKey(request);
  if (!rawKey) return reply.code(401).send({ error: "missing_api_key" });

  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const record = await VtcApiKey.findOne({ where: { keyHash, revokedAt: null } });
  if (!record) return reply.code(401).send({ error: "invalid_api_key" });

  request.openhaulVtc = {
    id: record.vtcId,
    apiKeyId: record.id,
    scopes: record.scopes ?? [],
  };
}

export function requireScope(scope: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.openhaulVtc?.scopes.includes(scope) && !request.openhaulVtc?.scopes.includes("*")) {
      return reply.code(403).send({ error: "missing_scope", scope });
    }
  };
}
