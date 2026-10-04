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
  vtcId: { type: DataTypes.INTEGER, allowNull: true, field: "vtc_id" },
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
  vtcId: { type: DataTypes.INTEGER, allowNull: true, field: "vtc_id" },
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
export class ClientAuthRequest extends Model {
  declare id: number;
  declare requestId: string;
  declare secretHash: string;
  declare userId: number | null;
  declare clientName: string;
  declare approvedAt: Date | null;
  declare consumedAt: Date | null;
  declare expiresAt: Date;
}
ClientAuthRequest.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  requestId: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: "request_id" },
  secretHash: { type: DataTypes.STRING(64), allowNull: false, field: "secret_hash" },
  userId: { type: DataTypes.INTEGER, allowNull: true, field: "user_id" },
  clientName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "Windows Client", field: "client_name" },
  approvedAt: { type: DataTypes.DATE, allowNull: true, field: "approved_at" },
  consumedAt: { type: DataTypes.DATE, allowNull: true, field: "consumed_at" },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: "expires_at" },
}, { sequelize, modelName: "ClientAuthRequest", tableName: "client_auth_requests", underscored: true });

export class ClientToken extends Model {
  declare id: number;
  declare userId: number;
  declare name: string;
  declare prefix: string;
  declare tokenHash: string;
  declare lastUsedAt: Date | null;
  declare revokedAt: Date | null;
}
ClientToken.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
  name: { type: DataTypes.STRING(120), allowNull: false },
  prefix: { type: DataTypes.STRING(24), allowNull: false },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: "token_hash" },
  lastUsedAt: { type: DataTypes.DATE, allowNull: true, field: "last_used_at" },
  revokedAt: { type: DataTypes.DATE, allowNull: true, field: "revoked_at" },
}, { sequelize, modelName: "ClientToken", tableName: "client_tokens", underscored: true });

export class UserApiKey extends Model {
  declare id: number;
  declare userId: number;
  declare name: string;
  declare prefix: string;
  declare keyHash: string;
  declare scopes: string[];
  declare lastUsedAt: Date | null;
  declare revokedAt: Date | null;
}
UserApiKey.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
  name: { type: DataTypes.STRING(120), allowNull: false },
  prefix: { type: DataTypes.STRING(24), allowNull: false },
  keyHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: "key_hash" },
  scopes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  lastUsedAt: { type: DataTypes.DATE, allowNull: true, field: "last_used_at" },
  revokedAt: { type: DataTypes.DATE, allowNull: true, field: "revoked_at" },
}, { sequelize, modelName: "UserApiKey", tableName: "user_api_keys", underscored: true });

export class TwitchAccount extends Model {
  declare id: number;
  declare userId: number;
  declare twitchUserId: string;
  declare login: string;
  declare displayName: string;
  declare profileImageUrl: string | null;
  declare broadcasterType: string | null;
  declare live: boolean;
  declare gameId: string | null;
  declare gameName: string | null;
  declare streamTitle: string | null;
  declare viewerCount: number | null;
  declare streamStartedAt: Date | null;
  declare thumbnailUrl: string | null;
  declare lastCheckedAt: Date | null;
}
TwitchAccount.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, unique: true, field: "user_id" },
  twitchUserId: { type: DataTypes.STRING(32), allowNull: false, unique: true, field: "twitch_user_id" },
  login: { type: DataTypes.STRING(64), allowNull: false },
  displayName: { type: DataTypes.STRING(120), allowNull: false, field: "display_name" },
  profileImageUrl: { type: DataTypes.TEXT, allowNull: true, field: "profile_image_url" },
  broadcasterType: { type: DataTypes.STRING(32), allowNull: true, field: "broadcaster_type" },
  live: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  gameId: { type: DataTypes.STRING(32), allowNull: true, field: "game_id" },
  gameName: { type: DataTypes.STRING(160), allowNull: true, field: "game_name" },
  streamTitle: { type: DataTypes.TEXT, allowNull: true, field: "stream_title" },
  viewerCount: { type: DataTypes.INTEGER, allowNull: true, field: "viewer_count" },
  streamStartedAt: { type: DataTypes.DATE, allowNull: true, field: "stream_started_at" },
  thumbnailUrl: { type: DataTypes.TEXT, allowNull: true, field: "thumbnail_url" },
  lastCheckedAt: { type: DataTypes.DATE, allowNull: true, field: "last_checked_at" },
}, { sequelize, modelName: "TwitchAccount", tableName: "twitch_accounts", underscored: true });

export class TwitchLinkState extends Model {}
TwitchLinkState.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
  stateHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: "state_hash" },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: "expires_at" },
}, { sequelize, modelName: "TwitchLinkState", tableName: "twitch_link_states", underscored: true });

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

