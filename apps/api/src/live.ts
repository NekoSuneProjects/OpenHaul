import { Redis } from "ioredis";

export type LiveDriver = {
  driverId: string;
  username: string;
  game: "ets2" | "ats";
  vtcId?: number | null;
  vtcName?: string | null;
  vtcTag?: string | null;
  x: number;
  y?: number;
  z: number;
  heading: number;
  speedKph: number;
  truck?: string | null;
  cargo?: string | null;
  sourceCity?: string | null;
  destinationCity?: string | null;
  sourceCompany?: string | null;
  destinationCompany?: string | null;
  rpm?: number | null;
  fuel?: number | null;
  odometerKm?: number | null;
  navigationDistanceM?: number | null;
  navigationTimeS?: number | null;
  speedLimitKph?: number | null;
  truckDamagePercent?: number | null;
  engineDamagePercent?: number | null;
  transmissionDamagePercent?: number | null;
  cabinDamagePercent?: number | null;
  chassisDamagePercent?: number | null;
  wheelDamagePercent?: number | null;
  trailerDamagePercent?: number | null;
  trailerChassisDamagePercent?: number | null;
  cargoDamagePercent?: number | null;
  specialJob?: boolean | null;
  cargoLoaded?: boolean | null;
  server?: string | null;
  sessionMode?: "singleplayer" | "truckersmp" | null;
  driverStatus?: "offline" | "client-online" | "menu" | "driving" | "on-job" | "paused" | null;
  sessionId?: string | null;
  updatedAt: string;
};

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const TTL_SECONDS = 45;

export async function setLiveDriver(driver: LiveDriver) {
  const now = Date.now();
  const key = `live:driver:${driver.driverId}`;
  const wasOnline = Boolean(await redis.exists(key));
  const payload = JSON.stringify(driver);

  const tx = redis.multi();
  tx.set(key, payload, "EX", TTL_SECONDS);
  tx.zadd("live:all", now, driver.driverId);
  tx.zremrangebyscore("live:all", 0, now - TTL_SECONDS * 1000);

  if (driver.vtcId) {
    const vtcKey = `live:vtc:${driver.vtcId}`;
    tx.zadd(vtcKey, now, driver.driverId);
    tx.zremrangebyscore(vtcKey, 0, now - TTL_SECONDS * 1000);
    tx.expire(vtcKey, TTL_SECONDS * 2);
  }

  await tx.exec();
  return { wasOnline };
}

export async function getLiveDrivers(vtcId?: number): Promise<LiveDriver[]> {
  const now = Date.now();
  const index = vtcId ? `live:vtc:${vtcId}` : "live:all";
  const ids: string[] = await redis.zrangebyscore(index, now - TTL_SECONDS * 1000, "+inf");
  if (!ids.length) return [];

  const values: Array<string | null> = await redis.mget(ids.map((id: string) => `live:driver:${id}`));
  return values
    .filter((value: string | null): value is string => Boolean(value))
    .map((value: string) => JSON.parse(value) as LiveDriver);
}


export async function removeLiveDriver(driverId: string): Promise<LiveDriver | null> {
  const key = `live:driver:${driverId}`;
  const raw = await redis.get(key);
  const driver = raw ? JSON.parse(raw) as LiveDriver : null;

  const tx = redis.multi();
  tx.del(key);
  tx.zrem("live:all", driverId);
  if (driver?.vtcId) tx.zrem(`live:vtc:${driver.vtcId}`, driverId);
  await tx.exec();

  return driver;
}
