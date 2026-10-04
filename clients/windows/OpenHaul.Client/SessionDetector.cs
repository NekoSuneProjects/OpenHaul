using System.Diagnostics;
using System.Text.RegularExpressions;

namespace OpenHaul.Client;

public static class SessionDetector
{
    private static readonly object CacheLock = new();
    private static DateTimeOffset _serverCheckedAt = DateTimeOffset.MinValue;
    private static string? _cachedServer;

    private static readonly string[] TruckersMpProcesses =
    [
        "TruckersMP",
        "TruckersMP-Launcher",
        "launcher_ets2mp",
        "launcher_atsmp",
    ];

    public static bool IsTruckersMpRunning() =>
        TruckersMpProcesses.Any(name =>
        {
            try { return Process.GetProcessesByName(name).Length > 0; }
            catch { return false; }
        });

    public static string SessionMode() => IsTruckersMpRunning() ? "truckersmp" : "singleplayer";

    public static string? DetectTruckersMpServer()
    {
        if (!IsTruckersMpRunning()) return null;

        lock (CacheLock)
        {
            if (DateTimeOffset.UtcNow - _serverCheckedAt < TimeSpan.FromSeconds(5))
                return _cachedServer;
            _serverCheckedAt = DateTimeOffset.UtcNow;
        }

        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var candidates = new[]
        {
            Path.Combine(appData, "TruckersMP", "logs"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "ETS2MP", "logs"),
        };

        foreach (var directory in candidates)
        {
            try
            {
                if (!Directory.Exists(directory)) continue;

                var log = new DirectoryInfo(directory)
                    .EnumerateFiles("*.log")
                    .OrderByDescending(file => file.LastWriteTimeUtc)
                    .FirstOrDefault();

                if (log is null) continue;

                string text;
                using (var stream = new FileStream(log.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    var length = Math.Min(stream.Length, 512 * 1024);
                    stream.Seek(-length, SeekOrigin.End);
                    using var reader = new StreamReader(stream);
                    text = reader.ReadToEnd();
                }

                var patterns = new[]
                {
                    @"(?im)(?:connected|connecting)s+tos+(?:servers+)?['""]?(?<name>[^
'""]{2,120})",
                    @"(?im)server(?:s+name)?s*[:=]s*['""]?(?<name>[^
'""]{2,120})",
                };

                foreach (var pattern in patterns)
                {
                    var matches = Regex.Matches(text, pattern);
                    if (matches.Count == 0) continue;
                    var value = matches[^1].Groups["name"].Value.Trim();
                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        lock (CacheLock) _cachedServer = value;
                        return value;
                    }
                }
            }
            catch
            {
                // TruckersMP log formats/permissions vary. Process detection is
                // still useful even when a server name cannot be recovered.
            }
        }

        lock (CacheLock) _cachedServer = "TruckersMP";
        return _cachedServer;
    }

    public static string DriverStatus(PluginLiveTelemetry telemetry)
    {
        if (telemetry.Paused == true) return "paused";
        if (telemetry.Driving != true) return "menu";
        if (telemetry.CargoLoaded == true || !string.IsNullOrWhiteSpace(telemetry.Cargo)) return "on-job";
        return telemetry.SpeedKph > 0.5 ? "driving" : "client-online";
    }
}
