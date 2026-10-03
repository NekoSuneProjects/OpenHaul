import { User } from "./db.js";

export const ETS2_APP_ID = 227300;
export const ATS_APP_ID = 270880;

export async function fetchSteamProfile(steamId: string) {
  const key = process.env.STEAM_WEB_API_KEY?.trim();
  if (!key) return null;

  const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
  url.searchParams.set("key", key);
  url.searchParams.set("steamids", steamId);

  const response = await fetch(url);
  if (!response.ok) return null;

  const json = await response.json() as any;
  return json?.response?.players?.[0] ?? null;
}

export async function refreshSteamOwnership(user: User) {
  const key = process.env.STEAM_WEB_API_KEY?.trim();
  if (!key) {
    await user.update({ ownershipVisibility: "unknown" });
    return user.reload();
  }

  const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
  url.searchParams.set("key", key);
  url.searchParams.set("steamid", user.steamId);
  url.searchParams.set("include_appinfo", "true");
  url.searchParams.set("include_played_free_games", "true");

  try {
    const response = await fetch(url);
    if (!response.ok) {
      await user.update({ ownershipVisibility: "unknown" });
      return user.reload();
    }

    const json = await response.json() as any;
    const games = json?.response?.games;

    if (!Array.isArray(games)) {
      await user.update({
        ownershipVisibility: "private",
        ownsEts2: null,
        ownsAts: null,
        ownedGamesSnapshot: null,
      });
      return user.reload();
    }

    await user.update({
      ownershipVisibility: "verified",
      ownsEts2: games.some((game: any) => Number(game.appid) === ETS2_APP_ID),
      ownsAts: games.some((game: any) => Number(game.appid) === ATS_APP_ID),
      ownedGamesSnapshot: games.map((game: any) => ({
        appid: Number(game.appid),
        name: String(game.name ?? ""),
        playtimeForever: Number(game.playtime_forever ?? 0),
        icon: game.img_icon_url ?? null,
      })),
    });

    return user.reload();
  } catch {
    await user.update({ ownershipVisibility: "unknown" });
    return user.reload();
  }
}
