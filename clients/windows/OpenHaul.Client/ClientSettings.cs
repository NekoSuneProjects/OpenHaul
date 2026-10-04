using System.Text.Json;

namespace OpenHaul.Client;

public sealed class ClientSettings
{
    public const string DefaultApiUrl = "https://openhaul.nekosunevr.co.uk";

    public string ApiUrl { get; set; } = DefaultApiUrl;
    public string ClientToken { get; set; } = "";
    public string SteamId { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string? AvatarUrl { get; set; }
    public string PipeName { get; set; } = "OpenHaulTelemetry";
    public bool OverlayEnabled { get; set; } = true;
    public string OverlayHotkey { get; set; } = "F8";
    public bool OverlayMapEnabled { get; set; } = true;
    public string OverlayMapType { get; set; } = "road";
    public string OverlayMapSize { get; set; } = "medium";
    public bool OverlayTrafficAlerts { get; set; } = true;
    public bool OverlayStaffAlerts { get; set; } = true;
    public bool OverlayCargoMissions { get; set; } = true;

    public static string SettingsDirectory =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OpenHaul");

    public static string SettingsPath => Path.Combine(SettingsDirectory, "client.json");

    public static ClientSettings Load()
    {
        try
        {
            if (!File.Exists(SettingsPath))
                return FromEnvironment(new ClientSettings());

            var json = File.ReadAllText(SettingsPath);
            var settings = JsonSerializer.Deserialize<ClientSettings>(json) ?? new ClientSettings();
            return FromEnvironment(settings);
        }
        catch
        {
            return FromEnvironment(new ClientSettings());
        }
    }

    private static ClientSettings FromEnvironment(ClientSettings settings)
    {
        var api = Environment.GetEnvironmentVariable("OPENHAUL_API_URL");
        var token = Environment.GetEnvironmentVariable("OPENHAUL_CLIENT_TOKEN");
        var pipe = Environment.GetEnvironmentVariable("OPENHAUL_PIPE_NAME");

        if (!string.IsNullOrWhiteSpace(api)) settings.ApiUrl = api;
        if (!string.IsNullOrWhiteSpace(token)) settings.ClientToken = token;
        if (!string.IsNullOrWhiteSpace(pipe)) settings.PipeName = pipe;

        if (string.IsNullOrWhiteSpace(settings.ApiUrl))
            settings.ApiUrl = DefaultApiUrl;

        return settings;
    }

    public void Save()
    {
        Directory.CreateDirectory(SettingsDirectory);
        var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(SettingsPath, json);
    }

    public ClientConfig ToConfig() => new(
        ApiUrl,
        "",
        ClientToken,
        string.IsNullOrWhiteSpace(SteamId) ? Environment.UserName : SteamId,
        string.IsNullOrWhiteSpace(DisplayName) ? Environment.UserName : DisplayName,
        null,
        null,
        null,
        PipeName
    );
}
