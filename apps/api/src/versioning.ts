import type { FastifyInstance } from "fastify";
import { z } from "zod";

export const OPENHAUL_PROTOCOL = {
  server: 1,
  client: 1,
  telemetry: 1,
  api: 1,
};

const stableClientManifest =
  process.env.OPENHAUL_STABLE_CLIENT_MANIFEST_URL ??
  "https://github.com/NekoSuneProjects/OpenHaul/releases/download/windows-client/client-manifest.json";

const betaClientManifest =
  process.env.OPENHAUL_BETA_CLIENT_MANIFEST_URL ??
  "https://github.com/NekoSuneProjects/OpenHaul/releases/download/windows-client-beta/client-manifest.json";

async function fetchManifest(url: string) {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "OpenHaul/1.0" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function registerVersioningRoutes(app: FastifyInstance) {
  app.get("/api/v1/version", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=30");
    return {
      service: "OpenHaul",
      version: process.env.OPENHAUL_VERSION ?? "dev",
      releaseChannel: process.env.OPENHAUL_RELEASE_CHANNEL ?? "stable",
      protocol: OPENHAUL_PROTOCOL,
      compatibility: {
        minimumClientProtocol: 1,
        maximumClientProtocol: 1,
        minimumTelemetryProtocol: 1,
        maximumTelemetryProtocol: 1,
      },
      manifests: {
        stable: stableClientManifest,
        beta: betaClientManifest,
      },
    };
  });

  app.get("/api/v1/public/releases/:channel", async (request, reply) => {
    const { channel } = z.object({ channel: z.enum(["stable", "beta"]) }).parse(request.params);
    const manifest = await fetchManifest(channel === "stable" ? stableClientManifest : betaClientManifest);
    if (!manifest) return reply.code(502).send({ error: "release_manifest_unavailable", channel });
    reply.header("cache-control", "public, max-age=60");
    return { channel, manifest };
  });

  app.post("/api/v1/public/compatibility", async (request) => {
    const body = z.object({
      clientProtocol: z.number().int().positive().optional(),
      telemetryProtocol: z.number().int().positive().optional(),
    }).parse(request.body ?? {});

    const clientCompatible = body.clientProtocol == null || body.clientProtocol === OPENHAUL_PROTOCOL.client;
    const telemetryCompatible = body.telemetryProtocol == null || body.telemetryProtocol === OPENHAUL_PROTOCOL.telemetry;

    return {
      compatible: clientCompatible && telemetryCompatible,
      clientCompatible,
      telemetryCompatible,
      expected: OPENHAUL_PROTOCOL,
    };
  });
}
