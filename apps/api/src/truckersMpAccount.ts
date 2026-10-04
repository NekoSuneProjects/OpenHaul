import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TruckersMpAccount } from "./db.js";
import { requireUser } from "./accountSession.js";
import { getClientPresences, getLiveDrivers } from "./live.js";

const playerEndpoint = "https://api.truckersmp.com/v2/player/";

function normalizePlayer(payload: any) {
  const player = payload?.response ?? payload?.player ?? payload;
  const truckersMpId = String(player?.id ?? player?.truckersmpId ?? player?.truckersMpId ?? "");
  const steamId = String(player?.steamID64 ?? player?.steamId64 ?? player?.steam_id_64 ?? "");
  const name = String(player?.name ?? player?.username ?? truckersMpId);
  const avatarUrl = player?.avatar ? String(player.avatar) : player?.smallAvatar ? String(player.smallAvatar) : null;
  const vtc = player?.vtc ?? null;
  const vtcId = vtc?.id == null ? null : String(vtc.id);
  const vtcName = vtc?.name ? String(vtc.name) : null;
  return { truckersMpId, steamId, name, avatarUrl, vtcId, vtcName };
}

async function fetchPlayer(id: string) {
  const response = await fetch(playerEndpoint + encodeURIComponent(id), {
    headers: {
      accept: "application/json",
      "user-agent": "OpenHaul/1.0 (+https://github.com/NekoSuneProjects/OpenHaul)",
    },
    signal: AbortSignal.timeout(6000),
  });

  if (!response.ok) {
    const error: any = new Error("TruckersMP player lookup failed");
    error.status = response.status;
    throw error;
  }

  const payload = await response.json() as any;
  if (payload?.error === true) throw new Error("TruckersMP player not found");
  return normalizePlayer(payload);
}

export async function registerTruckersMpAccountRoutes(app: FastifyInstance) {
  app.get("/api/v1/account/truckersmp", { preHandler: [requireUser] }, async (request) => {
    const account = await TruckersMpAccount.findOne({ where: { userId: request.openhaulUser!.id } });
    const [presences, liveDrivers] = await Promise.all([getClientPresences(), getLiveDrivers()]);
    const presence = presences.find((item) => item.steamId === request.openhaulUser!.steamId);
    const live = liveDrivers.find((item) => item.driverId === request.openhaulUser!.steamId);

    return {
      linked: Boolean(account),
      account: account ? account.toJSON() : null,
      detection: {
        clientOnline: Boolean(presence),
        sessionMode: live?.sessionMode ?? (presence ? "unknown" : "offline"),
        game: live?.game ?? null,
        server: live?.server ?? null,
        driverStatus: live?.driverStatus ?? (presence ? "client-online" : "offline"),
      },
    };
  });

  app.post("/api/v1/account/truckersmp", { preHandler: [requireUser] }, async (request, reply) => {
    const body = z.object({
      truckersMpId: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
    }).parse(request.body);

    if (!/^\d{1,12}$/.test(body.truckersMpId)) {
      return reply.code(400).send({ error: "invalid_truckersmp_id" });
    }

    let player;
    try {
      player = await fetchPlayer(body.truckersMpId);
    } catch (error: any) {
      return reply.code(error?.status === 404 ? 404 : 502).send({
        error: error?.status === 404 ? "truckersmp_player_not_found" : "truckersmp_lookup_failed",
      });
    }

    if (!player.truckersMpId || !player.steamId) {
      return reply.code(502).send({ error: "truckersmp_profile_missing_identity" });
    }

    if (player.steamId !== request.openhaulUser!.steamId) {
      return reply.code(409).send({
        error: "truckersmp_steam_mismatch",
        expectedSteamId: request.openhaulUser!.steamId,
        profileSteamId: player.steamId,
      });
    }

    const conflict = await TruckersMpAccount.findOne({ where: { truckersMpId: player.truckersMpId } });
    if (conflict && Number(conflict.getDataValue("userId")) !== request.openhaulUser!.id) {
      return reply.code(409).send({ error: "truckersmp_already_linked" });
    }

    const [account] = await TruckersMpAccount.findOrCreate({
      where: { userId: request.openhaulUser!.id },
      defaults: {
        userId: request.openhaulUser!.id,
        truckersMpId: player.truckersMpId,
        steamId: player.steamId,
        name: player.name,
        avatarUrl: player.avatarUrl,
        vtcId: player.vtcId,
        vtcName: player.vtcName,
        linkedAt: new Date(),
        lastVerifiedAt: new Date(),
      },
    });

    await account.update({
      truckersMpId: player.truckersMpId,
      steamId: player.steamId,
      name: player.name,
      avatarUrl: player.avatarUrl,
      vtcId: player.vtcId,
      vtcName: player.vtcName,
      lastVerifiedAt: new Date(),
    });

    return { linked: true, account };
  });

  app.post("/api/v1/account/truckersmp/refresh", { preHandler: [requireUser] }, async (request, reply) => {
    const account = await TruckersMpAccount.findOne({ where: { userId: request.openhaulUser!.id } });
    if (!account) return reply.code(404).send({ error: "truckersmp_not_linked" });

    try {
      const player = await fetchPlayer(String(account.getDataValue("truckersMpId")));
      if (player.steamId !== request.openhaulUser!.steamId) {
        return reply.code(409).send({ error: "truckersmp_steam_mismatch" });
      }

      await account.update({
        name: player.name,
        avatarUrl: player.avatarUrl,
        vtcId: player.vtcId,
        vtcName: player.vtcName,
        lastVerifiedAt: new Date(),
      });

      return { linked: true, account };
    } catch {
      return reply.code(502).send({ error: "truckersmp_lookup_failed" });
    }
  });

  app.delete("/api/v1/account/truckersmp", { preHandler: [requireUser] }, async (request, reply) => {
    await TruckersMpAccount.destroy({ where: { userId: request.openhaulUser!.id } });
    return reply.code(204).send();
  });
}
