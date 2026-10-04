import type { FastifyInstance } from "fastify";
import { QueryTypes } from "sequelize";
import { z } from "zod";
import { Fine, Job, sequelize } from "./db.js";
import { requireScope, requireVtcApiKey } from "./auth.js";
import { getLiveDrivers } from "./live.js";
import { resolveVtcIdentifier } from "./vtcLookup.js";

async function buildStats(vtcId: number) {
  const [jobs, distanceKm, income, fines, fineAmount, live] = await Promise.all([
    Job.count({ where: { vtcId } }),
    Job.sum("distanceKm", { where: { vtcId } }),
    Job.sum("income", { where: { vtcId } }),
    Fine.count({ where: { vtcId } }),
    Fine.sum("amount", { where: { vtcId } }),
    getLiveDrivers(vtcId),
  ]);

  return {
    vtcId,
    liveDrivers: live.length,
    jobs: Number(jobs || 0),
    distanceKm: Number(distanceKm || 0),
    income: Number(income || 0),
    fines: Number(fines || 0),
    fineAmount: Number(fineAmount || 0),
  };
}

async function buildLeaderboard(vtcId: number) {
  return sequelize.query(
    `SELECT
      driver_id AS "driverId",
      COUNT(*)::int AS "jobs",
      COALESCE(SUM(distance_km), 0)::float AS "distanceKm",
      COALESCE(SUM(income), 0)::bigint AS "income",
      MAX(completed_at) AS "lastJobAt"
    FROM jobs
    WHERE vtc_id = :vtcId
    GROUP BY driver_id
    ORDER BY "distanceKm" DESC, "jobs" DESC
    LIMIT 50`,
    {
      replacements: { vtcId },
      type: QueryTypes.SELECT,
    },
  );
}

export async function registerStatsRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/vtcs/:id/stats", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    const vtc = await resolveVtcIdentifier(id);
    if (!vtc) return reply.code(404).send({ error: "vtc_not_found" });
    return buildStats(vtc.id);
  });

  app.get("/api/v1/public/vtcs/:id/leaderboard", async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    const vtc = await resolveVtcIdentifier(id);
    if (!vtc) return reply.code(404).send({ error: "vtc_not_found" });
    return { vtcId: vtc.id, slug: vtc.slug, drivers: await buildLeaderboard(vtc.id) };
  });

  app.get(
    "/api/v1/vtc/stats",
    { preHandler: [requireVtcApiKey, requireScope("statistics:read")] },
    async (request) => buildStats(request.openhaulVtc!.id),
  );

  app.get(
    "/api/v1/vtc/leaderboard",
    { preHandler: [requireVtcApiKey, requireScope("statistics:read")] },
    async (request) => ({
      vtcId: request.openhaulVtc!.id,
      drivers: await buildLeaderboard(request.openhaulVtc!.id),
    }),
  );
}
