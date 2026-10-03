import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Op } from "sequelize";
import { z } from "zod";
import { TwitchAccount, TwitchLinkState, User } from "./db.js";
import { requireUser } from "./accountSession.js";

const TRUCK_GAMES = new Set([
  "Euro Truck Simulator 2",
  "American Truck Simulator",
]);

let appTokenCache: { token: string; expiresAt: number } | null = null;

function siteUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function apiUrl() {
  return (process.env.OPENHAUL_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

function twitchConfig() {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function hashState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

async function getAppToken() {
  const config = twitchConfig();
  if (!config) return null;

  if (appTokenCache && appTokenCache.expiresAt > Date.now() + 60_000) {
    return appTokenCache.token;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "client_credentials",
  });

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) return null;

  const json = await response.json() as any;
  if (!json?.access_token) return null;

  appTokenCache = {
    token: String(json.access_token),
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
  };
  return appTokenCache.token;
}

async function refreshStreams() {
  const config = twitchConfig();
  const token = await getAppToken();
  if (!config || !token) return [];

  const linked = await TwitchAccount.findAll({ order: [["id", "ASC"]] });
  const byId = new Map(linked.map((account) => [account.twitchUserId, account]));
  const liveIds = new Set<string>();

  for (let offset = 0; offset < linked.length; offset += 100) {
    const batch = linked.slice(offset, offset + 100);
    if (batch.length === 0) continue;

    const url = new URL("https://api.twitch.tv/helix/streams");
    for (const account of batch) url.searchParams.append("user_id", account.twitchUserId);

    const response = await fetch(url, {
      headers: {
        Authorization: "Bearer " + token,
        "Client-Id": config.clientId,
      },
    });
    if (!response.ok) continue;

    const json = await response.json() as any;
    const streams = Array.isArray(json?.data) ? json.data : [];

    for (const stream of streams) {
      const account = byId.get(String(stream.user_id));
      if (!account) continue;

      liveIds.add(account.twitchUserId);
      await account.update({
        live: true,
        gameId: stream.game_id ? String(stream.game_id) : null,
        gameName: stream.game_name ? String(stream.game_name) : null,
        streamTitle: stream.title ? String(stream.title) : null,
        viewerCount: Number(stream.viewer_count ?? 0),
        streamStartedAt: stream.started_at ? new Date(stream.started_at) : null,
        thumbnailUrl: stream.thumbnail_url ? String(stream.thumbnail_url) : null,
        lastCheckedAt: new Date(),
      });
    }
  }

  for (const account of linked) {
    if (!liveIds.has(account.twitchUserId) && account.live) {
      await account.update({
        live: false,
        gameId: null,
        gameName: null,
        streamTitle: null,
        viewerCount: null,
        streamStartedAt: null,
        thumbnailUrl: null,
        lastCheckedAt: new Date(),
      });
    } else if (!liveIds.has(account.twitchUserId)) {
      await account.update({ lastCheckedAt: new Date() });
    }
  }

  return TwitchAccount.findAll({
    where: {
      live: true,
      gameName: { [Op.in]: [...TRUCK_GAMES] },
    },
    include: [{
      model: User,
      attributes: ["steamId", "displayName", "avatarUrl"],
    }],
    order: [["viewerCount", "DESC"]],
  });
}

export async function registerTwitchRoutes(app: FastifyInstance) {
  app.get("/api/v1/account/twitch", { preHandler: [requireUser] }, async (request) => ({
    twitch: await TwitchAccount.findOne({
      where: { userId: request.openhaulUser!.id },
    }),
  }));

  app.get("/api/v1/account/twitch/connect", { preHandler: [requireUser] }, async (request, reply) => {
    const config = twitchConfig();
    if (!config) return reply.code(503).send({ error: "twitch_not_configured" });

    const state = randomBytes(24).toString("base64url");
    await TwitchLinkState.destroy({
      where: { userId: request.openhaulUser!.id },
    });
    await TwitchLinkState.create({
      userId: request.openhaulUser!.id,
      stateHash: hashState(state),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const redirectUri = apiUrl() + "/api/v1/auth/twitch/callback";
    const authorize = new URL("https://id.twitch.tv/oauth2/authorize");
    authorize.searchParams.set("client_id", config.clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("scope", "openid");
    authorize.searchParams.set("state", state);

    return reply.redirect(authorize.toString());
  });

  app.get("/api/v1/auth/twitch/callback", async (request, reply) => {
    const query = z.object({
      code: z.string().min(1),
      state: z.string().min(1),
    }).safeParse(request.query);

    if (!query.success) {
      return reply.redirect(siteUrl() + "/account?twitch=failed");
    }

    const state = await TwitchLinkState.findOne({
      where: {
        stateHash: hashState(query.data.state),
        expiresAt: { [Op.gt]: new Date() },
      },
    });
    if (!state) return reply.redirect(siteUrl() + "/account?twitch=state_failed");

    const config = twitchConfig();
    if (!config) return reply.redirect(siteUrl() + "/account?twitch=not_configured");

    const redirectUri = apiUrl() + "/api/v1/auth/twitch/callback";
    const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: query.data.code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      await state.destroy();
      return reply.redirect(siteUrl() + "/account?twitch=token_failed");
    }

    const tokenJson = await tokenResponse.json() as any;
    const userAccessToken = String(tokenJson.access_token ?? "");
    if (!userAccessToken) {
      await state.destroy();
      return reply.redirect(siteUrl() + "/account?twitch=token_failed");
    }

    const userResponse = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: "Bearer " + userAccessToken,
        "Client-Id": config.clientId,
      },
    });

    if (!userResponse.ok) {
      await state.destroy();
      return reply.redirect(siteUrl() + "/account?twitch=user_failed");
    }

    const userJson = await userResponse.json() as any;
    const twitchUser = userJson?.data?.[0];
    if (!twitchUser?.id) {
      await state.destroy();
      return reply.redirect(siteUrl() + "/account?twitch=user_failed");
    }

    const userId = Number(state.getDataValue("userId"));
    const existingOtherUser = await TwitchAccount.findOne({
      where: { twitchUserId: String(twitchUser.id) },
    });
    if (existingOtherUser && existingOtherUser.userId !== userId) {
      await state.destroy();
      return reply.redirect(siteUrl() + "/account?twitch=already_linked");
    }

    const existing = await TwitchAccount.findOne({ where: { userId } });
    if (existing) {
      await existing.update({
        twitchUserId: String(twitchUser.id),
        login: String(twitchUser.login),
        displayName: String(twitchUser.display_name ?? twitchUser.login),
        profileImageUrl: twitchUser.profile_image_url ? String(twitchUser.profile_image_url) : null,
        broadcasterType: twitchUser.broadcaster_type ? String(twitchUser.broadcaster_type) : null,
      });
    } else {
      await TwitchAccount.create({
        userId,
        twitchUserId: String(twitchUser.id),
        login: String(twitchUser.login),
        displayName: String(twitchUser.display_name ?? twitchUser.login),
        profileImageUrl: twitchUser.profile_image_url ? String(twitchUser.profile_image_url) : null,
        broadcasterType: twitchUser.broadcaster_type ? String(twitchUser.broadcaster_type) : null,
        live: false,
      });
    }

    await state.destroy();
    await refreshStreams();
    return reply.redirect(siteUrl() + "/account?twitch=linked");
  });

  app.post("/api/v1/account/twitch/refresh", { preHandler: [requireUser] }, async (request) => {
    await refreshStreams();
    return {
      twitch: await TwitchAccount.findOne({
        where: { userId: request.openhaulUser!.id },
      }),
    };
  });

  app.delete("/api/v1/account/twitch", { preHandler: [requireUser] }, async (request) => {
    await TwitchAccount.destroy({ where: { userId: request.openhaulUser!.id } });
    return { ok: true };
  });

  app.get("/api/v1/public/streamers", async (request) => {
    const query = z.object({
      game: z.enum(["ets2", "ats"]).optional(),
    }).parse(request.query);

    const gameName = query.game === "ets2"
      ? "Euro Truck Simulator 2"
      : query.game === "ats"
        ? "American Truck Simulator"
        : undefined;

    const where: any = {
      live: true,
      gameName: gameName ?? { [Op.in]: [...TRUCK_GAMES] },
    };

    const streamers = await TwitchAccount.findAll({
      where,
      include: [{
        model: User,
        attributes: ["steamId", "displayName", "avatarUrl"],
      }],
      order: [["viewerCount", "DESC"]],
    });

    return { count: streamers.length, streamers };
  });

  setInterval(() => {
    void refreshStreams().catch((error) => app.log.warn({ error }, "Twitch stream refresh failed"));
  }, 60_000).unref();
}
