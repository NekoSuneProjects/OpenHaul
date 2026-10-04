import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DiscordAccount, PlatformRecord } from "./db.js";
import { requireUser } from "./accountSession.js";

const discordApi = "https://discord.com/api/v10";

function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function redirectUri() {
  return process.env.DISCORD_REDIRECT_URI ?? appUrl() + "/api/v1/account/discord/callback";
}

export async function registerDiscordLinkRoutes(app: FastifyInstance) {
  app.get("/api/v1/account/discord", { preHandler: [requireUser] }, async (request) => {
    const account = await DiscordAccount.findOne({ where: { userId: request.openhaulUser!.id } });
    return {
      linked: Boolean(account),
      account: account ? {
        discordUserId: account.discordUserId,
        username: account.username,
        globalName: account.globalName,
        avatarUrl: account.avatarUrl,
      } : null,
      configured: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
    };
  });

  app.get("/api/v1/account/discord/link", { preHandler: [requireUser] }, async (request, reply) => {
    const clientId = process.env.DISCORD_CLIENT_ID?.trim();
    const secret = process.env.DISCORD_CLIENT_SECRET?.trim();
    if (!clientId || !secret) return reply.code(503).send({ error: "discord_oauth_not_configured" });

    const state = crypto.randomBytes(24).toString("base64url");
    await PlatformRecord.create({
      scopeType: "user",
      scopeId: String(request.openhaulUser!.id),
      category: "discord-oauth-state",
      key: state,
      status: "pending",
      data: { expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() },
      createdByUserId: request.openhaulUser!.id,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri(),
      scope: "identify",
      state,
      prompt: "consent",
    });

    return reply.redirect("https://discord.com/oauth2/authorize?" + params.toString());
  });

  app.get("/api/v1/account/discord/callback", { preHandler: [requireUser] }, async (request, reply) => {
    const query = z.object({
      code: z.string().min(1),
      state: z.string().min(1),
    }).parse(request.query);

    const stateRecord = await PlatformRecord.findOne({
      where: {
        scopeType: "user",
        scopeId: String(request.openhaulUser!.id),
        category: "discord-oauth-state",
        key: query.state,
        status: "pending",
      },
    });
    if (!stateRecord) return reply.code(400).send({ error: "invalid_discord_oauth_state" });

    const expiresAt = new Date(String((stateRecord.getDataValue("data") as any)?.expiresAt ?? 0));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      await stateRecord.update({ status: "expired" });
      return reply.code(400).send({ error: "expired_discord_oauth_state" });
    }

    const clientId = process.env.DISCORD_CLIENT_ID?.trim();
    const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return reply.code(503).send({ error: "discord_oauth_not_configured" });

    const tokenBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: query.code,
      redirect_uri: redirectUri(),
    });

    const tokenResponse = await fetch(discordApi + "/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });
    if (!tokenResponse.ok) return reply.code(502).send({ error: "discord_token_exchange_failed" });
    const token = await tokenResponse.json() as any;

    const userResponse = await fetch(discordApi + "/users/@me", {
      headers: { authorization: "Bearer " + token.access_token },
    });
    if (!userResponse.ok) return reply.code(502).send({ error: "discord_profile_fetch_failed" });
    const discordUser = await userResponse.json() as any;

    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
      : null;

    const [account] = await DiscordAccount.findOrCreate({
      where: { userId: request.openhaulUser!.id },
      defaults: {
        userId: request.openhaulUser!.id,
        discordUserId: String(discordUser.id),
        username: String(discordUser.username),
        globalName: discordUser.global_name ? String(discordUser.global_name) : null,
        avatarUrl,
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
      },
    });

    await account.update({
      discordUserId: String(discordUser.id),
      username: String(discordUser.username),
      globalName: discordUser.global_name ? String(discordUser.global_name) : null,
      avatarUrl,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    });

    await stateRecord.update({ status: "used" });
    return reply.redirect(appUrl() + "/account?discord=linked");
  });

  app.delete("/api/v1/account/discord", { preHandler: [requireUser] }, async (request, reply) => {
    await DiscordAccount.destroy({ where: { userId: request.openhaulUser!.id } });
    return reply.code(204).send();
  });
}
