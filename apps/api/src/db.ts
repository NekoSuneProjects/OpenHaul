import { createHash } from "node:crypto";
import { DataTypes, Model, Sequelize } from "sequelize";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://openhaul:change-me@localhost:5432/openhaul";

export const sequelize = new Sequelize(databaseUrl, {
  logging: process.env.NODE_ENV === "development" ? console.log : false,
});

export class Vtc extends Model {
  declare id: number;
  declare name: string;
  declare slug: string;
  declare tag: string | null;
}

Vtc.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  tag: { type: DataTypes.STRING(32), allowNull: true },
}, { sequelize, modelName: "Vtc", tableName: "vtcs", underscored: true });

export class VtcApiKey extends Model {
  declare id: number;
  declare vtcId: number;
  declare name: string;
  declare keyHash: string;
  declare scopes: string[];
  declare revokedAt: Date | null;
}

VtcApiKey.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  vtcId: { type: DataTypes.INTEGER, allowNull: false, field: "vtc_id" },
  name: { type: DataTypes.STRING(120), allowNull: false },
  keyHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: "key_hash" },
  scopes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  revokedAt: { type: DataTypes.DATE, allowNull: true, field: "revoked_at" },
}, { sequelize, modelName: "VtcApiKey", tableName: "vtc_api_keys", underscored: true });

export class Job extends Model {}
Job.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  vtcId: { type: DataTypes.INTEGER, allowNull: false, field: "vtc_id" },
  driverId: { type: DataTypes.STRING(80), allowNull: false, field: "driver_id" },
  game: { type: DataTypes.ENUM("ets2", "ats"), allowNull: false },
  cargo: { type: DataTypes.STRING(160), allowNull: true },
  sourceCity: { type: DataTypes.STRING(120), allowNull: true, field: "source_city" },
  destinationCity: { type: DataTypes.STRING(120), allowNull: true, field: "destination_city" },
  distanceKm: { type: DataTypes.FLOAT, allowNull: true, field: "distance_km" },
  income: { type: DataTypes.BIGINT, allowNull: true },
  completedAt: { type: DataTypes.DATE, allowNull: true, field: "completed_at" },
}, { sequelize, modelName: "Job", tableName: "jobs", underscored: true });

export class Fine extends Model {}
Fine.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  vtcId: { type: DataTypes.INTEGER, allowNull: false, field: "vtc_id" },
  driverId: { type: DataTypes.STRING(80), allowNull: false, field: "driver_id" },
  game: { type: DataTypes.ENUM("ets2", "ats"), allowNull: false },
  type: { type: DataTypes.STRING(80), allowNull: false },
  amount: { type: DataTypes.INTEGER, allowNull: false },
  currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: "EUR" },
  city: { type: DataTypes.STRING(120), allowNull: true },
  occurredAt: { type: DataTypes.DATE, allowNull: false, field: "occurred_at" },
}, { sequelize, modelName: "Fine", tableName: "fines", underscored: true });

Vtc.hasMany(VtcApiKey, { foreignKey: "vtcId" });
VtcApiKey.belongsTo(Vtc, { foreignKey: "vtcId" });

async function bootstrapVtc() {
  const name = process.env.OPENHAUL_BOOTSTRAP_VTC_NAME?.trim();
  const slug = process.env.OPENHAUL_BOOTSTRAP_VTC_SLUG?.trim();
  const rawKey = process.env.OPENHAUL_BOOTSTRAP_VTC_API_KEY?.trim();
  if (!name || !slug || !rawKey) return;

  const [vtc] = await Vtc.findOrCreate({
    where: { slug },
    defaults: { name, slug, tag: process.env.OPENHAUL_BOOTSTRAP_VTC_TAG?.trim() || null },
  });

  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const scopes = (process.env.OPENHAUL_BOOTSTRAP_VTC_API_SCOPES ?? "telemetry:read,jobs:read,fines:read")
    .split(",").map((scope) => scope.trim()).filter(Boolean);

  await VtcApiKey.findOrCreate({
    where: { keyHash },
    defaults: { vtcId: vtc.id, name: "Bootstrap key", keyHash, scopes, revokedAt: null },
  });
}

export async function initDatabase() {
  await sequelize.authenticate();
  await sequelize.sync();
  await bootstrapVtc();
}
