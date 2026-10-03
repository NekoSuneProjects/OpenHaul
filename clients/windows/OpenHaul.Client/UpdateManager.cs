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

    public const string DefaultTelemetryManifestUrl =
        "https://github.com/NekoSuneProjects/OpenHaul/releases/download/scs-plugin/telemetry-manifest.json";

    private readonly HttpClient _http = new()
    {
        Timeout = TimeSpan.FromMinutes(10),
    };

    private readonly SemaphoreSlim _telemetryUpdateLock = new(1, 1);

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

            // Telemetry has its own release/update channel. A plugin-only build
            // becomes visible to clients immediately without requiring a launcher build.
            try
            {
                using var telemetryResponse = await _http.GetAsync(
                    DefaultTelemetryManifestUrl + "?t=" + DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                    HttpCompletionOption.ResponseHeadersRead,
                    token);

                if (telemetryResponse.IsSuccessStatusCode)
                {
                    var telemetryManifest =
                        await telemetryResponse.Content.ReadFromJsonAsync<TelemetryUpdateManifest>(
                            cancellationToken: token);

                    if (telemetryManifest is { SchemaVersion: 1 } &&
                        telemetryManifest.Telemetry is not null)
                    {
                        manifest = manifest with
                        {
                            Telemetry = telemetryManifest.Telemetry,
                        };
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // Fall back to the telemetry snapshot embedded in the client manifest.
                Status?.Invoke("Telemetry update feed unavailable; using bundled version metadata.");
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

        var installedUpdater = Path.Combine(AppContext.BaseDirectory, "OpenHaul.Updater.exe");
        if (!File.Exists(installedUpdater))
            throw new FileNotFoundException(
                "OpenHaul.Updater.exe is missing. Reinstall OpenHaul using the latest setup package.",
                installedUpdater);

        // Never execute the updater from the install directory. The installer
        // must be free to replace OpenHaul.Updater.exe while the update is running.
        var temporaryUpdater = Path.Combine(
            updatesDirectory,
            "OpenHaul.Updater-" + Guid.NewGuid().ToString("N") + ".exe");
        File.Copy(installedUpdater, temporaryUpdater, overwrite: true);

        var launcher = Environment.ProcessPath
            ?? Path.Combine(AppContext.BaseDirectory, "OpenHaul.Client.exe");

        Status?.Invoke("Handing update to OpenHaul Updater…");

        var arguments =
            "--pid " + Environment.ProcessId +
            " --installer \"" + installer + "\"" +
            " --restart \"" + launcher + "\"" +
            " --self \"" + temporaryUpdater + "\"";

        Process.Start(new ProcessStartInfo(temporaryUpdater)
        {
            UseShellExecute = true,
            Arguments = arguments,
            WorkingDirectory = updatesDirectory,
        });

        Application.Exit();
    }

    private static bool IsGameRunning(string game) =>
        game.Equals("ets2", StringComparison.OrdinalIgnoreCase)
            ? Process.GetProcessesByName("eurotrucks2").Length > 0
            : Process.GetProcessesByName("amtrucks").Length > 0;

    private static bool IsSharingViolation(IOException ex)
    {
        const int SharingViolation = 32;
        const int LockViolation = 33;
        var code = ex.HResult & 0xFFFF;
        return code is SharingViolation or LockViolation;
    }

    private static async Task ReplaceFileWithRetryAsync(
        string source,
        string destination,
        CancellationToken token)
    {
        Exception? last = null;

        for (var attempt = 0; attempt < 6; attempt++)
        {
            token.ThrowIfCancellationRequested();

            try
            {
                File.Move(source, destination, overwrite: true);
                return;
            }
            catch (IOException ex) when (IsSharingViolation(ex))
            {
                last = ex;
                await Task.Delay(250 * (attempt + 1), token);
            }
        }

        throw last ?? new IOException("Unable to replace update file.");
    }

    public async Task<TelemetryUpdateResult> EnsureTelemetryAsync(
        ClientUpdateManifest manifest,
        CancellationToken token)
    {
        await _telemetryUpdateLock.WaitAsync(token);
        string? temporaryDll = null;

        try
        {
            var safeHash = manifest.Telemetry.Sha256.Trim().ToLowerInvariant();
            if (safeHash.Length < 12)
                throw new InvalidOperationException("Telemetry update manifest checksum is invalid.");

            var updateDirectory = Path.Combine(
                ClientSettings.SettingsDirectory,
                "updates",
                "telemetry");

            Directory.CreateDirectory(updateDirectory);

            temporaryDll = Path.Combine(
                updateDirectory,
                "OpenHaul.Telemetry-" + safeHash[..12] + "-" +
                Guid.NewGuid().ToString("N") + ".dll");

            Status?.Invoke("Downloading telemetry plugin update…");
            await DownloadVerifiedAsync(
                manifest.Telemetry.Url,
                temporaryDll,
                safeHash,
                token);

            var gameInstalls = GameLocator.FindInstalledGames();
            var installed = new List<string>();
            var failures = new List<string>();
            var deferred = new List<string>();

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

                    if (destinationHash.Equals(safeHash, StringComparison.OrdinalIgnoreCase))
                        continue;

                    if (IsGameRunning(game.Game))
                    {
                        deferred.Add(game.Game.ToUpperInvariant() +
                            ": update will apply after the game closes");
                        continue;
                    }

                    await InstallTelemetryAtomicallyAsync(
                        temporaryDll,
                        destination,
                        safeHash,
                        token);

                    installed.Add(destination);
                }
                catch (IOException ex) when (IsSharingViolation(ex))
                {
                    deferred.Add(game.Game.ToUpperInvariant() +
                        ": plugin is in use and will update after the game closes");
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
                    deferred,
                    temporaryDll);
            }

            Status?.Invoke(
                deferred.Count > 0
                    ? "Telemetry update deferred until the game closes."
                    : installed.Count > 0
                        ? "Telemetry plugin updated."
                        : "Telemetry plugin is up to date.");

            return new TelemetryUpdateResult(
                true,
                manifest.Telemetry.Version,
                installed,
                failures,
                deferred,
                temporaryDll);
        }
        finally
        {
            if (!string.IsNullOrWhiteSpace(temporaryDll))
            {
                try
                {
                    if (File.Exists(temporaryDll))
                        File.Delete(temporaryDll);
                }
                catch
                {
                    // Temporary cleanup must never make an update fail.
                }
            }

            _telemetryUpdateLock.Release();
        }
    }

    private static async Task InstallTelemetryAtomicallyAsync(
        string source,
        string destination,
        string expectedSha256,
        CancellationToken token)
    {
        var temporary = destination + ".openhaul-update";

        try
        {
            if (File.Exists(temporary))
                File.Delete(temporary);

            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            File.Copy(source, temporary, overwrite: true);

            var stagedHash = await Sha256Async(temporary, token);
            if (!stagedHash.Equals(expectedSha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Staged telemetry plugin checksum mismatch.");

            File.Move(temporary, destination, overwrite: true);
        }
        finally
        {
            try
            {
                if (File.Exists(temporary))
                    File.Delete(temporary);
            }
            catch
            {
                // Cleanup must not turn a successful update into a failure.
            }
        }
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
        var temporary = destination + "." + Guid.NewGuid().ToString("N") + ".download";

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

        await ReplaceFileWithRetryAsync(temporary, destination, token);
        Progress?.Invoke(100);
    }
}

public sealed record TelemetryUpdateResult(
    bool Success,
    string Version,
    IReadOnlyList<string> Installed,
    IReadOnlyList<string> Failures,
    IReadOnlyList<string> Deferred,
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
