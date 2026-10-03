import type { FastifyInstance } from "fastify";

const endpoint = "https://api.truckersmp.com/v2/servers";
let cache:
  | { expiresAt: number; value: unknown }
  | null = null;

export async function registerTruckersMpRoutes(app: FastifyInstance) {
  app.get("/api/v1/public/truckersmp/servers", async (_request, reply) => {
    if (cache && cache.expiresAt > Date.now()) {
      reply.header("cache-control", "public, max-age=10");
      return cache.value;
    }

    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        "user-agent": "OpenHaul/1.0 (+https://github.com/NekoSuneProjects/OpenHaul)",
      },
    });

    if (!response.ok) {
      return reply.code(502).send({
        error: "truckersmp_servers_unavailable",
        status: response.status,
      });
    }

    const payload = await response.json() as {
      error?: boolean;
      response?: Array<Record<string, unknown>>;
    };

    const servers = (payload.response ?? []).map((server) => ({
      id: Number(server.id ?? 0),
      name: String(server.name ?? "Unknown server"),
      shortName: String(server.shortname ?? server.shortName ?? server.name ?? "Unknown server"),
      game: String(server.game ?? "").toLowerCase(),
      online: Boolean(server.online ?? true),
      players: Number(server.players ?? 0),
      queue: Number(server.queue ?? 0),
      maxPlayers: Number(server.maxplayers ?? server.maxPlayers ?? 0),
      event: Boolean(server.event ?? false),
      displayName: String(server.displayname ?? server.displayName ?? server.name ?? "Unknown server"),
      speedLimiter: Boolean(server.speedlimiter ?? server.speedLimiter ?? false),
      collisions: server.collisions == null ? null : Boolean(server.collisions),
      carsForPlayers: server.carsforplayers == null ? null : Boolean(server.carsforplayers),
    }));

    const value = {
      source: "TruckersMP",
      fetchedAt: new Date().toISOString(),
      count: servers.length,
      servers,
    };

    cache = {
      expiresAt: Date.now() + 15_000,
      value,
    };

    reply.header("cache-control", "public, max-age=10");
    return value;
  });
}
