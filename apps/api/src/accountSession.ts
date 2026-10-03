import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Op } from "sequelize";
import { AccountSession, User } from "./db.js";

declare module "fastify" {
  interface FastifyRequest {
    openhaulUser?: User;
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAccountSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  await AccountSession.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return { token, expiresAt };
}

export async function deleteAccountSession(token?: string) {
  if (!token) return;
  await AccountSession.destroy({ where: { tokenHash: hashToken(token) } });
}

export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies.openhaul_session;
  if (!token) return reply.code(401).send({ error: "not_authenticated" });

  const session = await AccountSession.findOne({
    where: {
      tokenHash: hashToken(token),
      expiresAt: { [Op.gt]: new Date() },
    },
  });

  if (!session) return reply.code(401).send({ error: "not_authenticated" });

  const user = await User.findByPk(session.getDataValue("userId"));
  if (!user) return reply.code(401).send({ error: "not_authenticated" });

  request.openhaulUser = user;
}
