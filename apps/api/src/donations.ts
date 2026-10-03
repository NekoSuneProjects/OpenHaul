import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { DonationGoal } from "./db.js";

const goalSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  currency: z.string().min(3).max(8).default("GBP"),
  targetAmount: z.number().positive(),
  currentAmount: z.number().nonnegative().default(0),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const updateSchema = goalSchema.partial();

function sameSecret(actual?: string, expected?: string) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers["x-admin-key"];
  const actual = Array.isArray(header) ? header[0] : header;
  if (!sameSecret(actual, process.env.OPENHAUL_ADMIN_KEY)) {
    return reply.code(401).send({ error: "invalid_admin_key" });
  }
}

export async function registerDonationRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/donation-goals", async () => ({
    enabled: process.env.DONATIONS_ENABLED === "true",
    goals: await DonationGoal.findAll({
      where: { active: true },
      order: [["sortOrder", "ASC"], ["id", "ASC"]],
    }),
  }));

  app.post("/api/v1/admin/donation-goals", { preHandler: [requireAdmin] }, async (request, reply) => {
    const body = goalSchema.parse(request.body);
    const goal = await DonationGoal.create(body);
    return reply.code(201).send({ goal });
  });

  app.patch("/api/v1/admin/donation-goals/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = updateSchema.parse(request.body);
    const goal = await DonationGoal.findByPk(id);
    if (!goal) return reply.code(404).send({ error: "goal_not_found" });

    await goal.update(body);
    return { goal };
  });
}
