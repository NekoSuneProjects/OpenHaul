import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Fine, Job, TwitchAccount, User, Vtc, VtcActivityEvent, VtcMember, VtcModerationAction } from "./db.js";
import { getLiveDrivers } from "./live.js";

export async function registerPublicDriverRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/drivers/:steamId", async (request, reply) => {
    const { steamId } = z.object({
      steamId: z.string().regex(/^\d{15,20}$/),
    }).parse(request.params);

    const user = await User.findOne({
      where: { steamId },
      attributes: [
        "id",
        "steamId",
        "displayName",
        "avatarUrl",
        "profileUrl",
        "ownsEts2",
        "ownsAts",
        "ownershipVisibility",
        "createdAt",
      ],
    });

    if (!user) return reply.code(404).send({ error: "driver_not_found" });

    const [memberships, jobs, fines, distanceKm, income, fineAmount, liveDrivers, twitch, moderation, nameChanges] = await Promise.all([
      VtcMember.findAll({
        where: { userId: user.id, status: "active" },
        include: [{ model: Vtc, attributes: ["id", "name", "slug", "tag"] }],
      }),
      Job.findAll({
        where: { driverId: steamId },
        order: [["completedAt", "DESC"]],
        limit: 25,
      }),
      Fine.findAll({
        where: { driverId: steamId },
        order: [["occurredAt", "DESC"]],
        limit: 25,
      }),
      Job.sum("distanceKm", { where: { driverId: steamId } }),
      Job.sum("income", { where: { driverId: steamId } }),
      Fine.sum("amount", { where: { driverId: steamId } }),
      getLiveDrivers(),
      TwitchAccount.findOne({ where: { userId: user.id } }),
      VtcModerationAction.findAll({
        where: { userId: user.id },
        include: [{ model: Vtc, attributes: ["id", "name", "tag"] }],
        order: [["id", "DESC"]],
        limit: 100,
      }),
      VtcActivityEvent.findAll({
        where: { driverId: steamId, type: "profile.name_changed" },
        include: [{ model: Vtc, attributes: ["id", "name", "tag"] }],
        order: [["id", "DESC"]],
        limit: 50,
      }),
    ]);

    const live = liveDrivers.find((driver) => driver.driverId === steamId) ?? null;

    return {
      user,
      memberships,
      stats: {
        jobs: await Job.count({ where: { driverId: steamId } }),
        distanceKm: Number(distanceKm || 0),
        income: Number(income || 0),
        fineAmount: Number(fineAmount || 0),
        netIncome: Number(income || 0) - Number(fineAmount || 0),
        fines: await Fine.count({ where: { driverId: steamId } }),
      },
      live,
      twitch,
      moderation,
      nameChanges,
      recentJobs: jobs,
      recentFines: fines,
    };
  });
}
