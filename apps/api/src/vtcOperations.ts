import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Op } from "sequelize";
import { z } from "zod";
import {
  User,
  Vtc,
  VtcActivityEvent,
  VtcDiscordConfig,
  VtcMember,
  VtcModerationAction,
} from "./db.js";
import { requireUser } from "./accountSession.js";

export type VtcActivityInput = {
  vtcId: number;
  driverId?: string | null;
  actorUserId?: number | null;
  type: string;
  title: string;
  detail?: string | null;
  amount?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

export async function recordVtcActivity(input: VtcActivityInput) {
  if (!input.vtcId) return null;
  return VtcActivityEvent.create({
    vtcId: input.vtcId,
    driverId: input.driverId ?? null,
    actorUserId: input.actorUserId ?? null,
    type: input.type,
    title: input.title,
    detail: input.detail ?? null,
    amount: input.amount ?? null,
    currency: input.currency ?? null,
    metadata: input.metadata ?? {},
    occurredAt: input.occurredAt ?? new Date(),
  });
}

function secretEquals(actual: string | undefined, expected: string | undefined) {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function requireManager(request: FastifyRequest, reply: FastifyReply) {
  await requireUser(request, reply);
  if (reply.sent) return;
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const member = await VtcMember.findOne({
    where: { vtcId: id, userId: request.openhaulUser!.id, status: "active" },
  });
  if (!member || !["owner", "admin", "staff"].includes(String(member.getDataValue("role")))) {
    return reply.code(403).send({ error: "vtc_manager_required" });
  }
}

async function requireOwnerOrAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireUser(request, reply);
  if (reply.sent) return;
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const member = await VtcMember.findOne({
    where: { vtcId: id, userId: request.openhaulUser!.id, status: "active" },
  });
  if (!member || !["owner", "admin"].includes(String(member.getDataValue("role")))) {
    return reply.code(403).send({ error: "vtc_owner_or_admin_required" });
  }
}

const discordSchema = z.object({
  guildId: z.string().max(32).nullable().optional(),
  logChannelId: z.string().max(32).nullable().optional(),
  jobChannelId: z.string().max(32).nullable().optional(),
  fineChannelId: z.string().max(32).nullable().optional(),
  applicationChannelId: z.string().max(32).nullable().optional(),
  moderationChannelId: z.string().max(32).nullable().optional(),
  driverChannelId: z.string().max(32).nullable().optional(),
  enabled: z.boolean().optional(),
});

const moderationSchema = z.object({
  steamId: z.string().regex(/^\d{15,20}$/),
  type: z.enum(["warning", "mute", "ban", "note"]),
  reason: z.string().max(4000).optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

function botInviteUrl() {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!clientId) return null;
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("permissions", "268520448");
  return url.toString();
}

export async function registerVtcOperationsRoutes(app: FastifyInstance) {
  app.get("/api/v1/account/vtcs/:id/activity", { preHandler: [requireManager] }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const query = z.object({ limit: z.coerce.number().int().min(1).max(500).default(150) }).parse(request.query);
    return {
      events: await VtcActivityEvent.findAll({
        where: { vtcId: id },
        order: [["id", "DESC"]],
        limit: query.limit,
      }),
    };
  });

  app.get("/api/v1/account/vtcs/:id/moderation", { preHandler: [requireManager] }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return {
      actions: await VtcModerationAction.findAll({
        where: { vtcId: id },
        include: [{ model: User, attributes: ["steamId", "displayName", "avatarUrl"] }],
        order: [["id", "DESC"]],
        limit: 250,
      }),
    };
  });

  app.post("/api/v1/account/vtcs/:id/moderation", { preHandler: [requireManager] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = moderationSchema.parse(request.body);
    const user = await User.findOne({ where: { steamId: body.steamId } });
    if (!user) return reply.code(404).send({ error: "driver_not_found" });

    const action = await VtcModerationAction.create({
      vtcId: id,
      userId: user.id,
      actorUserId: request.openhaulUser!.id,
      type: body.type,
      reason: body.reason ?? null,
      expiresAt: body.expiresAt ?? null,
      revokedAt: null,
    });

    if (body.type === "ban") {
      const member = await VtcMember.findOne({ where: { vtcId: id, userId: user.id } });
      if (member && member.getDataValue("role") !== "owner") {
        await member.update({ status: "suspended" });
      }
    }

    await recordVtcActivity({
      vtcId: id,
      driverId: user.steamId,
      actorUserId: request.openhaulUser!.id,
      type: "moderation." + body.type,
      title: body.type[0].toUpperCase() + body.type.slice(1) + " issued to " + user.displayName,
      detail: body.reason ?? null,
      metadata: { moderationActionId: action.id, expiresAt: body.expiresAt?.toISOString() ?? null },
    });

    return reply.code(201).send({ action });
  });

  app.delete("/api/v1/account/vtcs/:id/moderation/:actionId", { preHandler: [requireOwnerOrAdmin] }, async (request, reply) => {
    const params = z.object({
      id: z.coerce.number().int().positive(),
      actionId: z.coerce.number().int().positive(),
    }).parse(request.params);
    const action = await VtcModerationAction.findOne({
      where: { id: params.actionId, vtcId: params.id },
      include: [{ model: User, attributes: ["steamId", "displayName"] }],
    });
    if (!action) return reply.code(404).send({ error: "moderation_action_not_found" });
    if (!action.getDataValue("revokedAt")) await action.update({ revokedAt: new Date() });

    const user = action.get("User") as any;
    await recordVtcActivity({
      vtcId: params.id,
      driverId: user?.steamId ?? null,
      actorUserId: request.openhaulUser!.id,
      type: "moderation.revoked",
      title: "Moderation action revoked",
      detail: String(action.getDataValue("type")),
      metadata: { moderationActionId: action.id },
    });
    return reply.code(204).send();
  });

  app.get("/api/v1/account/vtcs/:id/discord", { preHandler: [requireManager] }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const config = await VtcDiscordConfig.findOne({ where: { vtcId: id } });
    return { config, botInviteUrl: botInviteUrl() };
  });

  app.patch("/api/v1/account/vtcs/:id/discord", { preHandler: [requireOwnerOrAdmin] }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = discordSchema.parse(request.body);
    const [config] = await VtcDiscordConfig.findOrCreate({
      where: { vtcId: id },
      defaults: { vtcId: id, enabled: false },
    });
    await config.update(body);
    await recordVtcActivity({
      vtcId: id,
      actorUserId: request.openhaulUser!.id,
      type: "discord.config_changed",
      title: "Discord notification settings updated",
      metadata: { guildId: body.guildId ?? config.getDataValue("guildId"), enabled: body.enabled ?? config.getDataValue("enabled") },
    });
    return { config, botInviteUrl: botInviteUrl() };
  });

  app.get("/api/v1/bot/vtcs", async (request, reply) => {
    const raw = request.headers["x-bot-key"];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!secretEquals(key, process.env.OPENHAUL_BOT_SERVICE_KEY)) {
      return reply.code(401).send({ error: "invalid_bot_key" });
    }

    const configs = await VtcDiscordConfig.findAll({
      where: { enabled: true },
      include: [{ model: Vtc, attributes: ["id", "name", "tag", "recruitmentOpen"] }],
      order: [["vtcId", "ASC"]],
    });
    return { configs };
  });

  app.get("/api/v1/bot/events", async (request, reply) => {
    const raw = request.headers["x-bot-key"];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!secretEquals(key, process.env.OPENHAUL_BOT_SERVICE_KEY)) {
      return reply.code(401).send({ error: "invalid_bot_key" });
    }
    const query = z.object({ after: z.coerce.number().int().nonnegative().default(0) }).parse(request.query);
    const enabled = await VtcDiscordConfig.findAll({ where: { enabled: true }, attributes: ["vtcId"] });
    const vtcIds = enabled.map((item) => Number(item.getDataValue("vtcId")));
    if (!vtcIds.length) return { events: [] };

    const events = await VtcActivityEvent.findAll({
      where: {
        id: { [Op.gt]: query.after },
        vtcId: { [Op.in]: vtcIds },
      },
      order: [["id", "ASC"]],
      limit: 250,
    });
    return { events };
  });
}
