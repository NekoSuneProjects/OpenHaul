import type { FastifyInstance } from "fastify";
import { Op } from "sequelize";
import { getLiveDrivers } from "./live.js";
import { PlatformRecord } from "./db.js";

type ExternalStaff = { driverId: string; role?: string; source?: string };

let tmpStaffCache: { expiresAt: number; value: ExternalStaff[] } | null = null;

async function truckersMpStaff(): Promise<ExternalStaff[]> {
  const url = process.env.TRUCKERSMP_STAFF_FEED_URL?.trim();
  if (!url) return [];
  if (tmpStaffCache && tmpStaffCache.expiresAt > Date.now()) return tmpStaffCache.value;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { accept: "application/json", "user-agent": "OpenHaul/1.0" },
      cache: "no-store",
    });
    if (!response.ok) return tmpStaffCache?.value ?? [];
    const payload = await response.json() as any;
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.staff) ? payload.staff : [];
    const value = rows.map((row: any) => ({
      driverId: String(row.driverId ?? row.steamId ?? row.steamID64 ?? ""),
      role: String(row.role ?? row.rank ?? "TruckersMP Staff"),
      source: "truckersmp",
    })).filter((row: ExternalStaff) => row.driverId);
    tmpStaffCache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  } catch {
    return tmpStaffCache?.value ?? [];
  }
}

function trafficClusters(drivers: Awaited<ReturnType<typeof getLiveDrivers>>) {
  const slow = drivers.filter((d) => d.speedKph <= 25);
  const used = new Set<string>();
  const clusters: any[] = [];
  const radius = Number(process.env.OPENHAUL_TRAFFIC_CLUSTER_RADIUS ?? 2500);

  for (const driver of slow) {
    if (used.has(driver.driverId)) continue;
    const group = slow.filter((other) =>
      other.game === driver.game &&
      Math.hypot(other.x - driver.x, other.z - driver.z) <= radius
    );
    if (group.length < 3) continue;
    group.forEach((item) => used.add(item.driverId));
    const avgSpeed = group.reduce((sum, item) => sum + item.speedKph, 0) / group.length;
    clusters.push({
      id: driver.game + "-" + Math.round(driver.x) + "-" + Math.round(driver.z),
      game: driver.game,
      x: group.reduce((sum, item) => sum + item.x, 0) / group.length,
      z: group.reduce((sum, item) => sum + item.z, 0) / group.length,
      drivers: group.length,
      averageSpeedKph: avgSpeed,
      severity: group.length >= 8 || avgSpeed < 8 ? "high" : group.length >= 5 ? "medium" : "low",
      server: driver.server ?? null,
    });
  }
  return clusters.sort((a,b) => b.drivers - a.drivers);
}

export async function registerMapIntelligenceRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/map-intelligence", async (_request, reply) => {
    const [drivers, staffRecords, tmpStaff, missions] = await Promise.all([
      getLiveDrivers(),
      PlatformRecord.findAll({
        where: { scopeType: "global", scopeId: "public", category: "staff", status: "active" },
        limit: 500,
      }),
      truckersMpStaff(),
      PlatformRecord.findAll({
        where: { scopeType: "global", scopeId: "public", category: "special-cargo", status: "active" },
        order: [["updatedAt", "DESC"]],
        limit: 100,
      }),
    ]);

    const openHaulStaff = staffRecords.map((record: any) => ({
      driverId: String(record.getDataValue("key")),
      role: String((record.getDataValue("data") as any)?.role ?? "OpenHaul Staff"),
      source: "openhaul",
    }));

    reply.header("cache-control", "public, max-age=3");
    return {
      generatedAt: new Date().toISOString(),
      traffic: trafficClusters(drivers),
      staff: [...openHaulStaff, ...tmpStaff],
      specialCargo: missions.map((record: any) => ({
        id: record.id,
        key: record.getDataValue("key"),
        status: record.getDataValue("status"),
        ...((record.getDataValue("data") ?? {}) as object),
      })),
      truckersMpStaffSourceConfigured: Boolean(process.env.TRUCKERSMP_STAFF_FEED_URL),
    };
  });
}
