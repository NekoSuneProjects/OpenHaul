using System.Diagnostics;
using Microsoft.Web.WebView2.Core;

namespace OpenHaul.Client;

public sealed record DiagnosticCheck(string Name, string Status, string Detail);

public static class ClientDiagnostics
{
    public static async Task<IReadOnlyList<DiagnosticCheck>> RunAsync(ClientSettings settings, CancellationToken token)
    {
        var checks = new List<DiagnosticCheck>();

        try
        {
            Directory.CreateDirectory(ClientSettings.SettingsDirectory);
            var probe = Path.Combine(ClientSettings.SettingsDirectory, ".write-test");
            await File.WriteAllTextAsync(probe, DateTimeOffset.UtcNow.ToString("O"), token);
            File.Delete(probe);
            checks.Add(new("Local data folder", "OK", ClientSettings.SettingsDirectory));
        }
        catch (Exception ex)
        {
            checks.Add(new("Local data folder", "ERROR", ex.Message));
        }

        try
        {
            var version = CoreWebView2Environment.GetAvailableBrowserVersionString();
            checks.Add(new("WebView2 runtime", string.IsNullOrWhiteSpace(version) ? "ERROR" : "OK",
                string.IsNullOrWhiteSpace(version) ? "Runtime not detected" : version));
        }
        catch (Exception ex)
        {
            checks.Add(new("WebView2 runtime", "ERROR", ex.Message));
        }

        var games = GameLocator.FindInstalledGames();
        checks.Add(new("Game installations", games.Count > 0 ? "OK" : "WARN",
            games.Count > 0
                ? string.Join(" · ", games.Select(game => game.Game.ToUpperInvariant() + ": " + game.Path))
                : "ETS2/ATS not detected through Steam libraries"));

        foreach (var game in games)
        {
            var plugin = Path.Combine(game.Path, "bin", "win_x64", "plugins", "OpenHaul.Telemetry.dll");
            if (!File.Exists(plugin))
            {
                checks.Add(new(game.Game.ToUpperInvariant() + " telemetry plugin", "ERROR", "Plugin DLL is missing"));
                continue;
            }

            try
            {
                var info = new FileInfo(plugin);
                checks.Add(new(game.Game.ToUpperInvariant() + " telemetry plugin", "OK",
                    info.FullName + " · " + info.Length.ToString("N0") + " bytes"));
            }
            catch (Exception ex)
            {
                checks.Add(new(game.Game.ToUpperInvariant() + " telemetry plugin", "WARN", ex.Message));
            }
        }

        checks.Add(new("TruckersMP", SessionDetector.IsTruckersMpRunning() ? "OK" : "INFO",
            SessionDetector.IsTruckersMpRunning()
                ? "Running · " + (SessionDetector.DetectTruckersMpServer() ?? "server unknown")
                : "Not running"));

        checks.Add(new("Steam/client identity", string.IsNullOrWhiteSpace(settings.ClientToken) ? "WARN" : "OK",
            string.IsNullOrWhiteSpace(settings.ClientToken)
                ? "Sign in with Steam to upload telemetry"
                : "Client token is configured"));

        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var url = (settings.ApiUrl ?? ClientSettings.DefaultApiUrl).TrimEnd('/') + "/health";
            using var response = await http.GetAsync(url, token);
            checks.Add(new("OpenHaul API", response.IsSuccessStatusCode ? "OK" : "ERROR",
                url + " · HTTP " + (int)response.StatusCode));
        }
        catch (Exception ex)
        {
            checks.Add(new("OpenHaul API", "ERROR", ex.Message));
        }

        try
        {
            var queue = new OfflineTelemetryQueue();
            var count = await queue.CountAsync(token);
            checks.Add(new("Offline telemetry queue", count == 0 ? "OK" : "WARN",
                count == 0 ? "No queued events" : count + " event(s) waiting to resend"));
        }
        catch (Exception ex)
        {
            checks.Add(new("Offline telemetry queue", "WARN", ex.Message));
        }

        checks.Add(new("Game process",
            Process.GetProcessesByName("eurotrucks2").Length > 0 || Process.GetProcessesByName("amtrucks").Length > 0 ? "OK" : "INFO",
            Process.GetProcessesByName("eurotrucks2").Length > 0 ? "ETS2 running" :
            Process.GetProcessesByName("amtrucks").Length > 0 ? "ATS running" : "No supported game running"));

        return checks;
    }
}
