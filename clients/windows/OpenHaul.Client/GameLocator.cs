using Microsoft.Win32;
using System.Text.RegularExpressions;

namespace OpenHaul.Client;

public sealed record GameInstall(string Game, uint AppId, string Path);

public static class GameLocator
{
    private static readonly Dictionary<uint, (string Game, string Folder)> Games = new()
    {
        [227300] = ("ets2", "Euro Truck Simulator 2"),
        [270880] = ("ats", "American Truck Simulator"),
    };

    public static IReadOnlyList<GameInstall> FindInstalledGames()
    {
        var steamRoot = FindSteamRoot();
        if (steamRoot is null) return [];

        var libraries = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            Path.Combine(steamRoot, "steamapps")
        };

        var libraryFile = Path.Combine(steamRoot, "steamapps", "libraryfolders.vdf");
        if (File.Exists(libraryFile))
        {
            var text = File.ReadAllText(libraryFile);
            foreach (Match match in Regex.Matches(text, ""path"\s+"(?<path>[^"]+)"", RegexOptions.IgnoreCase))
            {
                var value = match.Groups["path"].Value.Replace(@"\\", @"");
                libraries.Add(Path.Combine(value, "steamapps"));
            }
        }

        var found = new List<GameInstall>();

        foreach (var steamApps in libraries)
        {
            foreach (var (appId, details) in Games)
            {
                var manifest = Path.Combine(steamApps, $"appmanifest_{appId}.acf");
                if (!File.Exists(manifest)) continue;

                var installDir = details.Folder;
                var manifestText = File.ReadAllText(manifest);
                var match = Regex.Match(manifestText, ""installdir"\s+"(?<dir>[^"]+)"", RegexOptions.IgnoreCase);
                if (match.Success) installDir = match.Groups["dir"].Value;

                var gamePath = Path.Combine(steamApps, "common", installDir);
                if (Directory.Exists(gamePath))
                    found.Add(new GameInstall(details.Game, appId, gamePath));
            }
        }

        return found
            .GroupBy(game => game.Path, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToArray();
    }

    public static IReadOnlyList<string> InstallPlugin(string pluginSource)
    {
        if (!File.Exists(pluginSource))
            throw new FileNotFoundException("OpenHaul telemetry plugin DLL was not found.", pluginSource);

        var installed = new List<string>();

        foreach (var game in FindInstalledGames())
        {
            var pluginDirectory = Path.Combine(game.Path, "bin", "win_x64", "plugins");
            Directory.CreateDirectory(pluginDirectory);

            var destination = Path.Combine(pluginDirectory, "OpenHaul.Telemetry.dll");
            File.Copy(pluginSource, destination, overwrite: true);
            installed.Add(destination);
        }

        return installed;
    }

    private static string? FindSteamRoot()
    {
        if (!OperatingSystem.IsWindows()) return null;

        var candidates = new[]
        {
            Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam")?.GetValue("SteamPath") as string,
            Registry.LocalMachine.OpenSubKey(@"SOFTWARE\WOW6432Node\Valve\Steam")?.GetValue("InstallPath") as string,
            Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Valve\Steam")?.GetValue("InstallPath") as string,
        };

        return candidates.FirstOrDefault(path => !string.IsNullOrWhiteSpace(path) && Directory.Exists(path));
    }
}
