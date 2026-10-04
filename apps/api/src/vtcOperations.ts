import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Op } from "sequelize";
import { z } from "zod";
import {
  Job,
  PlatformRecord,
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
  const event = await VtcActivityEvent.create({
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

  void (async () => {
    const webhooks = await PlatformRecord.findAll({
      where: {
        scopeType: "vtc",
        scopeId: String(input.vtcId),
        category: "webhooks",
        status: "active",
      },
      limit: 25,
    });
    for (const hook of webhooks) {
      const data = (hook.getDataValue("data") ?? {}) as Record<string, unknown>;
      const url = typeof data.url === "string" ? data.url : "";
      if (!/^https?:\/\//i.test(url)) continue;
      let deliveryStatus = "delivered";
      let responseCode: number | null = null;
      let error: string | null = null;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": "OpenHaul-Webhook/1.0" },
          body: JSON.stringify({
            id: event.id,
            type: input.type,
            vtcId: input.vtcId,
            driverId: input.driverId ?? null,
            title: input.title,
            detail: input.detail ?? null,
            amount: input.amount ?? null,
            currency: input.currency ?? null,
            metadata: input.metadata ?? {},
            occurredAt: input.occurredAt ?? new Date(),
          }),
          signal: AbortSignal.timeout(8000),
        });
        responseCode = response.status;
        if (!response.ok) deliveryStatus = "failed";
      } catch (cause) {
        deliveryStatus = "failed";
        error = cause instanceof Error ? cause.message.slice(0, 500) : "delivery_failed";
      }
      await PlatformRecord.create({
        scopeType: "vtc",
        scopeId: String(input.vtcId),
        category: "webhook-deliveries",
        key: "event_" + event.id + "_hook_" + hook.id + "_" + Date.now(),
        status: deliveryStatus,
        data: { webhookId: hook.id, eventId: event.id, url, responseCode, error, attempts: 1 },
        createdByUserId: input.actorUserId ?? null,
      }).catch(() => {});
    }
  })().catch(() => {});

  return event;
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

  app.get("/api/v1/account/vtcs/:id/logbook", { preHandler: [requireManager] }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const query = z.object({
      q: z.string().max(160).optional(),
      game: z.enum(["all", "ets2", "ats"]).default("all"),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(10).max(100).default(25),
    }).parse(request.query);

    const where: any = { vtcId: id };
    if (query.game !== "all") where.game = query.game;
    if (query.from || query.to) {
      where.completedAt = {};
      if (query.from) where.completedAt[Op.gte] = query.from;
      if (query.to) where.completedAt[Op.lte] = query.to;
    }
    if (query.q?.trim()) {
      const needle = "%" + query.q.trim() + "%";
      const numeric = Number(query.q);
      where[Op.or] = [
        { cargo: { [Op.iLike]: needle } },
        { sourceCity: { [Op.iLike]: needle } },
        { destinationCity: { [Op.iLike]: needle } },
        { driverId: { [Op.iLike]: needle } },
        ...(Number.isFinite(numeric) ? [{ id: numeric }] : []),
      ];
    }

    const { rows, count } = await Job.findAndCountAll({
      where,
      order: [["completedAt", "DESC"], ["id", "DESC"]],
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });

    return {
      jobs: rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count,
        pages: Math.max(1, Math.ceil(count / query.pageSize)),
      },
    };
  });

  app.get("/api/v1/account/vtcs/:id/logbook/export", { preHandler: [requireManager] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const query = z.object({
      format: z.enum(["json", "csv"]).default("json"),
      game: z.enum(["all", "ets2", "ats"]).default("all"),
    }).parse(request.query);

    const where: any = { vtcId: id };
    if (query.game !== "all") where.game = query.game;
    const jobs = await Job.findAll({ where, order: [["completedAt", "DESC"]], limit: 20000 });

    if (query.format === "json") {
      reply.header("content-disposition", 'attachment; filename="openhaul-vtc-logbook.json"');
      return { vtcId: id, exportedAt: new Date().toISOString(), jobs };
    }

    const keys = ["id", "driverId", "game", "cargo", "sourceCity", "destinationCity", "distanceKm", "income", "completedAt"];
    const cell = (value: unknown) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
    const lines = [keys.join(",")];
    for (const job of jobs) {
      const plain = job.toJSON() as Record<string, unknown>;
      lines.push(keys.map((key) => cell(plain[key])).join(","));
    }
    reply.type("text/csv; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="openhaul-vtc-logbook.csv"');
    return lines.join("\n");
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
