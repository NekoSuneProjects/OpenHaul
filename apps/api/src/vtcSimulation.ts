import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Op } from "sequelize";
import { z } from "zod";
import { Fine, Job, PlatformRecord, User, Vtc, VtcMember } from "./db.js";
import { requireUser } from "./accountSession.js";
import { recordVtcActivity } from "./vtcOperations.js";

async function managerMembership(request: FastifyRequest, reply: FastifyReply) {
  await requireUser(request, reply);
  if (reply.sent) return null;
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const member = await VtcMember.findOne({
    where: { vtcId: id, userId: request.openhaulUser!.id, status: "active" },
  });
  if (!member || !["owner", "admin", "staff"].includes(String(member.getDataValue("role")))) {
    reply.code(403).send({ error: "vtc_manager_required" });
    return null;
  }
  return member;
}

async function memberForUser(vtcId: number, userId: number) {
  return VtcMember.findOne({ where: { vtcId, userId, status: "active" } });
}

function recordData(record: any) {
  return (record?.getDataValue?.("data") ?? record?.data ?? {}) as Record<string, any>;
}

async function category(vtcId: number, name: string) {
  return PlatformRecord.findAll({
    where: {
      scopeType: "vtc",
      scopeId: String(vtcId),
      category: name,
      status: { [Op.ne]: "deleted" },
    },
    order: [["updatedAt", "DESC"]],
    limit: 500,
  });
}

