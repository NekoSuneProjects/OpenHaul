import type { FastifyInstance } from "fastify";
import { Op } from "sequelize";
import { z } from "zod";
import { getClientPresences, getLiveDrivers } from "./live.js";
import { PlatformRecord, TelemetryEvent } from "./db.js";

type ExternalStaff = { driverId: string; role?: string; source?: string };

type ExternalDriver = {
  driverId: string;
  username: string;
  game: "ets2" | "ats";
  x: number;
  y?: number;
  z: number;
  heading?: number;
  speedKph?: number;
  server?: string | null;
  source: "truckersmp-provider" | "openhaul-client";
  trackerServerId?: number;
  trackerMapId?: number;
  mpId?: string;
  playerId?: string;
  vtcId?: number | null;
  updatedAt?: string;
};

let tmpLiveCache: { expiresAt: number; value: ExternalDriver[] } | null = null;

type TrackerServer = {
  id: number;
  map: number;
  name: string;
  game: string;
  status: boolean;
  players: number;
};

let trackerServerCache: { expiresAt: number; value: TrackerServer[] } | null = null;
const trackerAreaCache = new Map<string, { expiresAt: number; value: ExternalDriver[] }>();

async function truckersMpTrackerServers(): Promise<TrackerServer[]> {
  if (trackerServerCache && trackerServerCache.expiresAt > Date.now()) return trackerServerCache.value;

  try {
    const response = await fetch("https://truckersmp.krashnz.com/servers", {
      signal: AbortSignal.timeout(5000),
      headers: {
        accept: "application/json",
        "user-agent": "OpenHaul/1.0 (+https://github.com/NekoSuneProjects/OpenHaul)",
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("TruckersMP server map HTTP " + response.status);

    const payload = await response.json() as any;
    const value = (Array.isArray(payload?.servers) ? payload.servers : []).flatMap((server: any) => {
      const id = Number(server.id);
      const map = Number(server.map);
      if (!Number.isFinite(id) || !Number.isFinite(map)) return [];
      return [{
        id,
        map,
        name: String(server.name ?? "TruckersMP"),
        game: String(server.game ?? "").toLowerCase(),
        status: Boolean(server.status),
        players: Number(server.players ?? 0),
      }];
    });

    trackerServerCache = { value, expiresAt: Date.now() + 15_000 };
    return value;
  } catch {
    return trackerServerCache?.value ?? [];
  }
}

async function truckersMpViewportDrivers(
  game: "ets2" | "ats",
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Promise<ExternalDriver[]> {
  const rounded = [x1, y1, x2, y2].map((value) => Math.round(value / 250) * 250);
  const key = [game, ...rounded].join(":");
  const cached = trackerAreaCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const servers = (await truckersMpTrackerServers()).filter((server) =>
    server.status &&
    (game === "ats"
      ? server.game === "ats"
      : server.game === "ets2" || server.game === "promods")
  );

  const areas = await Promise.allSettled(servers.map(async (server) => {
    const params = new URLSearchParams({
      x1: String(Math.round(x1)),
      y1: String(Math.round(y1)),
      x2: String(Math.round(x2)),
      y2: String(Math.round(y2)),
      server: String(server.map),
    });
    const response = await fetch("https://tracker.ets2map.com/v3/area?" + params.toString(), {
      signal: AbortSignal.timeout(6000),
      headers: {
        accept: "application/json",
        "user-agent": "OpenHaul/1.0 (+https://github.com/NekoSuneProjects/OpenHaul)",
        referer: "https://map.truckersmp.com/",
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("TruckersMP tracker HTTP " + response.status);

    return parseTruckersMpRows(await response.json(), server.map).map((driver) => ({
      ...driver,
      game,
      server: server.name,
      trackerServerId: server.id,
      trackerMapId: server.map,
    }));
  }));

  const deduped = new Map<string, ExternalDriver>();
  for (const result of areas) {
    if (result.status !== "fulfilled") continue;
    for (const driver of result.value) {
      const key = driver.driverId + ":" + (driver.server ?? "");
      deduped.set(key, driver);
    }
  }

  const value = [...deduped.values()];
  trackerAreaCache.set(key, { value, expiresAt: Date.now() + 3500 });

  if (trackerAreaCache.size > 80) {
    const oldest = [...trackerAreaCache.entries()]
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
      .slice(0, trackerAreaCache.size - 60);
    for (const [oldKey] of oldest) trackerAreaCache.delete(oldKey);
  }

  return value;
}

const DEFAULT_TMP_TRACKER_AREAS = [
  { x1: 6455, y1: 22710, x2: 8655, y2: 20510, server: 2 },
  { x1: -3517, y1: 27916, x2: 18627, y2: 15304, server: 2 },
];

function normalizeTrackerHeading(value: number) {
  if (!Number.isFinite(value)) return 0;
  const turns = value / (Math.PI * 2);
  return ((turns % 1) + 1) % 1;
}

function parseTruckersMpRows(payload: any, server: number): ExternalDriver[] {
  const rows = Array.isArray(payload?.Data)
    ? payload.Data
    : Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.drivers)
        ? payload.drivers
        : Array.isArray(payload?.players)
          ? payload.players
          : [];

  return rows.flatMap((row: any) => {
    // tracker.ets2map.com uses X/Y where Y is the SCS map Z axis.
    if (row?.Name !== undefined && row?.X !== undefined && row?.Y !== undefined) {
      const x = Number(row.X);
      const z = Number(row.Y);
      const mpId = String(row.MpId ?? "");
      const playerId = String(row.PlayerId ?? "");
      if (!Number.isFinite(x) || !Number.isFinite(z) || (!mpId && !playerId)) return [];

      return [{
        driverId: "tmp:" + (mpId || playerId),
        username: String(row.Name ?? mpId ?? playerId),
        game: "ets2" as const,
        x,
        y: 0,
        z,
        heading: normalizeTrackerHeading(Number(row.Heading ?? 0)),
        speedKph: Number(row.Speed ?? row.SpeedKph ?? 0),
        server: "TruckersMP #" + String(row.ServerId ?? server),
        source: "truckersmp-provider" as const,
        mpId: mpId || undefined,
        playerId: playerId || undefined,
        vtcId: Number.isFinite(Number(row.VtcId)) ? Number(row.VtcId) : null,
        updatedAt: row.Time ? new Date(Number(row.Time) * 1000).toISOString() : new Date().toISOString(),
      }];
    }

    const game = String(row.game ?? row.gameId ?? "ets2").toLowerCase();
    const normalizedGame = game.includes("ats") ? "ats" : "ets2";
    const driverId = String(row.driverId ?? row.steamId ?? row.steamID64 ?? row.id ?? "");
    const x = Number(row.x ?? row.position?.x);
    const z = Number(row.z ?? row.position?.z);
    if (!driverId || !Number.isFinite(x) || !Number.isFinite(z)) return [];

    return [{
      driverId,
      username: String(row.username ?? row.name ?? driverId),
      game: normalizedGame as "ets2" | "ats",
      x,
      y: Number(row.y ?? row.position?.y ?? 0),
      z,
      heading: Number(row.heading ?? row.position?.heading ?? 0),
      speedKph: Number(row.speedKph ?? row.speed ?? 0),
      server: row.server ? String(row.server) : "TruckersMP",
      source: "truckersmp-provider" as const,
      updatedAt: new Date().toISOString(),
    }];
  });
}

async function truckersMpWideDrivers(): Promise<ExternalDriver[]> {
  if (tmpLiveCache && tmpLiveCache.expiresAt > Date.now()) return tmpLiveCache.value;

  const customUrl = process.env.TRUCKERSMP_LIVE_PROVIDER_URL?.trim();

  try {
    let value: ExternalDriver[] = [];

    if (customUrl) {
      const response = await fetch(customUrl, {
        signal: AbortSignal.timeout(6000),
        headers: { accept: "application/json", "user-agent": "OpenHaul/1.0" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("TruckersMP provider HTTP " + response.status);
      value = parseTruckersMpRows(await response.json(), 0);
    } else {
      const areas = await Promise.all(DEFAULT_TMP_TRACKER_AREAS.map(async (area) => {
        const params = new URLSearchParams({
          x1: String(area.x1),
          y1: String(area.y1),
          x2: String(area.x2),
          y2: String(area.y2),
          server: String(area.server),
        });
        const response = await fetch("https://tracker.ets2map.com/v3/area?" + params.toString(), {
          signal: AbortSignal.timeout(6000),
          headers: {
            accept: "application/json",
            "user-agent": "OpenHaul/1.0 (+https://github.com/NekoSuneProjects/OpenHaul)",
            referer: "https://map.truckersmp.com/",
          },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("TruckersMP tracker HTTP " + response.status);
        return parseTruckersMpRows(await response.json(), area.server);
      }));
      value = areas.flat();
    }

    const deduped = new Map<string, ExternalDriver>();
    for (const driver of value) deduped.set(driver.driverId, driver);

    tmpLiveCache = { value: [...deduped.values()], expiresAt: Date.now() + 4000 };
    return tmpLiveCache.value;
  } catch {
    return tmpLiveCache?.value ?? [];
  }
}


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

function densityTrafficClusters(drivers: ExternalDriver[]) {
  const used = new Set<string>();
  const clusters: any[] = [];
  const radius = Number(process.env.OPENHAUL_TMP_TRAFFIC_RADIUS ?? 650);

  for (const driver of drivers) {
    if (used.has(driver.driverId)) continue;
    const group = drivers.filter((other) =>
      other.game === driver.game &&
      other.server === driver.server &&
      Math.hypot(other.x - driver.x, other.z - driver.z) <= radius
    );

    if (group.length < 6) continue;
    group.forEach((item) => used.add(item.driverId));

    clusters.push({
      id: "tmp-" + driver.game + "-" + Math.round(driver.x) + "-" + Math.round(driver.z),
      game: driver.game,
      x: group.reduce((sum, item) => sum + item.x, 0) / group.length,
      z: group.reduce((sum, item) => sum + item.z, 0) / group.length,
      drivers: group.length,
      averageSpeedKph: null,
      severity: group.length >= 20 ? "high" : group.length >= 10 ? "medium" : "low",
      server: driver.server ?? "TruckersMP",
      source: "truckersmp-density",
    });
  }

  return clusters.sort((a, b) => b.drivers - a.drivers);
}

function trafficClusters(drivers: Array<{ driverId: string; game: "ets2" | "ats"; x: number; z: number; speedKph: number; server?: string | null }>) {
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
  app.get("/api/v1/public/truckersmp/area", async (request, reply) => {
    const query = z.object({
      game: z.enum(["ets2", "ats"]),
      x1: z.coerce.number(),
      y1: z.coerce.number(),
      x2: z.coerce.number(),
      y2: z.coerce.number(),
    }).parse(request.query);

    const width = Math.abs(query.x2 - query.x1);
    const height = Math.abs(query.y2 - query.y1);
    if (width > 500_000 || height > 500_000) {
      return reply.code(400).send({ error: "area_too_large" });
    }

    const [rawDrivers, clientPresences, openHaulDrivers] = await Promise.all([
      truckersMpViewportDrivers(query.game, query.x1, query.y1, query.x2, query.y2),
      getClientPresences(),
      getLiveDrivers(),
    ]);

    const presenceByName = new Map(
      clientPresences.map((presence) => [presence.displayName.trim().toLowerCase(), presence]),
    );
    const liveNames = new Set(openHaulDrivers.map((driver) => driver.username.trim().toLowerCase()));

    const drivers = rawDrivers
      .filter((driver) => !liveNames.has(driver.username.trim().toLowerCase()))
      .map((driver) => {
        const presence = presenceByName.get(driver.username.trim().toLowerCase());
        if (!presence) return driver;
        return {
          ...driver,
          driverId: presence.steamId,
          source: "openhaul-client" as const,
        };
      });

    const servers = await truckersMpTrackerServers();
    const relevantServers = servers.filter((server) =>
      server.status &&
      (query.game === "ats"
        ? server.game === "ats"
        : server.game === "ets2" || server.game === "promods")
    );

    reply.header("cache-control", "public, max-age=2");
    return {
      generatedAt: new Date().toISOString(),
      game: query.game,
      count: drivers.length,
      totalOnline: relevantServers.reduce((sum, server) => sum + server.players, 0),
      openHaulOnline: clientPresences.length,
      drivers,
      traffic: densityTrafficClusters(drivers),
      servers: relevantServers,
    };
  });

  app.get("/api/v1/public/map-intelligence", async (_request, reply) => {
    const [drivers, clientPresences, staffRecords, tmpStaff, missions, tmpWideDriversRaw, convoyRecords, jobEvents] = await Promise.all([
      getLiveDrivers(),
      getClientPresences(),
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
      truckersMpWideDrivers(),
      PlatformRecord.findAll({
        where: { scopeType: "vtc", category: "convoys", status: "active" },
        order: [["updatedAt", "DESC"]],
        limit: 200,
      }),
      TelemetryEvent.findAll({
        where: { type: { [Op.in]: ["job.accepted", "job.started", "job.completed"] } },
        order: [["occurredAt", "DESC"]],
        limit: 300,
      }),
    ]);

    const openHaulStaff = staffRecords.map((record: any) => ({
      driverId: String(record.getDataValue("key")),
      role: String((record.getDataValue("data") as any)?.role ?? "OpenHaul Staff"),
      source: "openhaul",
    }));

    const convoyGroups = convoyRecords.map((record: any) => {
      const data = (record.getDataValue("data") ?? {}) as any;
      const vtcId = Number(record.getDataValue("scopeId"));
      const explicit = Array.isArray(data.driverIds) ? data.driverIds.map(String) : [];
      const members = drivers.filter((driver) =>
        explicit.length ? explicit.includes(driver.driverId) : driver.vtcId === vtcId
      );
      return {
        id: record.id,
        key: record.getDataValue("key"),
        vtcId,
        title: data.title ?? data.name ?? record.getDataValue("key"),
        route: Array.isArray(data.route) ? data.route : Array.isArray(data.waypoints) ? data.waypoints : [],
        members: members.map((driver) => ({
          driverId: driver.driverId,
          username: driver.username,
          game: driver.game,
          x: driver.x,
          y: driver.y ?? 0,
          z: driver.z,
          heading: driver.heading,
        })),
      };
    }).filter((convoy: any) => convoy.members.length > 0 || convoy.route.length > 0);

    const jobMarkers = jobEvents.flatMap((event: any) => {
      const raw = (event.getDataValue("raw") ?? {}) as any;
      const normalized = (event.getDataValue("normalized") ?? {}) as any;
      const game = String(event.getDataValue("game"));
      const driverId = String(event.getDataValue("driverId"));
      const type = String(event.getDataValue("type"));
      const result: any[] = [];

      if (Number.isFinite(Number(raw.sourceX)) && Number.isFinite(Number(raw.sourceZ))) {
        result.push({
          id: String(event.id) + "-origin",
          driverId, game, type: "origin",
          x: Number(raw.sourceX), z: Number(raw.sourceZ),
          city: raw.sourceCity ?? normalized.sourceCity ?? null,
          eventType: type,
        });
      } else if ((type === "job.accepted" || type === "job.started") &&
                 Number.isFinite(Number(normalized.x)) && Number.isFinite(Number(normalized.z))) {
        result.push({
          id: String(event.id) + "-origin",
          driverId, game, type: "origin",
          x: Number(normalized.x), z: Number(normalized.z),
          city: normalized.sourceCity ?? null,
          eventType: type,
        });
      }

      if (Number.isFinite(Number(raw.destinationX)) && Number.isFinite(Number(raw.destinationZ))) {
        result.push({
          id: String(event.id) + "-destination",
          driverId, game, type: "destination",
          x: Number(raw.destinationX), z: Number(raw.destinationZ),
          city: raw.destinationCity ?? normalized.destinationCity ?? null,
          eventType: type,
        });
      }

      return result;
    });

    const presenceByName = new Map(
      clientPresences.map((presence) => [presence.displayName.trim().toLowerCase(), presence]),
    );
    const tmpWideDrivers = tmpWideDriversRaw.map((driver) => {
      const presence = presenceByName.get(driver.username.trim().toLowerCase());
      if (!presence) return driver;
      return {
        ...driver,
        driverId: presence.steamId,
        source: "openhaul-client" as const,
      };
    });

    const localNames = new Set(drivers.map((driver) => driver.username.trim().toLowerCase()));
    const externalOnly = tmpWideDrivers.filter((driver) => !localNames.has(driver.username.trim().toLowerCase()));
    const trafficInput = [
      ...drivers.map((driver) => ({
        driverId: driver.driverId,
        game: driver.game,
        x: driver.x,
        z: driver.z,
        speedKph: driver.speedKph,
        server: driver.server ?? null,
      })),
      ...externalOnly.map((driver) => ({
        driverId: driver.driverId,
        game: driver.game,
        x: driver.x,
        z: driver.z,
        speedKph: driver.speedKph ?? 0,
        server: driver.server ?? null,
      })),
    ];

    reply.header("cache-control", "public, max-age=3");
    return {
      generatedAt: new Date().toISOString(),
      traffic: [
        ...trafficClusters(trafficInput.filter((driver) => !driver.driverId.startsWith("tmp:"))),
        ...densityTrafficClusters(externalOnly),
      ],
      staff: [...openHaulStaff, ...tmpStaff],
      specialCargo: missions.map((record: any) => ({
        id: record.id,
        key: record.getDataValue("key"),
        status: record.getDataValue("status"),
        ...((record.getDataValue("data") ?? {}) as object),
      })),
      externalDrivers: externalOnly,
      counts: {
        openHaul: clientPresences.length,
        openHaulDriving: drivers.length,
        truckersMp: tmpWideDriversRaw.length,
        combined: drivers.length + externalOnly.length,
      },
      convoys: convoyGroups,
      jobMarkers,
      truckersMpStaffSourceConfigured: Boolean(process.env.TRUCKERSMP_STAFF_FEED_URL),
      truckersMpWideProviderConfigured: true,
      truckersMpWideProvider: process.env.TRUCKERSMP_LIVE_PROVIDER_URL?.trim() ? "custom" : "tracker.ets2map.com",
    };
  });
}
