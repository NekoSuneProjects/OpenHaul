import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Op, QueryTypes } from "sequelize";
import { z } from "zod";
import { Fine, Job, User, Vtc, VtcApplication, VtcInvite, VtcLedgerEntry, VtcMember, sequelize } from "./db.js";
import { requireUser } from "./accountSession.js";
import { recordVtcActivity } from "./vtcOperations.js";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/),
  tag: z.string().max(32).optional(),
  description: z.string().max(5000).optional(),
  website: z.string().url().optional().or(z.literal("")),
  discordUrl: z.string().url().optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  currency: z.string().min(3).max(8).default("GBP"),
  recruitmentOpen: z.boolean().default(true),
  publicBalance: z.boolean().default(false),
});

const updateSchema = createSchema.partial().omit({ slug: true });
const applicationSchema = z.object({ message: z.string().max(3000).optional() });
const ledgerSchema = z.object({
  type: z.enum(["income", "expense", "donation", "adjustment"]),
  description: z.string().min(1).max(255),
  amount: z.number(),
  currency: z.string().min(3).max(8).optional(),
});
const roleSchema = z.object({
  role: z.enum(["admin", "staff", "member"]),
  title: z.string().max(80).nullable().optional(),
  status: z.enum(["active", "inactive", "suspended"]).default("active"),
});

const INVITE_LIFETIME_MS = 1000 * 60 * 60 * 24 * 7;

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function membership(userId: number, vtcId: number) {
  return VtcMember.findOne({ where: { userId, vtcId } });
}

async function requireManager(request: FastifyRequest, reply: FastifyReply) {
  await requireUser(request, reply);
  if (reply.sent) return;

  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const member = await membership(request.openhaulUser!.id, id);
  if (!member || !["owner", "admin", "staff"].includes(String(member.getDataValue("role")))) {
    return reply.code(403).send({ error: "vtc_manager_required" });
  }
  (request as any).openhaulVtcMember = member;
}

async function requireOwnerOrAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireUser(request, reply);
  if (reply.sent) return;

  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const member = await membership(request.openhaulUser!.id, id);
  if (!member || !["owner", "admin"].includes(String(member.getDataValue("role")))) {
    return reply.code(403).send({ error: "vtc_owner_or_admin_required" });
  }
  (request as any).openhaulVtcMember = member;
}

async function ledgerSummary(vtcId: number) {
  const [entries, balanceRaw, incomeRaw, expenseRaw] = await Promise.all([
    VtcLedgerEntry.findAll({
      where: { vtcId },
      order: [["id", "DESC"]],
      limit: 100,
    }),
    VtcLedgerEntry.sum("amount", { where: { vtcId } }),
    VtcLedgerEntry.sum("amount", { where: { vtcId, amount: { [Op.gte]: 0 } } }),
    VtcLedgerEntry.sum("amount", { where: { vtcId, amount: { [Op.lt]: 0 } } }),
  ]);

  return {
    balance: Number(balanceRaw || 0),
    income: Number(incomeRaw || 0),
    expenses: Math.abs(Number(expenseRaw || 0)),
    entries,
  };
}

