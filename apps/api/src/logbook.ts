import type { FastifyInstance } from "fastify";
import { Op } from "sequelize";
import { z } from "zod";
import { Fine, Job, VtcMember } from "./db.js";
import { requireUser } from "./accountSession.js";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return '"' + text.replaceAll('"', '""') + '"';
}

export async function registerLogbookRoutes(app: FastifyInstance) {
  app.get("/api/v1/account/logbook", { preHandler: [requireUser] }, async (request) => {
    const query = z.object({
      q: z.string().max(160).optional(),
      game: z.enum(["all", "ets2", "ats"]).default("all"),
      vtcId: z.coerce.number().int().positive().optional(),
      cargo: z.string().max(160).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(10).max(100).default(25),
    }).parse(request.query);

    const where: any = { driverId: request.openhaulUser!.steamId };
    if (query.game !== "all") where.game = query.game;
    if (query.vtcId) {
      const membership = await VtcMember.findOne({
        where: { vtcId: query.vtcId, userId: request.openhaulUser!.id },
      });
      if (membership) where.vtcId = query.vtcId;
      else where.vtcId = -1;
    }
    if (query.cargo) where.cargo = { [Op.iLike]: "%" + query.cargo + "%" };
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
        { sourceCompany: { [Op.iLike]: needle } },
        { destinationCompany: { [Op.iLike]: needle } },
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

  app.get("/api/v1/account/logbook/export", { preHandler: [requireUser] }, async (request, reply) => {
    const query = z.object({
      format: z.enum(["json", "csv"]).default("json"),
      game: z.enum(["all", "ets2", "ats"]).default("all"),
    }).parse(request.query);

    const where: any = { driverId: request.openhaulUser!.steamId };
    if (query.game !== "all") where.game = query.game;

    const jobs = await Job.findAll({
      where,
      order: [["completedAt", "DESC"], ["id", "DESC"]],
      limit: 10000,
    });

    if (query.format === "json") {
      reply.header("content-disposition", 'attachment; filename="openhaul-logbook.json"');
      return { exportedAt: new Date().toISOString(), jobs };
    }

    const header = ["id", "game", "cargo", "sourceCity", "destinationCity", "distanceKm", "income", "completedAt"];
    const lines = [header.join(",")];
    for (const job of jobs) {
      const plain = job.toJSON() as Record<string, unknown>;
      lines.push(header.map((key) => csvCell(plain[key])).join(","));
    }
    reply.type("text/csv; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="openhaul-logbook.csv"');
    return lines.join("\n");
  });

  app.get("/api/v1/account/logbook/:jobId", { preHandler: [requireUser] }, async (request, reply) => {
    const { jobId } = z.object({ jobId: z.coerce.number().int().positive() }).parse(request.params);
    const job = await Job.findOne({
      where: { id: jobId, driverId: request.openhaulUser!.steamId },
    });
    if (!job) return reply.code(404).send({ error: "job_not_found" });

    const completedAt = new Date(job.getDataValue("completedAt") ?? Date.now());
    const windowStart = new Date(completedAt.getTime() - 12 * 60 * 60 * 1000);
    const fines = await Fine.findAll({
      where: {
        driverId: request.openhaulUser!.steamId,
        game: job.getDataValue("game"),
        occurredAt: { [Op.between]: [windowStart, completedAt] },
      },
      order: [["occurredAt", "ASC"]],
      limit: 100,
    });

    const gross = Number(job.getDataValue("income") || 0);
    const expenses = fines.reduce((sum, fine) => sum + Number(fine.getDataValue("amount") || 0), 0);

    return {
      job,
      expenses: {
        fines: expenses,
        total: expenses,
        netProfit: gross - expenses,
      },
      timeline: [
        ...fines.map((fine) => ({
          type: "fine",
          at: fine.getDataValue("occurredAt"),
          title: String(fine.getDataValue("type") ?? "penalty").replaceAll("_", " "),
          amount: Number(fine.getDataValue("amount") || 0),
          currency: fine.getDataValue("currency"),
        })),
        {
          type: "job.completed",
          at: completedAt,
          title: "Delivery completed",
          amount: gross,
          currency: job.getDataValue("game") === "ats" ? "USD" : "EUR",
        },
      ].sort((a, b) => new Date(a.at as any).getTime() - new Date(b.at as any).getTime()),
    };
  });
}
