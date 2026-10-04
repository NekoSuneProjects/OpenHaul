import { createHash } from "node:crypto";
import { DataTypes, Model, Sequelize } from "sequelize";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://openhaul:change-me@localhost:5432/openhaul";

export const sequelize = new Sequelize(databaseUrl, {
  logging: process.env.NODE_ENV === "development" ? console.log : false,
});

export class SchemaVersion extends Model {
  declare id: number;
  declare version: number;
  declare name: string;
}
SchemaVersion.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  version: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
}, { sequelize, modelName: "SchemaVersion", tableName: "schema_versions", underscored: true });

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
  bannerUrl: { type: DataTypes.TEXT, allowNull: true, field: "banner_url" },
  rules: { type: DataTypes.TEXT, allowNull: true },
  socials: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  recruitmentMode: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "application", field: "recruitment_mode" },
  operatingMode: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "standard", field: "operating_mode" },
  manualJobPolicy: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "approval", field: "manual_job_policy" },
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

export class Job extends Model { declare id: number; }
Job.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  vtcId: { type: DataTypes.INTEGER, allowNull: true, field: "vtc_id" },
  driverId: { type: DataTypes.STRING(80), allowNull: false, field: "driver_id" },
  game: { type: DataTypes.ENUM("ets2", "ats"), allowNull: false },
  mode: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "standard" },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "completed" },
  submissionType: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "telemetry", field: "submission_type" },
  approvalStatus: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "approved", field: "approval_status" },
  evidenceUrl: { type: DataTypes.TEXT, allowNull: true, field: "evidence_url" },
  cargo: { type: DataTypes.STRING(160), allowNull: true },
  cargoMassKg: { type: DataTypes.FLOAT, allowNull: true, field: "cargo_mass_kg" },
  sourceCity: { type: DataTypes.STRING(120), allowNull: true, field: "source_city" },
  sourceCompany: { type: DataTypes.STRING(160), allowNull: true, field: "source_company" },
  sourceCountry: { type: DataTypes.STRING(120), allowNull: true, field: "source_country" },
  destinationCity: { type: DataTypes.STRING(120), allowNull: true, field: "destination_city" },
  destinationCompany: { type: DataTypes.STRING(160), allowNull: true, field: "destination_company" },
  destinationCountry: { type: DataTypes.STRING(120), allowNull: true, field: "destination_country" },
  distanceKm: { type: DataTypes.FLOAT, allowNull: true, field: "distance_km" },
  income: { type: DataTypes.BIGINT, allowNull: true },
  expenses: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  profit: { type: DataTypes.BIGINT, allowNull: true },
  late: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  cargoDamagePercent: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, field: "cargo_damage_percent" },
  truckDamagePercent: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, field: "truck_damage_percent" },
  trailerDamagePercent: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, field: "trailer_damage_percent" },
  completedAt: { type: DataTypes.DATE, allowNull: true, field: "completed_at" },
}, { sequelize, modelName: "Job", tableName: "jobs", underscored: true });

export class TelemetryEvent extends Model { declare id: number; }
TelemetryEvent.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  driverId: { type: DataTypes.STRING(80), allowNull: false, field: "driver_id" },
  vtcId: { type: DataTypes.INTEGER, allowNull: true, field: "vtc_id" },
  game: { type: DataTypes.STRING(8), allowNull: false },
  type: { type: DataTypes.STRING(64), allowNull: false },
  source: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "telemetry" },
  externalId: { type: DataTypes.STRING(120), allowNull: true, field: "external_id" },
  raw: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  normalized: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "occurred_at" },
}, {
  sequelize,
  modelName: "TelemetryEvent",
  tableName: "telemetry_events",
  underscored: true,
  indexes: [
    { fields: ["driver_id", "occurred_at"] },
    { fields: ["vtc_id", "occurred_at"] },
    { fields: ["type"] },
  ],
});

export class Fine extends Model { declare id: number; }
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
  bannerUrl: { type: DataTypes.TEXT, allowNull: true, field: "banner_url" },
  profileUrl: { type: DataTypes.TEXT, allowNull: true, field: "profile_url" },
  bio: { type: DataTypes.TEXT, allowNull: true },
  country: { type: DataTypes.STRING(80), allowNull: true },
  socials: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  profilePublic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: "profile_public" },
  moderationVisibility: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "public", field: "moderation_visibility" },
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
  customRoleKey: { type: DataTypes.STRING(120), allowNull: true, field: "custom_role_key" },
  title: { type: DataTypes.STRING(80), allowNull: true },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "active" },
  joinedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: "joined_at" },
}, { sequelize, modelName: "VtcMember", tableName: "vtc_members", underscored: true, indexes: [{ unique: true, fields: ["vtc_id", "user_id"] }] });

export class VtcApplication extends Model { declare id: number; }
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

export class VtcActivityEvent extends Model { declare id: number; }
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

export class VtcModerationAction extends Model { declare id: number; }
VtcModerationAction.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  vtcId: { type: DataTypes.INTEGER, allowNull: false, field: "vtc_id" },
  userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
  actorUserId: { type: DataTypes.INTEGER, allowNull: true, field: "actor_user_id" },
  type: { type: DataTypes.STRING(32), allowNull: false },
  points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  reason: { type: DataTypes.TEXT, allowNull: true },
  expiresAt: { type: DataTypes.DATE, allowNull: true, field: "expires_at" },
  revokedAt: { type: DataTypes.DATE, allowNull: true, field: "revoked_at" },
}, { sequelize, modelName: "VtcModerationAction", tableName: "vtc_moderation_actions", underscored: true });

