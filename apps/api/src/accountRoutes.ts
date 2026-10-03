import type { FastifyInstance } from "fastify";
import { User } from "./db.js";
import { createAccountSession, deleteAccountSession, requireUser } from "./accountSession.js";
import { fetchSteamProfile, refreshSteamOwnership } from "./steam.js";

function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function apiUrl() {
  return (process.env.OPENHAUL_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

export async function registerAccountRoutes(app: FastifyInstance) {
  app.get("/api/v1/auth/steam", async (_request, reply) => {
    const openid = new URL("https://steamcommunity.com/openid/login");
    const returnTo = apiUrl() + "/api/v1/auth/steam/callback";

    openid.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
    openid.searchParams.set("openid.mode", "checkid_setup");
    openid.searchParams.set("openid.return_to", returnTo);
    openid.searchParams.set("openid.realm", process.env.OPENHAUL_STEAM_REALM ?? (new URL(apiUrl()).origin + "/"));
    openid.searchParams.set("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select");
    openid.searchParams.set("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select");

    return reply.redirect(openid.toString());
  });

  app.get("/api/v1/auth/steam/callback", async (request, reply) => {
    const query = request.query as Record<string, string>;
    const verification = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith("openid.")) verification.set(key, value);
    }
    verification.set("openid.mode", "check_authentication");

    const verifyResponse = await fetch("https://steamcommunity.com/openid/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: verification.toString(),
    });

    const verifyBody = await verifyResponse.text();
    if (!verifyBody.includes("is_valid:true")) {
      return reply.redirect(appUrl() + "/account?error=steam_auth_failed");
    }

    const claimed = query["openid.claimed_id"] ?? "";
    const match = /\/openid\/id\/(\d+)$/.exec(claimed);
    if (!match) return reply.redirect(appUrl() + "/account?error=steam_id_missing");

    const steamId = match[1];
    const profile = await fetchSteamProfile(steamId);

    const [user] = await User.findOrCreate({
      where: { steamId },
      defaults: {
        steamId,
        displayName: profile?.personaname ?? "Steam User",
        avatarUrl: profile?.avatarfull ?? null,
        profileUrl: profile?.profileurl ?? null,
        ownershipVisibility: "unknown",
      },
    });

    if (profile) {
      await user.update({
        displayName: profile.personaname ?? user.displayName,
        avatarUrl: profile.avatarfull ?? user.avatarUrl,
        profileUrl: profile.profileurl ?? user.profileUrl,
      });
    }

    await refreshSteamOwnership(user);
    const session = await createAccountSession(user.id);

    reply.setCookie("openhaul_session", session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.OPENHAUL_COOKIE_SECURE === "true",
      path: "/",
      expires: session.expiresAt,
    });

    return reply.redirect(appUrl() + "/account");
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    await deleteAccountSession(request.cookies.openhaul_session);
    reply.clearCookie("openhaul_session", { path: "/" });
    return { ok: true };
  });

  app.get("/api/v1/account/me", { preHandler: [requireUser] }, async (request) => ({
    user: request.openhaulUser,
  }));

  app.post("/api/v1/account/ownership/refresh", { preHandler: [requireUser] }, async (request) => ({
    user: await refreshSteamOwnership(request.openhaulUser!),
  }));
}
