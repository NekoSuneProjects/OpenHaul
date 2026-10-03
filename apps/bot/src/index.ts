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
const apiKey = process.env.OPENHAUL_VTC_API_KEY?.trim();
const fineChannelId = process.env.DISCORD_FINE_CHANNEL_ID?.trim();
const jobChannelId = process.env.DISCORD_JOB_CHANNEL_ID?.trim();
const driverChannelId = process.env.DISCORD_DRIVER_CHANNEL_ID?.trim();

if (!token) {
  console.log("OpenHaul bot disabled: DISCORD_BOT_TOKEN is empty.");
  process.exit(0);
}

if (!apiKey) {
  console.warn("OPENHAUL_VTC_API_KEY is empty; VTC polling will be disabled.");
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let lastFineId: string | null = null;
let lastJobId: string | null = null;
let knownDrivers: Map<string, any> | null = null;

async function apiGet(path: string) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  if (!response.ok) throw new Error(`OpenHaul API ${response.status} for ${path}`);
  return response.json();
}

async function textChannel(id?: string) {
  if (!id) return null;
  const channel = await client.channels.fetch(id).catch(() => null);
  return channel?.isTextBased() ? channel as TextChannel : null;
}

function fineTitle(type: string) {
  return ({
    red_light: "Red light offence",
    speeding: "Speeding fine",
    wrong_way: "Wrong-way offence",
    collision: "Collision penalty",
    parking: "Parking offence",
    toll: "Toll charge",
    other: "Driver penalty",
  } as Record<string,string>)[type] ?? type;
}

async function pollFines() {
  if (!apiKey || !fineChannelId) return;
  const data = await apiGet("/api/v1/vtc/fines");
  const fines = Array.isArray(data.fines) ? data.fines : [];
  if (!fines.length) return;

  const newest = String(fines[0].id);
  if (lastFineId === null) {
    lastFineId = newest;
    return;
  }

  const fresh = fines.filter((f: any) => String(f.id) !== lastFineId);
  if (!fresh.length) return;

  const channel = await textChannel(fineChannelId);
  for (const fine of fresh.reverse()) {
    const embed = new EmbedBuilder()
      .setTitle("🚨 VTC driver fine")
      .addFields(
        { name: "Driver", value: String(fine.driverId), inline: true },
        { name: "Offence", value: fineTitle(String(fine.type)), inline: true },
        { name: "Amount", value: `${fine.currency ?? "EUR"} ${fine.amount ?? 0}`, inline: true },
        { name: "Game", value: String(fine.game ?? "unknown").toUpperCase(), inline: true },
        { name: "Location", value: String(fine.city ?? "Unknown"), inline: true },
      )
      .setTimestamp(new Date(fine.occurredAt ?? Date.now()));
    await channel?.send({ embeds: [embed] });
  }
  lastFineId = newest;
}

async function pollJobs() {
  if (!apiKey || !jobChannelId) return;
  const data = await apiGet("/api/v1/vtc/jobs");
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  if (!jobs.length) return;

  const newest = String(jobs[0].id);
  if (lastJobId === null) {
    lastJobId = newest;
    return;
  }

  const fresh = jobs.filter((j: any) => String(j.id) !== lastJobId);
  if (!fresh.length) return;

  const channel = await textChannel(jobChannelId);
  for (const job of fresh.reverse()) {
    const embed = new EmbedBuilder()
      .setTitle("✅ Job completed")
      .addFields(
        { name: "Driver", value: String(job.driverId), inline: true },
        { name: "Game", value: String(job.game ?? "unknown").toUpperCase(), inline: true },
        { name: "Cargo", value: String(job.cargo ?? "Unknown"), inline: false },
        { name: "Route", value: `${job.sourceCity ?? "Unknown"} → ${job.destinationCity ?? "Unknown"}`, inline: false },
        { name: "Distance", value: job.distanceKm == null ? "Unknown" : `${Math.round(Number(job.distanceKm))} km`, inline: true },
      )
      .setTimestamp(new Date(job.completedAt ?? Date.now()));
    await channel?.send({ embeds: [embed] });
  }
  lastJobId = newest;
}

async function pollPresence() {
  if (!apiKey || !driverChannelId) return;

  const data = await apiGet("/api/v1/vtc/live");
  const drivers = Array.isArray(data.drivers) ? data.drivers : [];
  const current = new Map<string, any>(drivers.map((driver: any) => [String(driver.driverId), driver]));

  if (knownDrivers === null) {
    knownDrivers = current;
    return;
  }

  const channel = await textChannel(driverChannelId);

  for (const [driverId, driver] of current) {
    if (knownDrivers.has(driverId)) continue;

    const embed = new EmbedBuilder()
      .setTitle("🟢 Driver online")
      .setDescription(`**${driver.username ?? driverId}** started driving in ${String(driver.game ?? "ETS2/ATS").toUpperCase()}.`)
      .addFields(
        { name: "Truck", value: String(driver.truck ?? "Unknown"), inline: true },
        { name: "Server", value: String(driver.server ?? "Singleplayer / unknown"), inline: true },
        { name: "Route", value: driver.sourceCity && driver.destinationCity ? `${driver.sourceCity} → ${driver.destinationCity}` : "No active route", inline: false },
      )
      .setTimestamp();

    await channel?.send({ embeds: [embed] });
  }

  for (const [driverId, previous] of knownDrivers) {
    if (current.has(driverId)) continue;

    const embed = new EmbedBuilder()
      .setTitle("⚫ Driver offline")
      .setDescription(`**${previous.username ?? driverId}** stopped sending OpenHaul telemetry.`)
      .setTimestamp();

    await channel?.send({ embeds: [embed] });
  }

  knownDrivers = current;
}

async function registerCommands() {
  if (!client.user) return;
  const commands = [
    new SlashCommandBuilder().setName("openhaul").setDescription("Show this server's OpenHaul VTC status"),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(token!);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
}

client.once("ready", async () => {
  console.log(`OpenHaul bot logged in as ${client.user?.tag}`);
  await registerCommands().catch(console.error);

  setInterval(() => pollFines().catch(console.error), 8000);
  setInterval(() => pollJobs().catch(console.error), 10000);
  setInterval(() => pollPresence().catch(console.error), 12000);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "openhaul") return;
  await interaction.deferReply({ ephemeral: true });

  try {
    const data = await apiGet("/api/v1/vtc/me");
    const vtc = data.vtc;
    await interaction.editReply(
      vtc
        ? `OpenHaul connected to **${vtc.name}**${vtc.tag ? ` [${vtc.tag}]` : ""}. Scopes: ${(data.scopes ?? []).join(", ") || "none"}`
        : "OpenHaul is connected, but no VTC record was returned."
    );
  } catch (error) {
    await interaction.editReply("OpenHaul API connection failed. Check OPENHAUL_API_URL and OPENHAUL_VTC_API_KEY.");
  }
});

await client.login(token);