export class PlatformRecord extends Model { declare id: number; }
PlatformRecord.init({
  id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  scopeType: { type: DataTypes.STRING(16), allowNull: false, field: "scope_type" },
  scopeId: { type: DataTypes.STRING(80), allowNull: false, field: "scope_id" },
  category: { type: DataTypes.STRING(64), allowNull: false },
  key: { type: DataTypes.STRING(120), allowNull: false },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "active" },
  data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  createdByUserId: { type: DataTypes.INTEGER, allowNull: true, field: "created_by_user_id" },
}, {
  sequelize,
  modelName: "PlatformRecord",
  tableName: "platform_records",
  underscored: true,
  indexes: [
    { fields: ["scope_type", "scope_id", "category"] },
    { unique: true, fields: ["scope_type", "scope_id", "category", "key"] },
  ],
});

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
  achievementChannelId: { type: DataTypes.STRING(32), allowNull: true, field: "achievement_channel_id" },
  convoyChannelId: { type: DataTypes.STRING(32), allowNull: true, field: "convoy_channel_id" },
  welcomeChannelId: { type: DataTypes.STRING(32), allowNull: true, field: "welcome_channel_id" },
  guildVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: "guild_verified" },
  featureToggles: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: "feature_toggles" },
  embedConfig: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: "embed_config" },
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

async function addColumnIfMissing(table: string, column: string, definition: any) {
  const queryInterface = sequelize.getQueryInterface();
  const description = await queryInterface.describeTable(table);
  if (!description[column]) {
    console.log("[db:migrate] adding missing column " + table + "." + column);
    await queryInterface.addColumn(table, column, definition);
  }
}

async function ensureModelColumns() {
  const queryInterface = sequelize.getQueryInterface();

  for (const model of Object.values(sequelize.models)) {
    const rawTable = model.getTableName() as any;
    const tableName = typeof rawTable === "string" ? rawTable : rawTable.tableName;

    let description: Record<string, unknown>;
    try {
      description = await queryInterface.describeTable(rawTable);
    } catch (cause) {
      // sequelize.sync() should have created the table. If it did not, let the
      // normal startup failure surface with useful context.
      console.error("[db:migrate] unable to describe table", tableName, cause);
      throw cause;
    }

    for (const attribute of Object.values((model as any).rawAttributes) as any[]) {
      const column = String(attribute.field || attribute.fieldName || "");
      if (!column || description[column]) continue;

      console.log("[db:migrate] repairing schema: " + tableName + "." + column);
      await queryInterface.addColumn(rawTable, column, {
        type: attribute.type,
        allowNull: attribute.allowNull,
        defaultValue: attribute.defaultValue,
        unique: attribute.unique,
        primaryKey: attribute.primaryKey,
        autoIncrement: attribute.autoIncrement,
        references: attribute.references,
        onUpdate: attribute.onUpdate,
        onDelete: attribute.onDelete,
        comment: attribute.comment,
      });

      // Keep our local description current so duplicated mapped fields are not
      // attempted twice in the same boot.
      description[column] = true;
    }
  }
}

async function ensureUpgradeColumns() {
  // Repair every Sequelize model, not just a hand-maintained list. This makes
  // upgrades safe when new model fields are added in future releases.
  await ensureModelColumns();

  // Explicit guards remain for data migrations which depend on these fields.
  await addColumnIfMissing("jobs", "expenses", { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 });
  await addColumnIfMissing("jobs", "profit", { type: DataTypes.BIGINT, allowNull: true });
}

const migrations: Array<{ version: number; name: string; run: () => Promise<void> }> = [
  {
    version: 1,
    name: "baseline-schema-versioning",
    run: async () => {
      // Baseline migration: sequelize.sync() creates the current schema.
      // Future migrations are appended here and run once in version order.
    },
  },
  {
    version: 2,
    name: "normalize-job-profit",
    run: async () => {
      await addColumnIfMissing("jobs", "expenses", { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 });
      await addColumnIfMissing("jobs", "profit", { type: DataTypes.BIGINT, allowNull: true });
      await sequelize.query(
        `UPDATE jobs
         SET profit = COALESCE(income, 0) - COALESCE(expenses, 0)
         WHERE profit IS NULL`,
      );
    },
  },
  {
    version: 3,
    name: "backfill-columns-added-to-existing-installations",
    run: async () => {
      await ensureUpgradeColumns();
    },
  },
];

async function runMigrations() {
  const applied = new Set(
    (await SchemaVersion.findAll({ attributes: ["version"] }))
      .map((row) => Number(row.getDataValue("version"))),
  );

  for (const migration of migrations.sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;

    console.log("[db:migrate] running v" + migration.version + " " + migration.name);
    try {
      await migration.run();
      await SchemaVersion.findOrCreate({
        where: { version: migration.version },
        defaults: {
          version: migration.version,
          name: migration.name,
        },
      });
      console.log("[db:migrate] completed v" + migration.version);
    } catch (cause) {
      console.error("[db:migrate] failed v" + migration.version + " " + migration.name, cause);
      throw cause;
    }
  }
}

export async function initDatabase() {
  await sequelize.authenticate();

  // First create any tables that are entirely new in this release.
  await sequelize.sync();

  // Then repair existing tables BEFORE any migration or bootstrap query can
  // reference fields introduced by a newer OpenHaul image.
  await ensureUpgradeColumns();

  // Data migrations are idempotent/versioned and only run after the schema is
  // guaranteed to contain every current model column.
  await runMigrations();

  await bootstrapVtc();
  await bootstrapDonationGoal();
}
