import type { FastifyInstance } from "fastify";
import { Op, QueryTypes } from "sequelize";
import { Fine, Job, PlatformRecord, VtcMember, sequelize } from "./db.js";
import { requireUser } from "./accountSession.js";

type Challenge = {
  id: string;
  title: string;
  period: "daily" | "weekly" | "monthly" | "seasonal" | "career";
  metric: "jobs" | "distance" | "cleanJobs" | "income";
  target: number;
};

const challengeDefinitions: Challenge[] = [
  { id: "daily-3-jobs", title: "Daily Hauler", period: "daily", metric: "jobs", target: 3 },
  { id: "weekly-2500km", title: "Weekly Road Warrior", period: "weekly", metric: "distance", target: 2500 },
  { id: "monthly-25-jobs", title: "Monthly Professional", period: "monthly", metric: "jobs", target: 25 },
  { id: "seasonal-25000km", title: "Season Road Master", period: "seasonal", metric: "distance", target: 25000 },
  { id: "career-100-jobs", title: "Century Club", period: "career", metric: "jobs", target: 100 },
  { id: "career-100000km", title: "Long Haul Legend", period: "career", metric: "distance", target: 100000 },
];

function periodStart(period: Challenge["period"]) {
  const now = new Date();
  if (period === "daily") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "weekly") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = start.getUTCDay() || 7;
    start.setUTCDate(start.getUTCDate() - day + 1);
    return start;
  }
  if (period === "monthly") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (period === "seasonal") {
    const quarterMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    return new Date(Date.UTC(now.getUTCFullYear(), quarterMonth, 1));
  }
  return new Date(0);
}

async function metricValue(driverId: string, definition: Challenge) {
  const start = periodStart(definition.period);
  const where: any = {
    driverId,
    approvalStatus: "approved",
    completedAt: { [Op.gte]: start },
  };

  if (definition.metric === "jobs") return Job.count({ where });
  if (definition.metric === "distance") return Number(await Job.sum("distanceKm", { where }) || 0);
  if (definition.metric === "income") return Number(await Job.sum("profit", { where }) || 0);
  if (definition.metric === "cleanJobs") {
    return Job.count({
      where: {
        ...where,
        late: false,
        cargoDamagePercent: { [Op.lte]: 1 },
        truckDamagePercent: { [Op.lte]: 2 },
      },
    });
  }
  return 0;
}

export async function registerProgressionRoutes(app: FastifyInstance) {
  app.get("/api/v1/account/progression", { preHandler: [requireUser] }, async (request) => {
    const user = request.openhaulUser!;
    const [jobs, distanceKm, income, fines, cleanJobs, memberships] = await Promise.all([
      Job.count({ where: { driverId: user.steamId, approvalStatus: "approved" } }),
      Job.sum("distanceKm", { where: { driverId: user.steamId, approvalStatus: "approved" } }),
      Job.sum("profit", { where: { driverId: user.steamId, approvalStatus: "approved" } }),
      Fine.count({ where: { driverId: user.steamId } }),
      Job.count({
        where: {
          driverId: user.steamId,
          approvalStatus: "approved",
          late: false,
          cargoDamagePercent: { [Op.lte]: 1 },
          truckDamagePercent: { [Op.lte]: 2 },
        },
      }),
      VtcMember.findAll({ where: { userId: user.id, status: "active" } }),
    ]);

    const challengeProgress = await Promise.all(challengeDefinitions.map(async (definition) => {
      const value = await metricValue(user.steamId, definition);
      return {
        ...definition,
        value,
        progress: Math.min(1, Number(value) / definition.target),
        completed: Number(value) >= definition.target,
      };
    }));

    const achievementDefinitions = [
      { id: "first-job", title: "First Delivery", unlocked: jobs >= 1 },
      { id: "ten-jobs", title: "Getting Established", unlocked: jobs >= 10 },
      { id: "hundred-jobs", title: "Veteran Driver", unlocked: jobs >= 100 },
      { id: "10k-km", title: "10,000 km Club", unlocked: Number(distanceKm || 0) >= 10000 },
      { id: "100k-km", title: "100,000 km Club", unlocked: Number(distanceKm || 0) >= 100000 },
      { id: "clean-25", title: "Clean Operator", unlocked: cleanJobs >= 25 },
      { id: "vtc-member", title: "Company Driver", unlocked: memberships.length > 0 },
    ];

    const unlocked = achievementDefinitions.filter((item) => item.unlocked);
    for (const achievement of unlocked) {
      await PlatformRecord.findOrCreate({
        where: {
          scopeType: "user",
          scopeId: String(user.id),
          category: "achievements",
          key: achievement.id,
        },
        defaults: {
          scopeType: "user",
          scopeId: String(user.id),
          category: "achievements",
          key: achievement.id,
          status: "unlocked",
          data: { title: achievement.title, unlockedAt: new Date().toISOString() },
          createdByUserId: user.id,
        },
      });
    }

    const safety = Math.max(0, 100 - Math.min(60, fines * 2));
    const reliability = jobs > 0 ? Math.round((cleanJobs / jobs) * 100) : 0;
    const activity = Math.min(100, Math.round(Number(distanceKm || 0) / 1000));
    const contribution = Math.min(100, memberships.length * 25 + Math.round(jobs / 5));
    const reputation = Math.round((safety * 0.35) + (reliability * 0.35) + (activity * 0.15) + (contribution * 0.15));

    const history = await sequelize.query(
      `SELECT TO_CHAR(DATE_TRUNC('month', completed_at), 'YYYY-MM') AS month,
              COUNT(*)::int AS jobs,
              COALESCE(SUM(distance_km), 0)::float AS "distanceKm",
              COALESCE(SUM(profit), 0)::bigint AS profit
       FROM jobs
       WHERE driver_id = :driverId
         AND approval_status = 'approved'
       GROUP BY DATE_TRUNC('month', completed_at)
       ORDER BY DATE_TRUNC('month', completed_at) DESC
       LIMIT 12`,
      { replacements: { driverId: user.steamId }, type: QueryTypes.SELECT },
    );

    return {
      challenges: challengeProgress,
      achievements: achievementDefinitions,
      awards: unlocked.map((item) => ({ id: item.id, title: item.title })),
      reputation: { score: reputation, safety, reliability, activity, contribution },
      career: {
        jobs,
        distanceKm: Number(distanceKm || 0),
        profit: Number(income || 0),
        fines,
        cleanJobs,
      },
      history,
    };
  });
}
