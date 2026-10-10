import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** Durable tracker snapshots: last-good data survives restarts and partial outages. */
const root = process.env.TRUCKERSMP_SNAPSHOT_DIR || path.resolve(process.cwd(), "data", "truckersmp-cache");
const memory = new Map<string, { updatedAt: string; data: unknown }>();
const pending = new Map<string, Promise<unknown>>();
const fileFor = (key: string) => path.join(root, createHash("sha256").update(key).digest("hex") + ".json");
export async function readTrackerSnapshot<T>(key: string): Promise<{ data: T; updatedAt: string; ageSeconds: number } | null> {
  try {
    let hit = memory.get(key);
    if (!hit) {
      hit = JSON.parse(await readFile(fileFor(key), "utf8")) as { updatedAt: string; data: unknown };
      memory.set(key, hit);
    }
    const ageSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(hit.updatedAt)) / 1000));
    if (!Number.isFinite(ageSeconds) || ageSeconds > 86400) return null;
    return { data: hit.data as T, updatedAt: hit.updatedAt, ageSeconds };
  } catch { return null; }
}
export async function storeTrackerSnapshot<T>(key: string, data: T) {
  const value = { updatedAt: new Date().toISOString(), data };
  memory.set(key, value);
  try {
    await mkdir(root, { recursive: true });
    const file = fileFor(key);
    const temp = file + "." + process.pid + "." + Math.random().toString(36).slice(2) + ".tmp";
    await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
    await rename(temp, file);
  } catch { /* Do not interrupt live tracking if persistent storage is unavailable. */ }
}
export async function trackerWithFallback<T>(key: string, fetchFresh: () => Promise<T>) {
  const active = pending.get(key);
  if (active) return active as Promise<{ data: T; stale: boolean; updatedAt: string | null; ageSeconds: number | null }>;
  const task = (async () => {
    try {
      const data = await fetchFresh();
      await storeTrackerSnapshot(key, data);
      return { data, stale: false, updatedAt: new Date().toISOString(), ageSeconds: 0 };
    } catch {
      const cached = await readTrackerSnapshot<T>(key);
      if (cached) return { ...cached, stale: true };
      return { data: [] as unknown as T, stale: true, updatedAt: null, ageSeconds: null };
    }
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
