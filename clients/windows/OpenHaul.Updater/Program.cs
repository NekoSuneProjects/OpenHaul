using System.Diagnostics;

namespace OpenHaul.Updater;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        var logDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OpenHaul",
            "logs");

        Directory.CreateDirectory(logDirectory);
        var logPath = Path.Combine(logDirectory, "updater.log");

        try
        {
            Log(logPath, "OpenHaul Updater started.");

            var options = ParseArguments(args);
            if (!options.TryGetValue("pid", out var pidValue) ||
                !int.TryParse(pidValue, out var pid))
                throw new InvalidOperationException("Missing or invalid --pid.");

            if (!options.TryGetValue("installer", out var installer) ||
                string.IsNullOrWhiteSpace(installer))
                throw new InvalidOperationException("Missing --installer.");

            if (!options.TryGetValue("restart", out var restart) ||
                string.IsNullOrWhiteSpace(restart))
                throw new InvalidOperationException("Missing --restart.");

            installer = Path.GetFullPath(installer);
            restart = Path.GetFullPath(restart);

            if (!File.Exists(installer))
                throw new FileNotFoundException("Verified OpenHaul installer was not found.", installer);

            WaitForProcessExit(pid, logPath);

            Log(logPath, "Launching installer: " + installer);

            using var installerProcess = Process.Start(new ProcessStartInfo(installer)
            {
                UseShellExecute = true,
                Arguments =
                    "/VERYSILENT /SUPPRESSMSGBOXES /CLOSEAPPLICATIONS /NORESTART /SP-",
            }) ?? throw new InvalidOperationException("Unable to start OpenHaul installer.");

            installerProcess.WaitForExit();
            Log(logPath, "Installer exit code: " + installerProcess.ExitCode);

            if (installerProcess.ExitCode != 0)
                throw new InvalidOperationException(
                    "OpenHaul installer failed with exit code " + installerProcess.ExitCode + ".");

            if (!File.Exists(restart))
                throw new FileNotFoundException(
                    "Updated OpenHaul launcher was not found after installation.",
                    restart);

            Log(logPath, "Restarting OpenHaul: " + restart);

            Process.Start(new ProcessStartInfo(restart)
            {
                UseShellExecute = true,
                WorkingDirectory = Path.GetDirectoryName(restart) ?? AppContext.BaseDirectory,
            });

            Log(logPath, "Update completed successfully.");
            return 0;
        }
        catch (Exception ex)
        {
            Log(logPath, "Update failed: " + ex);

            try
            {
                MessageBox.Show(
                    "OpenHaul could not finish updating." + Environment.NewLine +
                    Environment.NewLine +
                    ex.Message + Environment.NewLine +
                    Environment.NewLine +
                    "Updater log:" + Environment.NewLine +
                    logPath,
                    "OpenHaul Updater",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            catch
            {
            }

            return 1;
        }
    }

    private static Dictionary<string, string> ParseArguments(string[] args)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        for (var index = 0; index < args.Length; index++)
        {
            var value = args[index];
            if (!value.StartsWith("--", StringComparison.Ordinal))
                continue;

            var key = value[2..];
            if (index + 1 >= args.Length)
                throw new InvalidOperationException("Missing value for --" + key + ".");

            result[key] = args[++index];
        }

        return result;
    }

    private static void WaitForProcessExit(int pid, string logPath)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            Log(logPath, "Waiting for launcher PID " + pid + " to exit.");

            if (!process.WaitForExit(30_000))
            {
                Log(logPath, "Launcher did not exit within 30 seconds. Requesting termination.");
                process.Kill(entireProcessTree: true);

                if (!process.WaitForExit(10_000))
                    throw new TimeoutException("OpenHaul launcher did not close for update.");
            }
        }
        catch (ArgumentException)
        {
            Log(logPath, "Launcher process already exited.");
        }
    }

    private static void Log(string path, string message)
    {
        try
        {
            File.AppendAllText(
                path,
                $"[{DateTimeOffset.Now:O}] {message}{Environment.NewLine}");
        }
        catch
        {
        }
    }
}
