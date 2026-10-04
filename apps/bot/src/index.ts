import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN?.trim();
const apiUrl = process.env.OPENHAUL_API_URL ?? "http://localhost:3001";
const serviceKey = process.env.OPENHAUL_BOT_SERVICE_KEY?.trim();
const appUrl = (process.env.OPENHAUL_APP_URL ?? apiUrl).replace(/\/$/, "");

if (!token) {
  console.log("OpenHaul bot disabled: DISCORD_BOT_TOKEN is empty.");
  process.exit(0);
}

if (!serviceKey) {
  console.warn("OPENHAUL_BOT_SERVICE_KEY is empty; multi-VTC Discord integration is disabled.");
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

type BotConfig = {
  vtcId: number;
  guildId?: string | null;
  logChannelId?: string | null;
  jobChannelId?: string | null;
  fineChannelId?: string | null;
  applicationChannelId?: string | null;
  moderationChannelId?: string | null;
  driverChannelId?: string | null;
  achievementChannelId?: string | null;
  convoyChannelId?: string | null;
  welcomeChannelId?: string | null;
  guildVerified?: boolean;
  featureToggles?: Record<string, boolean>;
  embedConfig?: Record<string, any>;
  enabled: boolean;
  Vtc?: {
    id: number;
    name: string;
    tag?: string | null;
    recruitmentOpen?: boolean;
  };
};

let configs = new Map<number, BotConfig>();
let configsByGuild = new Map<string, BotConfig>();
let lastEventId = 0;
const knownDrivers = new Map<number, Map<string, any>>();

async function botGet(path: string) {
  if (!serviceKey) throw new Error("OpenHaul bot service key is missing.");
  const response = await fetch(apiUrl + path, {
    headers: { "x-bot-key": serviceKey },
  });
  if (!response.ok) throw new Error(`OpenHaul bot API ${response.status} for ${path}`);
  return response.json();
}

async function botRequest(path: string, method: "POST" | "PATCH", body: unknown) {
  if (!serviceKey) throw new Error("OpenHaul bot service key is missing.");
  const response = await fetch(apiUrl + path, {
    method,
    headers: { "x-bot-key": serviceKey, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`OpenHaul bot API ${response.status} for ${path}`);
  return response.json();
}

async function publicGet(path: string) {
  const response = await fetch(apiUrl + path);
  if (!response.ok) throw new Error(`OpenHaul API ${response.status} for ${path}`);
  return response.json();
}

async function textChannel(id?: string | null) {
  if (!id) return null;
  const channel = await client.channels.fetch(id).catch(() => null);
  return channel?.isTextBased() ? channel as TextChannel : null;
}

function eventChannel(config: BotConfig, type: string) {
  if (type === "fine") return config.fineChannelId || config.logChannelId;
  if (type.startsWith("job.")) return config.jobChannelId || config.logChannelId;
  if (type.startsWith("application.")) return config.applicationChannelId || config.logChannelId;
  if (type.startsWith("moderation.")) return config.moderationChannelId || config.logChannelId;
  if (type.startsWith("achievement.") || type.startsWith("challenge.")) return config.achievementChannelId || config.logChannelId;
  if (type.startsWith("convoy.") || type.startsWith("event.")) return config.convoyChannelId || config.logChannelId;
  if (type === "member.joined" || type === "member.left" || type === "member.kicked") return config.welcomeChannelId || config.logChannelId;
  return config.logChannelId;
}

function eventEmbed(event: any, config?: BotConfig) {
  const type = String(event.type ?? "activity");
  const title =
    type === "fine" ? "🚨 Driver penalty" :
    type.startsWith("job.") ? "✅ Delivery completed" :
    type.startsWith("application.") ? "📨 Recruitment update" :
    type.startsWith("moderation.") ? "🛡️ Moderation update" :
    type === "profile.name_changed" ? "✏️ Driver name changed" :
    type.startsWith("member.") ? "👥 VTC membership update" :
    "📋 VTC activity";

  const customTitle = config?.embedConfig?.[type]?.title;
  const embed = new EmbedBuilder()
    .setTitle(String(customTitle || title))
    .setDescription(String(event.title ?? type))
    .setTimestamp(new Date(event.occurredAt ?? Date.now()));
  if (config?.embedConfig?.footer) embed.setFooter({ text: String(config.embedConfig.footer).slice(0, 2048) });

  if (event.detail) embed.addFields({ name: "Details", value: String(event.detail).slice(0, 1024) });
  if (event.driverId) embed.addFields({ name: "Driver", value: String(event.driverId), inline: true });
  if (event.amount != null) {
    embed.addFields({
      name: type === "fine" ? "Penalty" : "Amount",
      value: `${event.currency ?? ""} ${Number(event.amount).toLocaleString()}`.trim(),
      inline: true,
    });
  }

  const meta = event.metadata ?? {};
  if (type.startsWith("job.") && meta.cargo) {
    embed.addFields(
      { name: "Cargo", value: String(meta.cargo), inline: false },
      {
        name: "Route",
        value: meta.sourceCity && meta.destinationCity
          ? `${meta.sourceCity} → ${meta.destinationCity}`
          : "Unknown",
        inline: false,
      },
      { name: "Distance", value: meta.distanceKm == null ? "Unknown" : `${Math.round(Number(meta.distanceKm))} km`, inline: true },
    );
  }
  return embed;
}

async function refreshConfigs() {
  if (!serviceKey) return;
  const data = await botGet("/api/v1/bot/vtcs");
  const list = Array.isArray(data.configs) ? data.configs : [];
  configs = new Map(list.map((item: BotConfig) => [Number(item.vtcId), item]));
  configsByGuild = new Map(
    list.filter((item: BotConfig) => item.guildId).map((item: BotConfig) => [String(item.guildId), item]),
  );

  for (const config of list) {
    if (!config.guildId) continue;
    const verified = client.guilds.cache.has(config.guildId);
    if (verified !== Boolean(config.guildVerified)) {
      await botRequest("/api/v1/bot/vtcs/" + config.vtcId + "/verify-guild", "POST", {
        guildId: config.guildId,
        verified,
      }).catch(() => {});
      config.guildVerified = verified;
    }
  }
}

async function pollActivity() {
  if (!serviceKey || !configs.size) return;
  const data = await botGet("/api/v1/bot/events?after=" + lastEventId);
  const events = Array.isArray(data.events) ? data.events : [];
  if (lastEventId === 0 && events.length) {
    lastEventId = Number(events[events.length - 1].id ?? 0);
    return;
  }
  for (const event of events) {
    lastEventId = Math.max(lastEventId, Number(event.id ?? 0));
    const config = configs.get(Number(event.vtcId));
    if (!config) continue;
    const channel = await textChannel(eventChannel(config, String(event.type ?? "")));
    if (!channel) continue;
    await channel.send({ embeds: [eventEmbed(event, config)] }).catch(console.error);
  }
}

async function pollPresenceFor(config: BotConfig) {
  if (!config.driverChannelId) return;
  const data = await publicGet(`/api/v1/public/vtcs/${config.vtcId}/live`);
  const drivers = Array.isArray(data.drivers) ? data.drivers : [];
  const current = new Map<string, any>(drivers.map((driver: any) => [String(driver.driverId), driver]));
  const previous = knownDrivers.get(config.vtcId);

  if (!previous) {
    knownDrivers.set(config.vtcId, current);
    return;
  }

  const channel = await textChannel(config.driverChannelId);
  if (!channel) return;

  for (const [driverId, driver] of current) {
    if (previous.has(driverId)) continue;
    const embed = new EmbedBuilder()
      .setTitle("🟢 Driver online")
      .setDescription(`**${driver.username ?? driverId}** started driving in ${String(driver.game ?? "ETS2/ATS").toUpperCase()}.`)
      .addFields(
        { name: "Truck", value: String(driver.truck ?? "Unknown"), inline: true },
        { name: "Cargo", value: String(driver.cargo ?? "No cargo"), inline: true },
        {
          name: "Route",
          value: driver.sourceCity && driver.destinationCity
            ? `${driver.sourceCity} → ${driver.destinationCity}`
            : "No active route",
          inline: false,
        },
      )
      .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(console.error);
  }

  for (const [driverId, previousDriver] of previous) {
    if (current.has(driverId)) continue;
    const embed = new EmbedBuilder()
      .setTitle("⚫ Driver offline")
      .setDescription(`**${previousDriver.username ?? driverId}** stopped sending OpenHaul telemetry.`)
      .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(console.error);
  }

  knownDrivers.set(config.vtcId, current);
}

async function pollPresence() {
  await Promise.all([...configs.values()].map((config) => pollPresenceFor(config).catch(console.error)));
}

async function registerCommands() {
  if (!client.user) return;
  const commands = [
    new SlashCommandBuilder().setName("openhaul").setDescription("Show this Discord server's OpenHaul VTC"),
    new SlashCommandBuilder().setName("leaderboard").setDescription("Show this VTC's distance leaderboard"),
    new SlashCommandBuilder().setName("drivers").setDescription("Show currently live VTC drivers"),
    new SlashCommandBuilder().setName("stats").setDescription("Show this VTC's OpenHaul statistics"),
    new SlashCommandBuilder().setName("driver").setDescription("Look up an OpenHaul driver")
      .addStringOption((option) => option.setName("steamid").setDescription("SteamID64").setRequired(true)),
    new SlashCommandBuilder().setName("recentjob").setDescription("Show a driver's most recent job")
      .addStringOption((option) => option.setName("steamid").setDescription("SteamID64").setRequired(true)),
    new SlashCommandBuilder().setName("applications").setDescription("List pending VTC applications"),
    new SlashCommandBuilder().setName("application").setDescription("Approve or reject a VTC application")
      .addIntegerOption((option) => option.setName("id").setDescription("Application ID").setRequired(true))
      .addStringOption((option) => option.setName("decision").setDescription("Decision").setRequired(true)
        .addChoices({ name: "Approve", value: "approved" }, { name: "Reject", value: "rejected" })),
    new SlashCommandBuilder().setName("apply").setDescription("Get the application link for this VTC"),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(token!);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
}

client.once("ready", async () => {
  console.log(`OpenHaul bot logged in as ${client.user?.tag}`);
  await registerCommands().catch(console.error);
  await refreshConfigs().catch(console.error);

  setInterval(() => refreshConfigs().catch(console.error), 60_000);
  setInterval(() => pollActivity().catch(console.error), 7_000);
  setInterval(() => pollPresence().catch(console.error), 12_000);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const config = interaction.guildId ? configsByGuild.get(interaction.guildId) : undefined;

  await interaction.deferReply({ ephemeral: interaction.commandName === "openhaul" || interaction.commandName === "apply" });

  try {
    if (!config) {
      await interaction.editReply("This Discord server is not linked to an OpenHaul VTC yet.");
      return;
    }

    const vtc = config.Vtc;
    if (interaction.commandName === "openhaul") {
      await interaction.editReply(
        `OpenHaul is linked to **${vtc?.name ?? "VTC #" + config.vtcId}**${vtc?.tag ? ` [${vtc.tag}]` : ""}.`
      );
      return;
    }

    if (interaction.commandName === "stats") {
      const stats = await publicGet(`/api/v1/public/vtcs/${config.vtcId}/stats`);
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle("📊 VTC statistics")
          .addFields(
            { name: "Live drivers", value: String(stats.liveDrivers ?? 0), inline: true },
            { name: "Jobs", value: Number(stats.jobs ?? 0).toLocaleString(), inline: true },
            { name: "Distance", value: Math.round(Number(stats.distanceKm ?? 0)).toLocaleString() + " km", inline: true },
            { name: "Income", value: Number(stats.income ?? 0).toLocaleString(), inline: true },
            { name: "Fines", value: Number(stats.fines ?? 0).toLocaleString(), inline: true },
          ).setTimestamp()],
      });
      return;
    }

    if (interaction.commandName === "driver" || interaction.commandName === "recentjob") {
      const steamId = interaction.options.getString("steamid", true);
      const driver = await publicGet("/api/v1/public/drivers/" + encodeURIComponent(steamId));
      if (interaction.commandName === "driver") {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setTitle("🚛 " + String(driver.user?.displayName ?? steamId))
            .setDescription("SteamID " + steamId)
            .addFields(
              { name: "Jobs", value: Number(driver.stats?.jobs ?? 0).toLocaleString(), inline: true },
              { name: "Distance", value: Math.round(Number(driver.stats?.distanceKm ?? 0)).toLocaleString() + " km", inline: true },
              { name: "Net", value: Number(driver.stats?.netIncome ?? 0).toLocaleString(), inline: true },
              { name: "Status", value: driver.live ? "Online / driving" : "Offline", inline: true },
            ).setTimestamp()],
        });
      } else {
        const job = driver.recentJobs?.[0];
        await interaction.editReply(job ? {
          embeds: [new EmbedBuilder()
            .setTitle("📦 Recent delivery")
            .setDescription(String(job.cargo ?? "Unknown cargo"))
            .addFields(
              { name: "Route", value: String(job.sourceCity ?? "Unknown") + " → " + String(job.destinationCity ?? "Unknown") },
              { name: "Distance", value: Math.round(Number(job.distanceKm ?? 0)).toLocaleString() + " km", inline: true },
              { name: "Income", value: Number(job.income ?? 0).toLocaleString(), inline: true },
            ).setTimestamp(new Date(job.completedAt ?? Date.now()))],
        } : "No completed jobs were found for that driver.");
      }
      return;
    }

    if (interaction.commandName === "applications") {
      const data = await botGet("/api/v1/bot/vtcs/" + config.vtcId + "/applications");
      const applications = Array.isArray(data.applications) ? data.applications : [];
      if (!applications.length) {
        await interaction.editReply("No pending VTC applications.");
        return;
      }
      await interaction.editReply({
        embeds: [new EmbedBuilder().setTitle("📨 Pending VTC applications").setDescription(
          applications.slice(0, 20).map((application: any) => {
            const user = application.User ?? application.user;
            return "#" + application.id + " · **" + (user?.displayName ?? user?.steamId ?? "Applicant") + "**\n" + (application.message || "No message");
          }).join("\n\n")
        ).setTimestamp()],
      });
      return;
    }

    if (interaction.commandName === "application") {
      const applicationId = interaction.options.getInteger("id", true);
      const decision = interaction.options.getString("decision", true);
      await botRequest("/api/v1/bot/vtcs/" + config.vtcId + "/applications/" + applicationId, "PATCH", { status: decision });
      await interaction.editReply("Application #" + applicationId + " " + decision + ".");
      return;
    }

    if (interaction.commandName === "apply") {
      if (vtc?.recruitmentOpen === false) {
        await interaction.editReply("Recruitment is currently closed for this VTC.");
        return;
      }
      await interaction.editReply(`Apply here: ${appUrl}/vtc/${config.vtcId}`);
      return;
    }

    if (interaction.commandName === "leaderboard") {
      const data = await publicGet(`/api/v1/public/vtcs/${config.vtcId}/leaderboard`);
      const drivers = Array.isArray(data.drivers) ? data.drivers.slice(0, 10) : [];
      if (!drivers.length) {
        await interaction.editReply("No completed jobs are available for this VTC yet.");
        return;
      }
      const description = drivers.map((driver: any, index: number) =>
        `**${index + 1}.** ${driver.driverId} — ${Math.round(Number(driver.distanceKm ?? 0)).toLocaleString()} km · ${driver.jobs ?? 0} jobs`
      ).join("\n");
      await interaction.editReply({
        embeds: [new EmbedBuilder().setTitle("🏆 VTC distance leaderboard").setDescription(description).setTimestamp()],
      });
      return;
    }

    if (interaction.commandName === "drivers") {
      const data = await publicGet(`/api/v1/public/vtcs/${config.vtcId}/live`);
      const drivers = Array.isArray(data.drivers) ? data.drivers : [];
      if (!drivers.length) {
        await interaction.editReply("No VTC drivers are currently sending OpenHaul telemetry.");
        return;
      }
      const description = drivers.slice(0, 20).map((driver: any) =>
        `**${driver.username ?? driver.driverId}** · ${String(driver.game ?? "").toUpperCase()} · ${Math.round(Number(driver.speedKph ?? 0))} km/h\n${driver.sourceCity && driver.destinationCity ? `${driver.sourceCity} → ${driver.destinationCity}` : driver.truck ?? "No active route"}`
      ).join("\n\n");
      await interaction.editReply({
        embeds: [new EmbedBuilder().setTitle(`🚛 Live VTC drivers (${drivers.length})`).setDescription(description).setTimestamp()],
      });
    }
  } catch (error) {
    console.error(error);
    await interaction.editReply("OpenHaul could not complete that request.");
  }
});

await client.login(token);