export async function registerVtcSimulationRoutes(app: FastifyInstance) {
  app.get("/api/v1/account/vtcs/:id/simulation", { preHandler: [managerMembership] }, async (request, reply) => {
    if (reply.sent) return;
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const vtc = await Vtc.findByPk(id);
    if (!vtc) return reply.code(404).send({ error: "vtc_not_found" });

    const [
      depots,
      fleet,
      contracts,
      dispatch,
      certifications,
      training,
      shifts,
      goals,
      seasons,
      convoys,
      events,
      recruitment,
      history,
      policies,
      roles,
      permissions,
    ] = await Promise.all([
      category(id, "depots"),
      category(id, "fleet"),
      category(id, "contracts"),
      category(id, "dispatch"),
      category(id, "certifications"),
      category(id, "training"),
      category(id, "shifts"),
      category(id, "goals"),
      category(id, "seasons"),
      category(id, "convoys"),
      category(id, "events"),
      category(id, "recruitment"),
      category(id, "history"),
      category(id, "policies"),
      category(id, "roles"),
      category(id, "permissions"),
    ]);

    const contractProgress = await Promise.all(contracts.map(async (record: any) => {
      const data = recordData(record);
      const createdAt = record.getDataValue("createdAt");
      const where: any = {
        vtcId: id,
        approvalStatus: "approved",
        completedAt: { [Op.gte]: createdAt },
      };
      if (data.cargo) where.cargo = { [Op.iLike]: "%" + String(data.cargo) + "%" };
      const [jobs, distanceKm, income] = await Promise.all([
        Job.count({ where }),
        Job.sum("distanceKm", { where }),
        Job.sum("profit", { where }),
      ]);
      const target = Number(data.target ?? data.targetDistanceKm ?? data.targetJobs ?? 0);
      const metric = String(data.metric ?? (data.targetJobs ? "jobs" : "distance"));
      const value = metric === "jobs" ? jobs : metric === "income" ? Number(income || 0) : Number(distanceKm || 0);
      return { ...record.toJSON(), progress: { metric, value, target, complete: target > 0 && value >= target } };
    }));

    const goalProgress = await Promise.all(goals.map(async (record: any) => {
      const data = recordData(record);
      const createdAt = record.getDataValue("createdAt");
      const where = { vtcId: id, approvalStatus: "approved", completedAt: { [Op.gte]: createdAt } };
      const [jobs, distanceKm, tonnes] = await Promise.all([
        Job.count({ where }),
        Job.sum("distanceKm", { where }),
        Job.sum("cargoMassKg", { where }),
      ]);
      const metric = String(data.metric ?? "distance");
      const target = Number(data.target ?? 0);
      const value = metric === "jobs" ? jobs : metric === "tonnes" ? Number(tonnes || 0) / 1000 : Number(distanceKm || 0);
      return { ...record.toJSON(), progress: { metric, value, target, complete: target > 0 && value >= target } };
    }));

    const fleetStatus = fleet.map((record: any) => {
      const data = recordData(record);
      const mileage = Number(data.mileageKm ?? 0);
      const lastService = Number(data.lastServiceKm ?? 0);
      const interval = Number(data.serviceIntervalKm ?? 30000);
      const sinceService = Math.max(0, mileage - lastService);
      return {
        ...record.toJSON(),
        maintenance: {
          mileageKm: mileage,
          sinceServiceKm: sinceService,
          serviceIntervalKm: interval,
          serviceDue: sinceService >= interval,
          remainingKm: Math.max(0, interval - sinceService),
          condition: Math.max(0, Math.min(100, Number(data.condition ?? 100))),
        },
      };
    });

    const activeMembers = await VtcMember.findAll({
      where: { vtcId: id, status: "active" },
      include: [{ model: User, attributes: ["steamId", "displayName"] }],
    });
    const reputation = await Promise.all(activeMembers.map(async (member: any) => {
      const user = member.get("User") as any;
      const steamId = String(user?.steamId ?? "");
      const [jobs, distance, fines, cleanJobs] = await Promise.all([
        Job.count({ where: { vtcId: id, driverId: steamId, approvalStatus: "approved" } }),
        Job.sum("distanceKm", { where: { vtcId: id, driverId: steamId, approvalStatus: "approved" } }),
        Fine.count({ where: { vtcId: id, driverId: steamId } }),
        Job.count({
          where: {
            vtcId: id,
            driverId: steamId,
            approvalStatus: "approved",
            late: false,
            cargoDamagePercent: { [Op.lte]: 1 },
          },
        }),
      ]);
      const safety = Math.max(0, 100 - fines * 3);
      const reliability = jobs ? Math.round((cleanJobs / jobs) * 100) : 0;
      const contribution = Math.min(100, Math.round(Number(distance || 0) / 1000));
      return {
        memberId: member.id,
        steamId,
        displayName: user?.displayName ?? steamId,
        jobs,
        distanceKm: Number(distance || 0),
        fines,
        safety,
        reliability,
        contribution,
        score: Math.round(safety * 0.4 + reliability * 0.4 + contribution * 0.2),
      };
    }));

    return {
      vtc: {
        id: vtc.id,
        name: vtc.name,
        slug: vtc.slug,
        operatingMode: vtc.getDataValue("operatingMode"),
        manualJobPolicy: vtc.getDataValue("manualJobPolicy"),
      },
      depots,
      fleet: fleetStatus,
      contracts: contractProgress,
      dispatch,
      certifications,
      training,
      shifts,
      goals: goalProgress,
      seasons,
      convoys,
      events,
      recruitment,
      history,
      policies,
      roles,
      permissions,
      reputation,
    };
  });

  app.post("/api/v1/account/vtcs/:id/shifts/start", { preHandler: [requireUser] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const membership = await memberForUser(id, request.openhaulUser!.id);
    if (!membership) return reply.code(403).send({ error: "not_member_of_vtc" });

    const existing = await PlatformRecord.findOne({
      where: {
        scopeType: "vtc",
        scopeId: String(id),
        category: "shifts",
        status: "active",
        data: { driverSteamId: request.openhaulUser!.steamId },
      },
    }).catch(() => null);
    if (existing) return reply.code(409).send({ error: "shift_already_active" });

    const record = await PlatformRecord.create({
      scopeType: "vtc",
      scopeId: String(id),
      category: "shifts",
      key: "shift_" + request.openhaulUser!.steamId + "_" + Date.now(),
      status: "active",
      data: {
        driverSteamId: request.openhaulUser!.steamId,
        driverName: request.openhaulUser!.displayName,
        startedAt: new Date().toISOString(),
      },
      createdByUserId: request.openhaulUser!.id,
    });

    await recordVtcActivity({
      vtcId: id,
      driverId: request.openhaulUser!.steamId,
      actorUserId: request.openhaulUser!.id,
      type: "shift.started",
      title: request.openhaulUser!.displayName + " started a shift",
    });
    return reply.code(201).send({ shift: record });
  });

  app.post("/api/v1/account/vtcs/:id/shifts/end", { preHandler: [requireUser] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const membership = await memberForUser(id, request.openhaulUser!.id);
    if (!membership) return reply.code(403).send({ error: "not_member_of_vtc" });

    const shifts = await category(id, "shifts");
    const shift = shifts.find((item: any) => item.getDataValue("status") === "active" && recordData(item).driverSteamId === request.openhaulUser!.steamId);
    if (!shift) return reply.code(404).send({ error: "active_shift_not_found" });
    const data = recordData(shift);
    const start = new Date(String(data.startedAt ?? shift.getDataValue("createdAt")));

    const [jobs, distanceKm, revenue, expenses, fines] = await Promise.all([
      Job.count({ where: { vtcId: id, driverId: request.openhaulUser!.steamId, completedAt: { [Op.gte]: start }, approvalStatus: "approved" } }),
      Job.sum("distanceKm", { where: { vtcId: id, driverId: request.openhaulUser!.steamId, completedAt: { [Op.gte]: start }, approvalStatus: "approved" } }),
      Job.sum("income", { where: { vtcId: id, driverId: request.openhaulUser!.steamId, completedAt: { [Op.gte]: start }, approvalStatus: "approved" } }),
      Job.sum("expenses", { where: { vtcId: id, driverId: request.openhaulUser!.steamId, completedAt: { [Op.gte]: start }, approvalStatus: "approved" } }),
      Fine.sum("amount", { where: { vtcId: id, driverId: request.openhaulUser!.steamId, occurredAt: { [Op.gte]: start } } }),
    ]);

    const endedAt = new Date();
    await shift.update({
      status: "completed",
      data: {
        ...data,
        endedAt: endedAt.toISOString(),
        durationMinutes: Math.round((endedAt.getTime() - start.getTime()) / 60000),
        jobs: Number(jobs || 0),
        distanceKm: Number(distanceKm || 0),
        revenue: Number(revenue || 0),
        expenses: Number(expenses || 0),
        fines: Number(fines || 0),
        net: Number(revenue || 0) - Number(expenses || 0) - Number(fines || 0),
      },
    });

    await recordVtcActivity({
      vtcId: id,
      driverId: request.openhaulUser!.steamId,
      actorUserId: request.openhaulUser!.id,
      type: "shift.ended",
      title: request.openhaulUser!.displayName + " ended a shift",
      detail: Number(jobs || 0) + " jobs · " + Math.round(Number(distanceKm || 0)) + " km",
    });

    return { shift };
  });

  app.get("/api/v1/account/vtcs/:id/qualifications", { preHandler: [requireUser] }, async (request, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const membership = await memberForUser(id, request.openhaulUser!.id);
    if (!membership) return reply.code(403).send({ error: "not_member_of_vtc" });

    const jobs = await Job.findAll({
      where: { vtcId: id, driverId: request.openhaulUser!.steamId, approvalStatus: "approved" },
      attributes: ["cargo", "distanceKm", "cargoMassKg", "cargoDamagePercent"],
      limit: 5000,
    });
    const cargoNames = jobs.map((job: any) => String(job.getDataValue("cargo") ?? "").toLowerCase());
    const maxDistance = Math.max(0, ...jobs.map((job: any) => Number(job.getDataValue("distanceKm") || 0)));
    const maxMass = Math.max(0, ...jobs.map((job: any) => Number(job.getDataValue("cargoMassKg") || 0)));
    const cleanJobs = jobs.filter((job: any) => Number(job.getDataValue("cargoDamagePercent") || 0) <= 1).length;

    return {
      certifications: {
        adr: cargoNames.some((name) => /chemical|acid|fuel|gas|danger|adr/.test(name)),
        refrigerated: cargoNames.some((name) => /frozen|food|meat|milk|refriger/.test(name)),
        fragile: cargoNames.some((name) => /glass|fragile|electronics/.test(name)) || cleanJobs >= 20,
        heavyHaul: maxMass >= 40000,
        oversized: cargoNames.some((name) => /oversize|special|transformer|locomotive|helicopter/.test(name)),
        longDistance: maxDistance >= 1500,
      },
      evidence: { jobs: jobs.length, maxDistanceKm: maxDistance, maxMassKg: maxMass, cleanJobs },
    };
  });
}
