import type { FastifyInstance } from "fastify";
import { Op, QueryTypes } from "sequelize";
import { z } from "zod";
import { Fine, Job, User, Vtc, VtcActivityEvent, VtcMember, sequelize } from "./db.js";
import { requireUser } from "./accountSession.js";
import { getLiveDrivers } from "./live.js";

function monthStartUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function dayStartUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function progression(jobs: number, distanceKm: number) {
  const xp = jobs * 100 + Math.floor(distanceKm / 10);
  const level = Math.max(1, Math.floor(Math.sqrt(xp / 250)) + 1);
  const currentLevelFloor = Math.pow(level - 1, 2) * 250;
  const nextLevelFloor = Math.pow(level, 2) * 250;
  return {
    xp,
    level,
    currentLevelXp: currentLevelFloor,
    nextLevelXp: nextLevelFloor,
    progress: nextLevelFloor > currentLevelFloor
      ? Math.max(0, Math.min(1, (xp - currentLevelFloor) / (nextLevelFloor - currentLevelFloor)))
      : 1,
  };
}

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/platform/stats", async (_request, reply) => {
    const [registeredDrivers, vtcs, distanceKm, deliveries, live] = await Promise.all([
      User.count(),
      Vtc.count(),
      Job.sum("distanceKm"),
      Job.count(),
      getLiveDrivers(),
    ]);

    reply.header("cache-control", "public, max-age=15");
    return {
      registeredDrivers,
      vtcs,
      distanceKm: Number(distanceKm || 0),
      deliveries,
      driversOnline: live.length,
      ets2Online: live.filter((driver) => driver.game === "ets2").length,
      atsOnline: live.filter((driver) => driver.game === "ats").length,
      updatedAt: new Date().toISOString(),
    };
  });

  app.get("/api/v1/account/dashboard", { preHandler: [requireUser] }, async (request) => {
    const user = request.openhaulUser!;
    const steamId = user.steamId;
    const monthStart = monthStartUtc();
    const dayStart = dayStartUtc();

    const memberships = await VtcMember.findAll({
      where: { userId: user.id, status: "active" },
      include: [{ model: Vtc, attributes: ["id", "name", "tag"] }],
      order: [["id", "ASC"]],
    });
    const primaryMembership = memberships[0] ?? null;
    const primaryVtcId = primaryMembership ? Number(primaryMembership.getDataValue("vtcId")) : null;

    const [
      jobs,
      distanceKm,
      income,
      fines,
      fineAmount,
      monthJobs,
      monthIncome,
      monthFineAmount,
      monthDistanceKm,
      recentActivity,
      liveDrivers,
      todayVtcJobs,
      todayVtcDistance,
      todayVtcIncome,
      todayVtcFines,
    ] = await Promise.all([
      Job.count({ where: { driverId: steamId } }),
      Job.sum("distanceKm", { where: { driverId: steamId } }),
      Job.sum("income", { where: { driverId: steamId } }),
      Fine.count({ where: { driverId: steamId } }),
      Fine.sum("amount", { where: { driverId: steamId } }),
      Job.count({ where: { driverId: steamId, completedAt: { [Op.gte]: monthStart } } }),
      Job.sum("income", { where: { driverId: steamId, completedAt: { [Op.gte]: monthStart } } }),
      Fine.sum("amount", { where: { driverId: steamId, occurredAt: { [Op.gte]: monthStart } } }),
      Job.sum("distanceKm", { where: { driverId: steamId, completedAt: { [Op.gte]: monthStart } } }),
      VtcActivityEvent.findAll({
        where: { driverId: steamId },
        order: [["id", "DESC"]],
        limit: 30,
      }),
      getLiveDrivers(),
      primaryVtcId ? Job.count({ where: { vtcId: primaryVtcId, completedAt: { [Op.gte]: dayStart } } }) : 0,
      primaryVtcId ? Job.sum("distanceKm", { where: { vtcId: primaryVtcId, completedAt: { [Op.gte]: dayStart } } }) : 0,
      primaryVtcId ? Job.sum("income", { where: { vtcId: primaryVtcId, completedAt: { [Op.gte]: dayStart } } }) : 0,
      primaryVtcId ? Fine.sum("amount", { where: { vtcId: primaryVtcId, occurredAt: { [Op.gte]: dayStart } } }) : 0,
    ]);

    const live = liveDrivers.find((driver) => driver.driverId === steamId) ?? null;
    const totals = {
      jobs: Number(jobs || 0),
      distanceKm: Number(distanceKm || 0),
      income: Number(income || 0),
      fines: Number(fines || 0),
      fineAmount: Number(fineAmount || 0),
      netIncome: Number(income || 0) - Number(fineAmount || 0),
    };

    const [firstJob, longestJob, bestIncome, monthlyTrends, gameBreakdown, topDestinations] = await Promise.all([
      Job.findOne({ where: { driverId: steamId }, order: [["completedAt", "ASC"]] }),
      Job.max("distanceKm", { where: { driverId: steamId } }),
      Job.max("income", { where: { driverId: steamId } }),
      sequelize.query(
        `SELECT
           TO_CHAR(DATE_TRUNC('month', completed_at), 'YYYY-MM') AS month,
           COUNT(*)::int AS jobs,
           COALESCE(SUM(distance_km), 0)::float AS "distanceKm",
           COALESCE(SUM(income), 0)::bigint AS income
         FROM jobs
         WHERE driver_id = :driverId
           AND completed_at >= (CURRENT_DATE - INTERVAL '11 months')
         GROUP BY DATE_TRUNC('month', completed_at)
         ORDER BY DATE_TRUNC('month', completed_at) ASC`,
        { replacements: { driverId: steamId }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT game,
                COUNT(*)::int AS jobs,
                COALESCE(SUM(distance_km), 0)::float AS "distanceKm",
                COALESCE(SUM(income), 0)::bigint AS income
         FROM jobs
         WHERE driver_id = :driverId
         GROUP BY game
         ORDER BY game ASC`,
        { replacements: { driverId: steamId }, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT destination_city AS city,
                COUNT(*)::int AS jobs,
                COALESCE(SUM(distance_km), 0)::float AS "distanceKm"
         FROM jobs
         WHERE driver_id = :driverId
           AND destination_city IS NOT NULL
           AND destination_city <> ''
         GROUP BY destination_city
         ORDER BY jobs DESC, "distanceKm" DESC
         LIMIT 10`,
        { replacements: { driverId: steamId }, type: QueryTypes.SELECT },
      ),
    ]);

    return {
      user,
      live,
      memberships,
      progression: progression(totals.jobs, totals.distanceKm),
      totals,
      month: {
        jobs: Number(monthJobs || 0),
        distanceKm: Number(monthDistanceKm || 0),
        income: Number(monthIncome || 0),
        fineAmount: Number(monthFineAmount || 0),
        netIncome: Number(monthIncome || 0) - Number(monthFineAmount || 0),
      },
      career: {
        firstDeliveryAt: firstJob?.getDataValue("completedAt") ?? null,
        longestJobKm: Number(longestJob || 0),
        bestJobIncome: Number(bestIncome || 0),
        averageIncomePerJob: totals.jobs > 0 ? totals.income / totals.jobs : 0,
        bestMonth: (monthlyTrends as any[]).reduce((best: any, row: any) =>
          !best || Number(row.distanceKm || 0) > Number(best.distanceKm || 0) ? row : best, null),
      },
      checklist: {
        account: true,
        steam: Boolean(user.steamId),
        client: Boolean(live || recentActivity.some((event) => ["driver.online", "driver.offline"].includes(String(event.getDataValue("type"))))),
        telemetry: Boolean(live || totals.jobs > 0 || totals.fines > 0),
        firstDelivery: totals.jobs > 0,
        vtc: memberships.length > 0,
      },
      recentActivity,
      primaryVtc: primaryMembership ? (primaryMembership.get("Vtc") ?? primaryMembership.get("vtc")) : null,
      trends: monthlyTrends,
      gameBreakdown,
      topDestinations,
      distanceOnJobKm: totals.distanceKm,
      vtcToday: primaryVtcId ? {
        jobs: Number(todayVtcJobs || 0),
        distanceKm: Number(todayVtcDistance || 0),
        income: Number(todayVtcIncome || 0),
        fineAmount: Number(todayVtcFines || 0),
        netIncome: Number(todayVtcIncome || 0) - Number(todayVtcFines || 0),
      } : null,
    };
  });

  app.get("/api/v1/account/dashboard/export", { preHandler: [requireUser] }, async (request, reply) => {
    const query = z.object({ format: z.enum(["json", "csv"]).default("json") }).parse(request.query);
    const user = request.openhaulUser!;
    const jobs = await Job.findAll({
      where: { driverId: user.steamId },
      order: [["completedAt", "DESC"]],
      limit: 10000,
    });
    const fines = await Fine.findAll({
      where: { driverId: user.steamId },
      order: [["occurredAt", "DESC"]],
      limit: 10000,
    });

    const summary = {
      exportedAt: new Date().toISOString(),
      driver: { steamId: user.steamId, displayName: user.displayName },
      totals: {
        jobs: jobs.length,
        distanceKm: jobs.reduce((sum, job) => sum + Number(job.getDataValue("distanceKm") || 0), 0),
        income: jobs.reduce((sum, job) => sum + Number(job.getDataValue("income") || 0), 0),
        fines: fines.length,
        fineAmount: fines.reduce((sum, fine) => sum + Number(fine.getDataValue("amount") || 0), 0),
      },
      jobs,
      fines,
    };

    if (query.format === "json") {
      reply.header("content-disposition", 'attachment; filename="openhaul-statistics.json"');
      return summary;
    }

    const rows = [
      ["metric", "value"],
      ["jobs", summary.totals.jobs],
      ["distanceKm", summary.totals.distanceKm],
      ["income", summary.totals.income],
      ["fines", summary.totals.fines],
      ["fineAmount", summary.totals.fineAmount],
      ["netIncome", summary.totals.income - summary.totals.fineAmount],
    ];
    reply.type("text/csv; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="openhaul-statistics.csv"');
    return rows.map((row) => row.map((value) => '"' + String(value).replaceAll('"', '""') + '"').join(",")).join("\n");
  });
}
