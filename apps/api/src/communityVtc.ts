import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Op } from "sequelize";
import { z } from "zod";
import { User, Vtc, VtcApplication, VtcLedgerEntry, VtcMember } from "./db.js";
import { requireUser } from "./accountSession.js";

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

    return reply.code(201).send({ vtc });
  });

  app.get("/api/v1/account/vtcs", { preHandler: [requireUser] }, async (request) => {
    const memberships = await VtcMember.findAll({
      where: { userId: request.openhaulUser!.id },
      include: [{ model: Vtc }],
      order: [["id", "ASC"]],
    });

    return { memberships };
  });

  app.get("/api/v1/account/vtcs/:id/manage", { preHandler: [requireManager] }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const [vtc, members, applications, ledger] = await Promise.all([
      Vtc.findByPk(id),
      VtcMember.findAll({ where: { vtcId: id }, include: [{ model: User }] }),
      VtcApplication.findAll({ where: { vtcId: id }, order: [["id", "DESC"]] }),
      ledgerSummary(id),
    ]);

    return { vtc, members, applications, ledger };
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

    await member.update(roleSchema.parse(request.body));
    return { member };
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
