import Redis from "ioredis";

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
  server?: string | null;
  updatedAt: string;
};

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const TTL_SECONDS = 45;

export async function setLiveDriver(driver: LiveDriver) {
  const now = Date.now();
  const key = `live:driver:${driver.driverId}`;
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
}

export async function getLiveDrivers(vtcId?: number) {
  const now = Date.now();
  const index = vtcId ? `live:vtc:${vtcId}` : "live:all";
  const ids = await redis.zrangebyscore(index, now - TTL_SECONDS * 1000, "+inf");
  if (!ids.length) return [];

  const values = await redis.mget(ids.map((id) => `live:driver:${id}`));
  return values
    .filter((value): value is string => Boolean(value))
    .map((value) => JSON.parse(value) as LiveDriver);
}
