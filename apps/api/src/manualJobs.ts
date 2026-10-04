import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { Job, Vtc, VtcLedgerEntry, VtcMember } from "./db.js";
import { requireUser } from "./accountSession.js";
import { recordVtcActivity } from "./vtcOperations.js";

const manualJobSchema = z.object({
  vtcId: z.number().int().positive(),
  game: z.enum(["ets2", "ats"]),
  mode: z.enum(["casual", "standard", "simulation"]).default("standard"),
  cargo: z.string().min(1).max(160),
  cargoMassKg: z.number().nonnegative().nullable().optional(),
  sourceCity: z.string().min(1).max(120),
  sourceCompany: z.string().max(160).nullable().optional(),
  sourceCountry: z.string().max(120).nullable().optional(),
  destinationCity: z.string().min(1).max(120),
  destinationCompany: z.string().max(160).nullable().optional(),
  destinationCountry: z.string().max(120).nullable().optional(),
  distanceKm: z.number().nonnegative(),
  income: z.number().int().nonnegative(),
  expenses: z.number().int().nonnegative().default(0),
  evidenceUrl: z.string().url(),
  completedAt: z.coerce.date().default(() => new Date()),
});

async function requireManager(request: FastifyRequest, reply: FastifyReply) {
  await requireUser(request, reply);
  if (reply.sent) return;
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const member = await VtcMember.findOne({
    where: { vtcId: id, userId: request.openhaulUser!.id, status: "active" },
  });
  if (!member || !["owner", "admin", "staff"].includes(String(member.getDataValue("role")))) {
    return reply.code(403).send({ error: "vtc_manager_required" });
  }
}

export async function registerManualJobRoutes(app: FastifyInstance) {
  app.post("/api/v1/account/manual-jobs", { preHandler: [requireUser] }, async (request, reply) => {
    const body = manualJobSchema.parse(request.body);
    const membership = await VtcMember.findOne({
      where: { vtcId: body.vtcId, userId: request.openhaulUser!.id, status: "active" },
    });
    if (!membership) return reply.code(403).send({ error: "not_member_of_vtc" });

    const vtc = await Vtc.findByPk(body.vtcId);
    if (!vtc) return reply.code(404).send({ error: "vtc_not_found" });
    const policy = String(vtc.getDataValue("manualJobPolicy") ?? "approval");
    if (policy === "disabled") return reply.code(409).send({ error: "manual_jobs_disabled" });

    const approvalStatus = policy === "full" ? "approved" : "pending";
    const job = await Job.create({
      ...body,
      driverId: request.openhaulUser!.steamId,
      submissionType: "manual",
      approvalStatus,
      status: "completed",
      profit: body.income - body.expenses,
    });

    await recordVtcActivity({
      vtcId: body.vtcId,
      driverId: request.openhaulUser!.steamId,
      actorUserId: request.openhaulUser!.id,
      type: approvalStatus === "approved" ? "job.manual_approved" : "job.manual_submitted",
      title: request.openhaulUser!.displayName + " submitted a manual delivery",
      detail: body.cargo + " · " + body.sourceCity + " → " + body.destinationCity,
      amount: body.income - body.expenses,
      currency: body.game === "ats" ? "USD" : "EUR",
      metadata: { jobId: job.id, evidenceUrl: body.evidenceUrl, approvalStatus },
      occurredAt: body.completedAt,
    });

    if (approvalStatus === "approved") {
      await VtcLedgerEntry.create({
        vtcId: body.vtcId,
        createdByUserId: request.openhaulUser!.id,
        type: "manual_job_income",
        description: request.openhaulUser!.displayName + " approved manual delivery",
        amount: body.income - body.expenses,
        currency: body.game === "ats" ? "USD" : "EUR",
      });
    }

    return reply.code(201).send({ job, approvalStatus });
  });

  app.get("/api/v1/account/vtcs/:id/manual-jobs", { preHandler: [requireManager] }, async (request) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return {
      jobs: await Job.findAll({
        where: { vtcId: id, submissionType: "manual" },
        order: [["id", "DESC"]],
        limit: 250,
      }),
    };
  });

  app.patch("/api/v1/account/vtcs/:id/manual-jobs/:jobId", { preHandler: [requireManager] }, async (request, reply) => {
    const params = z.object({
      id: z.coerce.number().int().positive(),
      jobId: z.coerce.number().int().positive(),
    }).parse(request.params);
    const body = z.object({ approvalStatus: z.enum(["approved", "rejected"]) }).parse(request.body);
    const job = await Job.findOne({
      where: { id: params.jobId, vtcId: params.id, submissionType: "manual" },
    });
    if (!job) return reply.code(404).send({ error: "manual_job_not_found" });

    const previous = String(job.getDataValue("approvalStatus"));
    await job.update({ approvalStatus: body.approvalStatus });

    if (body.approvalStatus === "approved" && previous !== "approved") {
      const amount = Number(job.getDataValue("income") || 0) - Number(job.getDataValue("expenses") || 0);
      await VtcLedgerEntry.create({
        vtcId: params.id,
        createdByUserId: request.openhaulUser!.id,
        type: "manual_job_income",
        description: "Approved manual delivery #" + job.id,
        amount,
        currency: job.getDataValue("game") === "ats" ? "USD" : "EUR",
      });
    }

    await recordVtcActivity({
      vtcId: params.id,
      driverId: String(job.getDataValue("driverId")),
      actorUserId: request.openhaulUser!.id,
      type: "job.manual_" + body.approvalStatus,
      title: "Manual delivery #" + job.id + " " + body.approvalStatus,
      metadata: { jobId: job.id, previousStatus: previous },
    });

    return { job };
  });
}
