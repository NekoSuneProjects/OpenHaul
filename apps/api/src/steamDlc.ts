import type { FastifyInstance } from "fastify";
import { requireUser } from "./accountSession.js";

type StoreApp = {
  appid: number;
  name: string;
};

let cache: { expiresAt: number; apps: StoreApp[] } | null = null;

async function loadDlcCatalogue() {
  if (cache && cache.expiresAt > Date.now()) return cache.apps;

  const key = process.env.STEAM_WEB_API_KEY?.trim();
  if (!key) return [];

  const input = {
    include_games: false,
    include_dlc: true,
    include_software: false,
    include_videos: false,
    include_hardware: false,
    max_results: 50000,
  };

  const url = new URL("https://api.steampowered.com/IStoreService/GetAppList/v1/");
  url.searchParams.set("key", key);
  url.searchParams.set("input_json", JSON.stringify(input));

  const response = await fetch(url);
  if (!response.ok) return [];

  const json = await response.json() as any;
  const apps = Array.isArray(json?.response?.apps) ? json.response.apps : [];

  const relevant = apps
    .map((app: any) => ({
      appid: Number(app.appid),
      name: String(app.name ?? ""),
    }))
    .filter((app: StoreApp) =>
      app.name.startsWith("Euro Truck Simulator 2 - ") ||
      app.name.startsWith("American Truck Simulator - ")
    )
    .sort((a: StoreApp, b: StoreApp) => a.name.localeCompare(b.name));

  cache = {
    expiresAt: Date.now() + 1000 * 60 * 60 * 6,
    apps: relevant,
  };

  return relevant;
}

export async function registerSteamDlcRoutes(app: FastifyInstance) {
  app.get("/api/v1/account/dlc", { preHandler: [requireUser] }, async (request) => {
    const catalogue = await loadDlcCatalogue();
    const snapshot = request.openhaulUser!.getDataValue("ownedGamesSnapshot") as any[] | null;
    const visible = request.openhaulUser!.getDataValue("ownershipVisibility") === "verified";
    const detectedAppIds = new Set(
      Array.isArray(snapshot) ? snapshot.map((game) => Number(game.appid)) : [],
    );

    return {
      visibility: request.openhaulUser!.getDataValue("ownershipVisibility"),
      note: visible
        ? "Detected means the DLC app ID appeared in Steam's library response. Missing DLC is not treated as definitively unowned."
        : "Steam game details are not visible, so DLC ownership cannot be detected from the public Web API.",
      ets2: catalogue
        .filter((item) => item.name.startsWith("Euro Truck Simulator 2 - "))
        .map((item) => ({
          ...item,
          status: detectedAppIds.has(item.appid) ? "detected" : "not_confirmed",
        })),
      ats: catalogue
        .filter((item) => item.name.startsWith("American Truck Simulator - "))
        .map((item) => ({
          ...item,
          status: detectedAppIds.has(item.appid) ? "detected" : "not_confirmed",
        })),
    };
  });
}
