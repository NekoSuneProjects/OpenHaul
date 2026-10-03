import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ClientToken, User, Vtc, VtcMember } from "./db.js";

export type TelemetryIdentity =
  | { kind: "instance" }
  | {
      kind: "user";
      user: User;
      token: ClientToken;
    };

function safeSecretEquals(actual: string | undefined, expected: string | undefined) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function tokenFromRequest(request: FastifyRequest) {
  const direct = request.headers["x-client-token"];
  if (typeof direct === "string") return direct;
  if (Array.isArray(direct) && direct[0]) return direct[0];

  const authorization = request.headers.authorization;
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return undefined;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requireTelemetryIdentity(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<TelemetryIdentity | undefined> {
  const ingest = request.headers["x-ingest-key"];
  const ingestValue = Array.isArray(ingest) ? ingest[0] : ingest;

  if (typeof ingestValue === "string" && safeSecretEquals(ingestValue, process.env.OPENHAUL_INGEST_KEY)) {
    return { kind: "instance" };
  }

  const rawToken = tokenFromRequest(request);
  if (!rawToken?.startsWith("oh_client_")) {
    reply.code(401).send({ error: "invalid_telemetry_credentials" });
    return undefined;
  }

  const token = await ClientToken.findOne({
    where: {
      tokenHash: hashToken(rawToken),
      revokedAt: null,
    },
  });

  if (!token) {
    reply.code(401).send({ error: "invalid_client_token" });
    return undefined;
  }

  const user = await User.findByPk(token.getDataValue("userId"));
  if (!user) {
    reply.code(401).send({ error: "client_user_not_found" });
    return undefined;
  }

  await token.update({ lastUsedAt: new Date() });
  return { kind: "user", user, token };
}

export async function resolveUserVtc(user: User, requestedVtcId?: number | null) {
  if (!requestedVtcId) return null;

  const member = await VtcMember.findOne({
    where: {
      userId: user.id,
      vtcId: requestedVtcId,
      status: "active",
    },
  });
  if (!member) return null;

  const vtc = await Vtc.findByPk(requestedVtcId);
  if (!vtc) return null;

  return { member, vtc };
}
