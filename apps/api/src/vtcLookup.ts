import { Vtc } from "./db.js";

export async function resolveVtcIdentifier(value: string | number) {
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const byId = await Vtc.findByPk(Number(raw));
    if (byId) return byId;
  }
  return Vtc.findOne({ where: { slug: raw.toLowerCase() } });
}