export class VtcInvite extends Model {
  declare id: number;
  declare vtcId: number;
}
VtcInvite.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  vtcId: { type: DataTypes.INTEGER, allowNull: false, field: "vtc_id" },
  createdByUserId: { type: DataTypes.INTEGER, allowNull: false, field: "created_by_user_id" },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: "token_hash" },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: "expires_at" },
  usedByUserId: { type: DataTypes.INTEGER, allowNull: true, field: "used_by_user_id" },
  usedAt: { type: DataTypes.DATE, allowNull: true, field: "used_at" },
  revokedAt: { type: DataTypes.DATE, allowNull: true, field: "revoked_at" },
}, { sequelize, modelName: "VtcInvite", tableName: "vtc_invites", underscored: true });

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

export class VtcActivityEvent extends Model {}
VtcActivityEvent.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  vtcId: { type: DataTypes.INTEGER, allowNull: false, field: "vtc_id" },
  driverId: { type: DataTypes.STRING(80), allowNull: true, field: "driver_id" },
  actorUserId: { type: DataTypes.INTEGER, allowNull: true, field: "actor_user_id" },
  type: { type: DataTypes.STRING(64), allowNull: false },
  title: { type: DataTypes.STRING(180), allowNull: false },
  detail: { type: DataTypes.TEXT, allowNull: true },
  amount: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  currency: { type: DataTypes.STRING(8), allowNull: true },
  metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "occurred_at" },
}, { sequelize, modelName: "VtcActivityEvent", tableName: "vtc_activity_events", underscored: true });

export class VtcModerationAction extends Model {}
VtcModerationAction.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  vtcId: { type: DataTypes.INTEGER, allowNull: false, field: "vtc_id" },
  userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
  actorUserId: { type: DataTypes.INTEGER, allowNull: true, field: "actor_user_id" },
  type: { type: DataTypes.STRING(32), allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: true },
  expiresAt: { type: DataTypes.DATE, allowNull: true, field: "expires_at" },
  revokedAt: { type: DataTypes.DATE, allowNull: true, field: "revoked_at" },
}, { sequelize, modelName: "VtcModerationAction", tableName: "vtc_moderation_actions", underscored: true });

export class VtcDiscordConfig extends Model {}
VtcDiscordConfig.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  vtcId: { type: DataTypes.INTEGER, allowNull: false, unique: true, field: "vtc_id" },
  guildId: { type: DataTypes.STRING(32), allowNull: true, field: "guild_id" },
  logChannelId: { type: DataTypes.STRING(32), allowNull: true, field: "log_channel_id" },
  jobChannelId: { type: DataTypes.STRING(32), allowNull: true, field: "job_channel_id" },
  fineChannelId: { type: DataTypes.STRING(32), allowNull: true, field: "fine_channel_id" },
  applicationChannelId: { type: DataTypes.STRING(32), allowNull: true, field: "application_channel_id" },
  moderationChannelId: { type: DataTypes.STRING(32), allowNull: true, field: "moderation_channel_id" },
  driverChannelId: { type: DataTypes.STRING(32), allowNull: true, field: "driver_channel_id" },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { sequelize, modelName: "VtcDiscordConfig", tableName: "vtc_discord_configs", underscored: true });

User.hasMany(ClientToken, { foreignKey: "userId" });
User.hasMany(ClientAuthRequest, { foreignKey: "userId" });
ClientAuthRequest.belongsTo(User, { foreignKey: "userId" });
User.hasMany(UserApiKey, { foreignKey: "userId" });
UserApiKey.belongsTo(User, { foreignKey: "userId" });
User.hasOne(TwitchAccount, { foreignKey: "userId" });
TwitchAccount.belongsTo(User, { foreignKey: "userId" });
ClientToken.belongsTo(User, { foreignKey: "userId" });
User.hasMany(VtcMember, { foreignKey: "userId" });
Vtc.hasMany(VtcMember, { foreignKey: "vtcId" });
VtcMember.belongsTo(User, { foreignKey: "userId" });
VtcMember.belongsTo(Vtc, { foreignKey: "vtcId" });
VtcApplication.belongsTo(User, { foreignKey: "userId" });
VtcApplication.belongsTo(Vtc, { foreignKey: "vtcId" });
Vtc.hasMany(VtcInvite, { foreignKey: "vtcId" });
VtcInvite.belongsTo(Vtc, { foreignKey: "vtcId" });

Vtc.hasMany(VtcActivityEvent, { foreignKey: "vtcId" });
VtcActivityEvent.belongsTo(Vtc, { foreignKey: "vtcId" });
Vtc.hasMany(VtcModerationAction, { foreignKey: "vtcId" });
VtcModerationAction.belongsTo(Vtc, { foreignKey: "vtcId" });
User.hasMany(VtcModerationAction, { foreignKey: "userId" });
VtcModerationAction.belongsTo(User, { foreignKey: "userId" });
Vtc.hasOne(VtcDiscordConfig, { foreignKey: "vtcId" });
VtcDiscordConfig.belongsTo(Vtc, { foreignKey: "vtcId" });

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
