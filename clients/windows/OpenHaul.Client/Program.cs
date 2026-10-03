namespace OpenHaul.Client;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();

        Application.ThreadException += (_, args) =>
        {
            ReportCrash("UI thread exception", args.Exception);
        };

        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
        {
            var exception = args.ExceptionObject as Exception
                ?? new Exception(String(args.ExceptionObject));
            ReportCrash("Unhandled exception", exception);
        };

        try
        {
            Application.Run(new MainForm());
        }
        catch (Exception ex)
        {
            ReportCrash("Launcher startup failed", ex);
        }
    }

    private static void ReportCrash(string title, Exception exception)
    {
        try
        {
            var logDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "OpenHaul",
                "logs");

            Directory.CreateDirectory(logDirectory);

            var logPath = Path.Combine(logDirectory, "launcher-crash.log");
            var entry =
                $"[{DateTimeOffset.Now:O}] {title}{Environment.NewLine}" +
                exception + Environment.NewLine +
                new string('-', 80) + Environment.NewLine;

            File.AppendAllText(logPath, entry);

            MessageBox.Show(
                $"{title}.{Environment.NewLine}{Environment.NewLine}" +
                $"{exception.Message}{Environment.NewLine}{Environment.NewLine}" +
                $"Crash log:{Environment.NewLine}{logPath}",
                "OpenHaul Launcher",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
        catch
        {
            try
            {
                MessageBox.Show(
                    $"{title}.{Environment.NewLine}{Environment.NewLine}{exception}",
                    "OpenHaul Launcher",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
            catch
            {
                // Nothing else can be done if Windows cannot show the error UI.
            }
        }
    }
}
