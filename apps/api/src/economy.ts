import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Op, QueryTypes } from "sequelize";
import { z } from "zod";
import { Fine, Job, PlatformRecord, VtcLedgerEntry, VtcMember, sequelize } from "./db.js";
import { requireUser } from "./accountSession.js";

function periodStart(period: "day" | "week" | "month" | "year") {
  const now = new Date();
  if (period === "day") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "week") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = start.getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - day + 1);
    return start;
  }
  if (period === "month") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}

async function requireManager(request: FastifyRequest, reply: FastifyReply) {
  await requireUser(request, reply);
  if (reply.sent) return;
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const member = await VtcMember.findOne({ where: { vtcId: id, userId: request.openhaulUser!.id, status: "active" } });
  if (!member || !["owner", "admin", "staff"].includes(String(member.getDataValue("role")))) {
    return reply.code(403).send({ error: "vtc_manager_required" });
  }
}

export async function registerEconomyRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/cargo-market", async (_request, reply) => {
    const [cargo, routes] = await Promise.all([
      sequelize.query(
        `SELECT cargo,
                COUNT(*)::int AS jobs,
                COALESCE(SUM(distance_km), 0)::float AS "distanceKm",
                COALESCE(SUM(income), 0)::bigint AS income,
                COALESCE(AVG(cargo_mass_kg), 0)::float AS "averageMassKg"
         FROM jobs
         WHERE approval_status = 'approved'
           AND cargo IS NOT NULL
         GROUP BY cargo
         ORDER BY jobs DESC, "distanceKm" DESC
         LIMIT 100`,
        { type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT source_city AS "sourceCity",
                destination_city AS "destinationCity",
                COUNT(*)::int AS jobs,
                COALESCE(SUM(distance_km), 0)::float AS "distanceKm",
                COALESCE(SUM(income), 0)::bigint AS income
         FROM jobs
         WHERE approval_status = 'approved'
           AND source_city IS NOT NULL
           AND destination_city IS NOT NULL
         GROUP BY source_city, destination_city
         ORDER BY jobs DESC, "distanceKm" DESC
         LIMIT 100`,
        { type: QueryTypes.SELECT },
      ),
    ]);
    reply.header("cache-control", "public, max-age=60");
    return { cargo, routes, generatedAt: new Date().toISOString() };
  });

  app.get("/api/v1/public/fuel-prices", async (_request, reply) => {
    const records = await PlatformRecord.findAll({
      where: { scopeType: "global", scopeId: "public", category: "fuel-prices", status: "active" },
      order: [["updatedAt", "DESC"]],
      limit: 500,
    });
    reply.header("cache-control", "public, max-age=60");
    return { prices: records };
  });

  app.get("/api/v1/account/economy", { preHandler: [requireUser] }, async (request) => {
    const steamId = request.openhaulUser!.steamId;
    const [jobs, gross, jobExpenses, fines] = await Promise.all([
      Job.count({ where: { driverId: steamId, approvalStatus: "approved" } }),
      Job.sum("income", { where: { driverId: steamId, approvalStatus: "approved" } }),
      Job.sum("expenses", { where: { driverId: steamId, approvalStatus: "approved" } }),
      Fine.sum("amount", { where: { driverId: steamId } }),
    ]);
    return {
      jobs,
      grossIncome: Number(gross || 0),
      jobExpenses: Number(jobExpenses || 0),
      penalties: Number(fines || 0),
      net: Number(gross || 0) - Number(jobExpenses || 0) - Number(fines || 0),
    };
  });

  app.get("/api/v1/account/vtcs/:id/financial-report", { preHandler: [requireManager] }, async (request, reply) => {
    if (reply.sent) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const query = z.object({ period: z.enum(["day", "week", "month", "year"]).default("month") }).parse(request.query);
    const start = periodStart(query.period);

    const [jobs, distanceKm, income, jobExpenses, fineAmount, ledger] = await Promise.all([
      Job.count({ where: { vtcId: id, approvalStatus: "approved", completedAt: { [Op.gte]: start } } }),
      Job.sum("distanceKm", { where: { vtcId: id, approvalStatus: "approved", completedAt: { [Op.gte]: start } } }),
      Job.sum("income", { where: { vtcId: id, approvalStatus: "approved", completedAt: { [Op.gte]: start } } }),
      Job.sum("expenses", { where: { vtcId: id, approvalStatus: "approved", completedAt: { [Op.gte]: start } } }),
      Fine.sum("amount", { where: { vtcId: id, occurredAt: { [Op.gte]: start } } }),
      VtcLedgerEntry.sum("amount", { where: { vtcId: id, createdAt: { [Op.gte]: start } } }),
    ]);

    return {
      vtcId: id,
      period: query.period,
      start,
      jobs: Number(jobs || 0),
      distanceKm: Number(distanceKm || 0),
      income: Number(income || 0),
      jobExpenses: Number(jobExpenses || 0),
      penalties: Number(fineAmount || 0),
      ledgerNet: Number(ledger || 0),
      profit: Number(income || 0) - Number(jobExpenses || 0) - Number(fineAmount || 0),
    };
  });
}
