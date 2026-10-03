using System.Diagnostics;
using System.Net.Http.Json;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json.Serialization;

namespace OpenHaul.Client;

public sealed class UpdateManager
{
    public const string DefaultManifestUrl =
        "https://github.com/NekoSuneProjects/OpenHaul/releases/download/windows-client/client-manifest.json";

    private readonly HttpClient _http = new()
    {
        Timeout = TimeSpan.FromMinutes(10),
    };

    public event Action<string>? Status;
    public event Action<int>? Progress;

    public UpdateManager()
    {
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("OpenHaul.Client-Updater/1.0");
    }

    public static Version CurrentVersion =>
        Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 0, 0, 0);

    public async Task<ClientUpdateManifest?> CheckAsync(CancellationToken token)
    {
        try
        {
            Status?.Invoke("Checking for OpenHaul updates…");
            using var response = await _http.GetAsync(
                DefaultManifestUrl + "?t=" + DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                HttpCompletionOption.ResponseHeadersRead,
                token);

            if (!response.IsSuccessStatusCode)
            {
                Status?.Invoke("Update service unavailable. Using installed version.");
                return null;
            }

            var manifest = await response.Content.ReadFromJsonAsync<ClientUpdateManifest>(
                cancellationToken: token);

            if (manifest is null || manifest.SchemaVersion != 1)
            {
                Status?.Invoke("Update manifest is invalid.");
                return null;
            }

            Status?.Invoke("Update check complete.");
            return manifest;
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            Status?.Invoke("Update check failed: " + ex.Message);
            return null;
        }
    }

    public static bool IsClientUpdateAvailable(ClientUpdateManifest manifest)
    {
        return Version.TryParse(manifest.Client.Version, out var remote) &&
               remote > CurrentVersion;
    }

    public async Task DownloadAndInstallClientAsync(
        ClientUpdateManifest manifest,
        CancellationToken token)
    {
        var updatesDirectory = Path.Combine(ClientSettings.SettingsDirectory, "updates");
        Directory.CreateDirectory(updatesDirectory);

        var installer = Path.Combine(updatesDirectory, "OpenHaul-Setup.exe");
        await DownloadVerifiedAsync(
            manifest.Client.InstallerUrl,
            installer,
            manifest.Client.Sha256,
            token);

        Status?.Invoke("Starting OpenHaul updater…");

        Process.Start(new ProcessStartInfo(installer)
        {
            UseShellExecute = true,
            Arguments = "/VERYSILENT /SUPPRESSMSGBOXES /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /SP-",
        });

        Application.Exit();
    }

    public async Task<TelemetryUpdateResult> EnsureTelemetryAsync(
        ClientUpdateManifest manifest,
        CancellationToken token)
    {
        var telemetryDirectory = Path.Combine(ClientSettings.SettingsDirectory, "telemetry");
        Directory.CreateDirectory(telemetryDirectory);

        var cachedDll = Path.Combine(telemetryDirectory, "OpenHaul.Telemetry.dll");
        var currentHash = File.Exists(cachedDll)
            ? await Sha256Async(cachedDll, token)
            : "";

        if (!currentHash.Equals(manifest.Telemetry.Sha256, StringComparison.OrdinalIgnoreCase))
        {
            Status?.Invoke("Downloading telemetry plugin update…");
            await DownloadVerifiedAsync(
                manifest.Telemetry.Url,
                cachedDll,
                manifest.Telemetry.Sha256,
                token);
        }

        var gameInstalls = GameLocator.FindInstalledGames();
        var installed = new List<string>();
        var failures = new List<string>();

        foreach (var game in gameInstalls)
        {
            var pluginDirectory = Path.Combine(game.Path, "bin", "win_x64", "plugins");
            var destination = Path.Combine(pluginDirectory, "OpenHaul.Telemetry.dll");

            try
            {
                Directory.CreateDirectory(pluginDirectory);

                var destinationHash = File.Exists(destination)
                    ? await Sha256Async(destination, token)
                    : "";

                if (!destinationHash.Equals(manifest.Telemetry.Sha256, StringComparison.OrdinalIgnoreCase))
                {
                    File.Copy(cachedDll, destination, overwrite: true);
                    installed.Add(destination);
                }
            }
            catch (Exception ex)
            {
                failures.Add(game.Game.ToUpperInvariant() + ": " + ex.Message);
            }
        }

        if (failures.Count > 0)
        {
            return new TelemetryUpdateResult(
                false,
                manifest.Telemetry.Version,
                installed,
                failures,
                cachedDll);
        }

        Status?.Invoke(
            installed.Count > 0
                ? "Telemetry plugin updated."
                : "Telemetry plugin is up to date.");

        return new TelemetryUpdateResult(
            true,
            manifest.Telemetry.Version,
            installed,
            failures,
            cachedDll);
    }

    public static async Task<string> Sha256Async(string path, CancellationToken token = default)
    {
        await using var stream = File.OpenRead(path);
        using var sha = SHA256.Create();
        var hash = await sha.ComputeHashAsync(stream, token);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private async Task DownloadVerifiedAsync(
        string url,
        string destination,
        string expectedSha256,
        CancellationToken token)
    {
        var temporary = destination + ".download";
        if (File.Exists(temporary)) File.Delete(temporary);

        using var response = await _http.GetAsync(
            url,
            HttpCompletionOption.ResponseHeadersRead,
            token);

        response.EnsureSuccessStatusCode();

        var total = response.Content.Headers.ContentLength;
        await using var input = await response.Content.ReadAsStreamAsync(token);
        await using var output = new FileStream(
            temporary,
            FileMode.Create,
            FileAccess.Write,
            FileShare.None,
            1024 * 128,
            useAsync: true);

        var buffer = new byte[1024 * 128];
        long written = 0;

        while (true)
        {
            var read = await input.ReadAsync(buffer, token);
            if (read <= 0) break;

            await output.WriteAsync(buffer.AsMemory(0, read), token);
            written += read;

            if (total is > 0)
            {
                var percent = (int)Math.Clamp(written * 100 / total.Value, 0, 100);
                Progress?.Invoke(percent);
            }
        }

        await output.FlushAsync(token);

        var actual = await Sha256Async(temporary, token);
        if (!actual.Equals(expectedSha256, StringComparison.OrdinalIgnoreCase))
        {
            File.Delete(temporary);
            throw new InvalidOperationException(
                $"Downloaded update checksum mismatch. Expected {expectedSha256}, got {actual}.");
        }

        if (File.Exists(destination)) File.Delete(destination);
        File.Move(temporary, destination);
        Progress?.Invoke(100);
    }
}

public sealed record TelemetryUpdateResult(
    bool Success,
    string Version,
    IReadOnlyList<string> Installed,
    IReadOnlyList<string> Failures,
    string CachedDll);

public sealed record ClientUpdateManifest(
    [property: JsonPropertyName("schemaVersion")] int SchemaVersion,
    [property: JsonPropertyName("publishedAt")] DateTimeOffset PublishedAt,
    [property: JsonPropertyName("client")] ClientRelease Client,
    [property: JsonPropertyName("telemetry")] TelemetryRelease Telemetry);

public sealed record ClientRelease(
    [property: JsonPropertyName("version")] string Version,
    [property: JsonPropertyName("mandatory")] bool Mandatory,
    [property: JsonPropertyName("installerUrl")] string InstallerUrl,
    [property: JsonPropertyName("sha256")] string Sha256);

public sealed record TelemetryRelease(
    [property: JsonPropertyName("version")] string Version,
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("sha256")] string Sha256);