export async function registerCommunityVtcRoutes(app: FastifyInstance) {
  app.post("/api/v1/account/vtcs", { preHandler: [requireUser] }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const user = request.openhaulUser!;

    const existing = await Vtc.findOne({ where: { slug: body.slug } });
    if (existing) return reply.code(409).send({ error: "vtc_slug_taken" });

    const vtc = await Vtc.create({
      ...body,
      tag: body.tag || null,
      description: body.description || null,
      website: body.website || null,
      discordUrl: body.discordUrl || null,
      logoUrl: body.logoUrl || null,
      ownerUserId: user.id,
    });

    await VtcMember.create({
      vtcId: vtc.id,
      userId: user.id,
      role: "owner",
      title: "Owner",
      status: "active",
      joinedAt: new Date(),
    });
    await recordVtcActivity({
      vtcId: vtc.id,
      driverId: user.steamId,
      actorUserId: user.id,
      type: "vtc.created",
      title: user.displayName + " created the VTC",
    });

    return reply.code(201).send({ vtc });
  });

  app.get("/api/v1/account/vtcs", { preHandler: [requireUser] }, async (request) => {
    const memberships = await VtcMember.findAll({
      where: { userId: request.openhaulUser!.id, status: "active" },
      include: [{ model: Vtc }],
      order: [["id", "ASC"]],
    });

    return { memberships };
  });

  app.get("/api/v1/account/vtcs/:id/manage", { preHandler: [requireManager] }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const [vtc, members, applications, invites, ledger, jobStats, fineStats] = await Promise.all([
      Vtc.findByPk(id),
      VtcMember.findAll({ where: { vtcId: id }, include: [{ model: User }] }),
      VtcApplication.findAll({
        where: { vtcId: id },
        include: [{ model: User, attributes: ["steamId", "displayName", "avatarUrl"] }],
        order: [["id", "DESC"]],
      }),
      VtcInvite.findAll({
        where: { vtcId: id },
        attributes: ["id", "expiresAt", "usedAt", "revokedAt", "createdAt"],
        order: [["id", "DESC"]],
        limit: 25,
      }),
      ledgerSummary(id),
      sequelize.query(
        `SELECT driver_id AS "driverId",
                COUNT(*)::int AS "jobs",
                COALESCE(SUM(distance_km), 0)::float AS "distanceKm",
                COALESCE(SUM(income), 0)::bigint AS "income"
         FROM jobs
         WHERE vtc_id = :vtcId
         GROUP BY driver_id`,
        { replacements: { vtcId: id }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT driver_id AS "driverId",
                COUNT(*)::int AS "fines",
                COALESCE(SUM(amount), 0)::bigint AS "fineAmount"
         FROM fines
         WHERE vtc_id = :vtcId
         GROUP BY driver_id`,
        { replacements: { vtcId: id }, type: QueryTypes.SELECT },
      ),
    ]);

    const jobsByDriver = new Map((jobStats as any[]).map((row) => [String(row.driverId), row]));
    const finesByDriver = new Map((fineStats as any[]).map((row) => [String(row.driverId), row]));

    const membersWithStats = members.map((member: any) => {
      const plain = member.toJSON();
      const user = plain.User ?? plain.user;
      const driverId = String(user?.steamId ?? "");
      const jobs = jobsByDriver.get(driverId) as any;
      const fines = finesByDriver.get(driverId) as any;

      return {
        ...plain,
        stats: {
          jobs: Number(jobs?.jobs ?? 0),
          distanceKm: Number(jobs?.distanceKm ?? 0),
          income: Number(jobs?.income ?? 0),
          fines: Number(fines?.fines ?? 0),
          fineAmount: Number(fines?.fineAmount ?? 0),
        },
      };
    });

    return { vtc, members: membersWithStats, applications, invites, ledger };
  });

  app.post("/api/v1/account/vtcs/:id/invites", { preHandler: [requireManager] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const rawToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS);
    const invite = await VtcInvite.create({
      vtcId: id,
      createdByUserId: request.openhaulUser!.id,
      tokenHash: hashInviteToken(rawToken),
      expiresAt,
    });

    return reply.code(201).send({
      invite: { id: invite.id, expiresAt },
      token: rawToken,
      path: `/join/${rawToken}`,
      warning: "This one-person invite link is only shown once and expires in 7 days.",
    });
  });

  app.delete("/api/v1/account/vtcs/:id/invites/:inviteId", { preHandler: [requireManager] }, async (request, reply) => {
    const params = z.object({
      id: z.coerce.number().int().positive(),
      inviteId: z.coerce.number().int().positive(),
    }).parse(request.params);
    const invite = await VtcInvite.findOne({ where: { id: params.inviteId, vtcId: params.id } });
    if (!invite) return reply.code(404).send({ error: "invite_not_found" });
    if (!invite.getDataValue("usedAt") && !invite.getDataValue("revokedAt")) {
      await invite.update({ revokedAt: new Date() });
    }
    return reply.code(204).send();
  });

  app.get("/api/v1/public/vtc-invites/:token", async (request, reply) => {
    const { token } = z.object({ token: z.string().min(32).max(128) }).parse(request.params);
    const invite = await VtcInvite.findOne({
      where: { tokenHash: hashInviteToken(token) },
      include: [{ model: Vtc, attributes: ["id", "name", "slug", "tag"] }],
    });
    if (!invite) return reply.code(404).send({ error: "invite_not_found" });
    if (invite.getDataValue("revokedAt")) return reply.code(410).send({ error: "invite_revoked" });
    if (invite.getDataValue("usedAt")) return reply.code(410).send({ error: "invite_used" });
    if (new Date(invite.getDataValue("expiresAt")).getTime() <= Date.now()) {
      return reply.code(410).send({ error: "invite_expired" });
    }
    return {
      vtc: invite.get("Vtc") ?? invite.get("vtc"),
      expiresAt: invite.getDataValue("expiresAt"),
    };
  });

  app.post("/api/v1/account/vtc-invites/:token/accept", { preHandler: [requireUser] }, async (request, reply) => {
    const { token } = z.object({ token: z.string().min(32).max(128) }).parse(request.params);
    const result = await sequelize.transaction(async (transaction) => {
      const invite = await VtcInvite.findOne({
        where: { tokenHash: hashInviteToken(token) },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!invite) return { error: "invite_not_found", status: 404 } as const;
      if (invite.getDataValue("revokedAt")) return { error: "invite_revoked", status: 410 } as const;
      if (invite.getDataValue("usedAt")) return { error: "invite_used", status: 410 } as const;
      if (new Date(invite.getDataValue("expiresAt")).getTime() <= Date.now()) {
        return { error: "invite_expired", status: 410 } as const;
      }

      const vtcId = Number(invite.getDataValue("vtcId"));
      const existing = await VtcMember.findOne({
        where: { vtcId, userId: request.openhaulUser!.id },
        transaction,
      });
      if (existing?.getDataValue("status") === "active") {
        return { error: "already_member", status: 409 } as const;
      }
      if (existing) {
        await existing.update({ role: "member", status: "active", joinedAt: new Date() }, { transaction });
      } else {
        await VtcMember.create({
          vtcId,
          userId: request.openhaulUser!.id,
          role: "member",
          status: "active",
          joinedAt: new Date(),
        }, { transaction });
      }
      await invite.update({ usedByUserId: request.openhaulUser!.id, usedAt: new Date() }, { transaction });
      await VtcApplication.update(
        { status: "approved" },
        { where: { vtcId, userId: request.openhaulUser!.id, status: "pending" }, transaction },
      );
      return { vtcId } as const;
    });

    if ("error" in result) return reply.code(result.status!).send({ error: result.error });
    await recordVtcActivity({
      vtcId: result.vtcId,
      driverId: request.openhaulUser!.steamId,
      actorUserId: request.openhaulUser!.id,
      type: "member.joined",
      title: request.openhaulUser!.displayName + " joined by invite",
    });
    return { joined: true, vtcId: result.vtcId };
  });

  app.patch("/api/v1/account/vtcs/:id", { preHandler: [requireOwnerOrAdmin] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const vtc = await Vtc.findByPk(id);
    if (!vtc) return reply.code(404).send({ error: "vtc_not_found" });
    await vtc.update(updateSchema.parse(request.body));
    return { vtc };
  });

  app.post("/api/v1/account/vtcs/:id/apply", { preHandler: [requireUser] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const vtc = await Vtc.findByPk(id);
    if (!vtc) return reply.code(404).send({ error: "vtc_not_found" });
    if (!Boolean(vtc.getDataValue("recruitmentOpen"))) {
      return reply.code(409).send({ error: "recruitment_closed" });
    }

    const existingMember = await membership(request.openhaulUser!.id, id);
    if (existingMember) return reply.code(409).send({ error: "already_member" });

    const body = applicationSchema.parse(request.body);
    const [application] = await VtcApplication.findOrCreate({
      where: { vtcId: id, userId: request.openhaulUser!.id, status: "pending" },
      defaults: {
        vtcId: id,
        userId: request.openhaulUser!.id,
        message: body.message || null,
        status: "pending",
      },
    });

    await recordVtcActivity({
      vtcId: id,
      driverId: request.openhaulUser!.steamId,
      actorUserId: request.openhaulUser!.id,
      type: "application.created",
      title: request.openhaulUser!.displayName + " applied to join",
      detail: body.message || null,
      metadata: { applicationId: application.id },
    });
    return reply.code(201).send({ application });
  });

  app.patch("/api/v1/account/vtcs/:id/applications/:applicationId", { preHandler: [requireManager] }, async (request, reply) => {
    const params = z.object({
      id: z.coerce.number().int().positive(),
      applicationId: z.coerce.number().int().positive(),
    }).parse(request.params);
    const body = z.object({ status: z.enum(["approved", "rejected"]) }).parse(request.body);

    const application = await VtcApplication.findOne({
      where: { id: params.applicationId, vtcId: params.id },
    });
    if (!application) return reply.code(404).send({ error: "application_not_found" });

    await application.update({ status: body.status });
    const applicant = await User.findByPk(application.getDataValue("userId"));

    if (body.status === "approved") {
      await VtcMember.findOrCreate({
        where: { vtcId: params.id, userId: application.getDataValue("userId") },
        defaults: {
          vtcId: params.id,
          userId: application.getDataValue("userId"),
          role: "member",
          status: "active",
          joinedAt: new Date(),
        },
      });
    }

    await recordVtcActivity({
      vtcId: params.id,
      driverId: applicant?.steamId ?? null,
      actorUserId: request.openhaulUser!.id,
      type: "application." + body.status,
      title: (applicant?.displayName ?? "Applicant") + " application " + body.status,
      metadata: { applicationId: application.id },
    });
    if (body.status === "approved" && applicant) {
      await recordVtcActivity({
        vtcId: params.id,
        driverId: applicant.steamId,
        actorUserId: request.openhaulUser!.id,
        type: "member.joined",
        title: applicant.displayName + " joined after approval",
      });
    }
    return { application };
  });

  app.patch("/api/v1/account/vtcs/:id/members/:memberId", { preHandler: [requireOwnerOrAdmin] }, async (request, reply) => {
    const params = z.object({
      id: z.coerce.number().int().positive(),
      memberId: z.coerce.number().int().positive(),
    }).parse(request.params);
    const member = await VtcMember.findOne({ where: { id: params.memberId, vtcId: params.id } });
    if (!member) return reply.code(404).send({ error: "member_not_found" });
    if (member.getDataValue("role") === "owner") return reply.code(409).send({ error: "owner_role_locked" });

    const previousRole = String(member.getDataValue("role"));
    const targetUser = await User.findByPk(member.getDataValue("userId"));
    const next = roleSchema.parse(request.body);
    await member.update(next);
    await recordVtcActivity({
      vtcId: params.id,
      driverId: targetUser?.steamId ?? null,
      actorUserId: request.openhaulUser!.id,
      type: "member.role_changed",
      title: (targetUser?.displayName ?? "Member") + " role changed from " + previousRole + " to " + next.role,
      metadata: { previousRole, nextRole: next.role, status: next.status },
    });
    return { member };
  });

  app.delete("/api/v1/account/vtcs/:id/membership", { preHandler: [requireUser] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const member = await membership(request.openhaulUser!.id, id);
    if (!member || member.getDataValue("status") !== "active") {
      return reply.code(404).send({ error: "membership_not_found" });
    }
    if (member.getDataValue("role") === "owner") {
      return reply.code(409).send({ error: "owner_must_transfer_or_close_vtc" });
    }
    await member.destroy();
    await recordVtcActivity({
      vtcId: id,
      driverId: request.openhaulUser!.steamId,
      actorUserId: request.openhaulUser!.id,
      type: "member.left",
      title: request.openhaulUser!.displayName + " left the VTC",
    });
    return reply.code(204).send();
  });

  app.post("/api/v1/account/vtcs/:id/ledger", { preHandler: [requireOwnerOrAdmin] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = ledgerSchema.parse(request.body);
    const vtc = await Vtc.findByPk(id);
    if (!vtc) return reply.code(404).send({ error: "vtc_not_found" });

    const signedAmount = body.type === "expense" ? -Math.abs(body.amount) : body.amount;
    const entry = await VtcLedgerEntry.create({
      vtcId: id,
      createdByUserId: request.openhaulUser!.id,
      type: body.type,
      description: body.description,
      amount: signedAmount,
      currency: body.currency || vtc.getDataValue("currency") || "GBP",
    });

    return reply.code(201).send({ entry, ledger: await ledgerSummary(id) });
  });

  app.get("/api/v1/public/vtcs/:id/community", async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const vtc = await Vtc.findByPk(id);
    if (!vtc) return reply.code(404).send({ error: "vtc_not_found" });

    const members = await VtcMember.findAll({
      where: { vtcId: id, status: "active" },
      attributes: ["id", "role", "title", "joinedAt"],
      include: [{
        model: User,
        attributes: ["steamId", "displayName", "avatarUrl"],
      }],
      order: [["id", "ASC"]],
    });
    const memberCount = members.length;
    const result: any = {
      id: vtc.id,
      name: vtc.getDataValue("name"),
      slug: vtc.getDataValue("slug"),
      tag: vtc.getDataValue("tag"),
      description: vtc.getDataValue("description"),
      website: vtc.getDataValue("website"),
      discordUrl: vtc.getDataValue("discordUrl"),
      logoUrl: vtc.getDataValue("logoUrl"),
      recruitmentOpen: Boolean(vtc.getDataValue("recruitmentOpen")),
      memberCount,
      members,
    };

    if (Boolean(vtc.getDataValue("publicBalance"))) {
      const ledger = await ledgerSummary(id);
      result.balance = ledger.balance;
      result.currency = vtc.getDataValue("currency");
    }

    return result;
  });
}
