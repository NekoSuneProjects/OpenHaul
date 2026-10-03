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
  description: { type: DataTypes.TEXT, allowNull: true },
  website: { type: DataTypes.TEXT, allowNull: true },
  discordUrl: { type: DataTypes.TEXT, allowNull: true, field: "discord_url" },
  logoUrl: { type: DataTypes.TEXT, allowNull: true, field: "logo_url" },
  ownerUserId: { type: DataTypes.INTEGER, allowNull: true, field: "owner_user_id" },
  currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: "GBP" },
  recruitmentOpen: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: "recruitment_open" },
  publicBalance: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: "public_balance" },
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

export class DonationGoal extends Model {
  declare id: number;
  declare title: string;
  declare description: string | null;
  declare currency: string;
  declare targetAmount: number;
  declare currentAmount: number;
  declare active: boolean;
  declare sortOrder: number;
}

DonationGoal.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  title: { type: DataTypes.STRING(160), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: "GBP" },
  targetAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: "target_amount" },
  currentAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: "current_amount" },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: "sort_order" },
}, { sequelize, modelName: "DonationGoal", tableName: "donation_goals", underscored: true });

Vtc.hasMany(VtcApiKey, { foreignKey: "vtcId" });
VtcApiKey.belongsTo(Vtc, { foreignKey: "vtcId" });

export class User extends Model {
  declare id: number;
  declare steamId: string;
  declare displayName: string;
  declare avatarUrl: string | null;
  declare profileUrl: string | null;
  declare ownsEts2: boolean | null;
  declare ownsAts: boolean | null;
  declare ownershipVisibility: string;
  declare ownedGamesSnapshot: unknown;
}

User.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  steamId: { type: DataTypes.STRING(32), allowNull: false, unique: true, field: "steam_id" },
  displayName: { type: DataTypes.STRING(120), allowNull: false, field: "display_name" },
  avatarUrl: { type: DataTypes.TEXT, allowNull: true, field: "avatar_url" },
  profileUrl: { type: DataTypes.TEXT, allowNull: true, field: "profile_url" },
  ownsEts2: { type: DataTypes.BOOLEAN, allowNull: true, field: "owns_ets2" },
  ownsAts: { type: DataTypes.BOOLEAN, allowNull: true, field: "owns_ats" },
  ownershipVisibility: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "unknown", field: "ownership_visibility" },
  ownedGamesSnapshot: { type: DataTypes.JSONB, allowNull: true, field: "owned_games_snapshot" },
}, { sequelize, modelName: "User", tableName: "users", underscored: true });


export class AccountSession extends Model {}
AccountSession.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: "token_hash" },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: "expires_at" },
}, { sequelize, modelName: "AccountSession", tableName: "account_sessions", underscored: true });
export class VtcMember extends Model {}
VtcMember.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  vtcId: { type: DataTypes.INTEGER, allowNull: false, field: "vtc_id" },
  userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
  role: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "member" },
  title: { type: DataTypes.STRING(80), allowNull: true },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "active" },
  joinedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "joined_at" },
}, { sequelize, modelName: "VtcMember", tableName: "vtc_members", underscored: true, indexes: [{ unique: true, fields: ["vtc_id", "user_id"] }] });

export class VtcApplication extends Model {}
VtcApplication.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  vtcId: { type: DataTypes.INTEGER, allowNull: false, field: "vtc_id" },
  userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
  message: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "pending" },
}, { sequelize, modelName: "VtcApplication", tableName: "vtc_applications", underscored: true });

export class VtcLedgerEntry extends Model {}
VtcLedgerEntry.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  vtcId: { type: DataTypes.INTEGER, allowNull: false, field: "vtc_id" },
  createdByUserId: { type: DataTypes.INTEGER, allowNull: true, field: "created_by_user_id" },
  type: { type: DataTypes.STRING(32), allowNull: false },
  description: { type: DataTypes.STRING(255), allowNull: false },
  amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: "GBP" },
}, { sequelize, modelName: "VtcLedgerEntry", tableName: "vtc_ledger_entries", underscored: true });

User.hasMany(VtcMember, { foreignKey: "userId" });
Vtc.hasMany(VtcMember, { foreignKey: "vtcId" });
VtcMember.belongsTo(User, { foreignKey: "userId" });
VtcMember.belongsTo(Vtc, { foreignKey: "vtcId" });

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

async function bootstrapDonationGoal() {
  const title = process.env.OPENHAUL_BOOTSTRAP_GOAL_TITLE?.trim();
  const target = Number(process.env.OPENHAUL_BOOTSTRAP_GOAL_TARGET ?? "");
  if (!title || !Number.isFinite(target) || target <= 0) return;

  await DonationGoal.findOrCreate({
    where: { title },
    defaults: {
      title,
      description: process.env.OPENHAUL_BOOTSTRAP_GOAL_DESCRIPTION?.trim() || null,
      currency: process.env.OPENHAUL_BOOTSTRAP_GOAL_CURRENCY?.trim() || "GBP",
      targetAmount: target,
      currentAmount: Number(process.env.OPENHAUL_BOOTSTRAP_GOAL_CURRENT ?? "0") || 0,
      active: true,
      sortOrder: 0,
    },
  });
}

export async function initDatabase() {
  await sequelize.authenticate();
  await sequelize.sync();
  await bootstrapVtc();
  await bootstrapDonationGoal();
}
