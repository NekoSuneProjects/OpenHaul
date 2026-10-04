import type { FastifyRequest } from "fastify";

function firstHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]?.trim() || "";
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIp(value: string) {
  let ip = value.trim().replace(/^for=/i, "").replace(/^"|"$/g, "");

  if (ip.startsWith("[") && ip.includes("]")) {
    ip = ip.slice(1, ip.indexOf("]"));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.replace(/:\d+$/, "");
  }

  return ip.replace(/^::ffff:/i, "").trim();
}

function forwardedHeaderIp(value: string) {
  const first = value.split(",")[0]?.trim() || "";
  return normalizeIp(first);
}

function standardizedForwardedIp(value: string) {
  const firstHop = value.split(",")[0] || "";
  const match = firstHop.match(/(?:^|;)\s*for=(?:"?)(\[[^\]]+\]|[^;,"\s]+)/i);
  return match?.[1] ? normalizeIp(match[1]) : "";
}

export type ResolvedClientIp = {
  ip: string;
  source:
    | "cf-connecting-ip"
    | "true-client-ip"
    | "x-real-ip"
    | "x-original-forwarded-for"
    | "x-forwarded-for"
    | "forwarded"
    | "x-client-ip"
    | "socket";
};

export function resolveClientIp(request: FastifyRequest): ResolvedClientIp {
  const directHeaders: Array<[ResolvedClientIp["source"], string]> = [
    ["cf-connecting-ip", firstHeaderValue(request.headers["cf-connecting-ip"])],
    ["true-client-ip", firstHeaderValue(request.headers["true-client-ip"])],
    ["x-real-ip", firstHeaderValue(request.headers["x-real-ip"])],
    ["x-original-forwarded-for", firstHeaderValue(request.headers["x-original-forwarded-for"])],
  ];

  for (const [source, raw] of directHeaders) {
    const ip = normalizeIp(raw);
    if (ip) return { ip, source };
  }

  const xff = firstHeaderValue(request.headers["x-forwarded-for"]);
  if (xff) {
    const ip = forwardedHeaderIp(xff);
    if (ip) return { ip, source: "x-forwarded-for" };
  }

  const forwarded = firstHeaderValue(request.headers.forwarded);
  if (forwarded) {
    const ip = standardizedForwardedIp(forwarded);
    if (ip) return { ip, source: "forwarded" };
  }

  const xClientIp = normalizeIp(firstHeaderValue(request.headers["x-client-ip"]));
  if (xClientIp) return { ip: xClientIp, source: "x-client-ip" };

  return {
    ip: normalizeIp(String(request.ip || "unknown")),
    source: "socket",
  };
}

export function trustedEdgeCountry(request: FastifyRequest) {
  const candidates = [
    request.headers["cf-ipcountry"],
    request.headers["x-vercel-ip-country"],
    request.headers["cloudfront-viewer-country"],
  ];

  for (const value of candidates) {
    const code = firstHeaderValue(value);
    if (/^[A-Za-z]{2}$/.test(code)) return code.toUpperCase();
  }

  return "";
}

export function genericProxyCountry(request: FastifyRequest) {
  const candidates = [
    request.headers["x-country-code"],
    request.headers["x-geo-country"],
  ];

  for (const value of candidates) {
    const code = firstHeaderValue(value);
    if (/^[A-Za-z]{2}$/.test(code)) return code.toUpperCase();
  }

  return "";
}
