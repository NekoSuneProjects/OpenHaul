using System.IO.Pipes;
using System.Text.Json;
using OpenHaul.Client;

var config = ClientConfig.FromEnvironment();
var simulate = args.Contains("--simulate", StringComparer.OrdinalIgnoreCase);
var detectGames = args.Contains("--detect-games", StringComparer.OrdinalIgnoreCase);
var installPluginIndex = Array.FindIndex(args, value => value.Equals("--install-plugin", StringComparison.OrdinalIgnoreCase));

if (detectGames)
{
    var games = GameLocator.FindInstalledGames();
    if (games.Count == 0)
        Console.WriteLine("No ETS2/ATS Steam installations detected.");
    else
        foreach (var game in games)
            Console.WriteLine($"{game.Game.ToUpperInvariant()} ({game.AppId}): {game.Path}");
    return 0;
}

if (installPluginIndex >= 0)
{
    if (installPluginIndex + 1 >= args.Length)
    {
        Console.Error.WriteLine("--install-plugin requires the path to OpenHaul.Telemetry.dll");
        return 2;
    }

    try
    {
        var installed = GameLocator.InstallPlugin(args[installPluginIndex + 1]);
        if (installed.Count == 0)
        {
            Console.Error.WriteLine("No ETS2/ATS installations were found.");
            return 3;
        }

        foreach (var path in installed)
            Console.WriteLine($"Installed telemetry plugin: {path}");
        return 0;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Plugin install failed: {ex.Message}");
        return 4;
    }
}

if (string.IsNullOrWhiteSpace(config.IngestKey) && string.IsNullOrWhiteSpace(config.ClientToken))
{
    Console.Error.WriteLine("OPENHAUL_CLIENT_TOKEN or OPENHAUL_INGEST_KEY is required.");
    return 2;
}

using var api = new OpenHaulApi(config);
using var shutdown = new CancellationTokenSource();

Console.CancelKeyPress += (_, eventArgs) =>
{
    eventArgs.Cancel = true;
    shutdown.Cancel();
};

Console.WriteLine("OpenHaul Client");
Console.WriteLine($"API: {config.ApiUrl}");
Console.WriteLine($"Driver: {config.Username} ({config.DriverId})");
Console.WriteLine(!string.IsNullOrWhiteSpace(config.ClientToken) ? "Auth: Steam account client token" : "Auth: instance ingest key");
Console.WriteLine(simulate ? "Mode: simulator" : $@"Mode: telemetry pipe \\.\pipe\{config.PipeName}");

try
{
    if (simulate)
        await RunSimulator(api, config, shutdown.Token);
    else
        await RunPipeClient(api, config, shutdown.Token);
}
catch (OperationCanceledException) when (shutdown.IsCancellationRequested)
{
}
finally
{
    try
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        await api.SendOfflineAsync(config.DriverId, timeout.Token);
        Console.WriteLine("Driver marked offline.");
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Unable to send offline state: {ex.Message}");
    }
}

return 0;

static async Task RunPipeClient(OpenHaulApi api, ClientConfig config, CancellationToken token)
{
    while (!token.IsCancellationRequested)
    {
        try
        {
            await using var pipe = new NamedPipeClientStream(
                ".",
                config.PipeName,
                PipeDirection.In,
                PipeOptions.Asynchronous);

            Console.WriteLine("Waiting for OpenHaul SCS telemetry plugin…");
            await pipe.ConnectAsync(5000, token);
            Console.WriteLine("SCS telemetry plugin connected.");

            using var reader = new StreamReader(pipe);

            while (!token.IsCancellationRequested && pipe.IsConnected)
            {
                var line = await reader.ReadLineAsync(token);
                if (line is null) break;
                if (string.IsNullOrWhiteSpace(line)) continue;

                await HandleEnvelope(line, api, config, token);
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            return;
        }
        catch (TimeoutException)
        {
            Console.WriteLine("SCS telemetry plugin not available yet. Retrying…");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Telemetry connection error: {ex.Message}");
        }

        if (!token.IsCancellationRequested)
            await Task.Delay(2000, token);
    }
}

static async Task HandleEnvelope(string json, OpenHaulApi api, ClientConfig config, CancellationToken token)
{
    using var document = JsonDocument.Parse(json);
    if (!document.RootElement.TryGetProperty("type", out var typeProperty) ||
        !document.RootElement.TryGetProperty("data", out var data))
        return;

    var type = typeProperty.GetString();
    HttpResponseMessage? response = null;

    switch (type)
    {
        case "live":
        {
            var plugin = data.Deserialize<PluginLiveTelemetry>();
            if (plugin is null) return;

            var live = new LiveTelemetry(
                config.DriverId,
                config.Username,
                plugin.Game,
                config.VtcId,
                config.VtcName,
                config.VtcTag,
                plugin.X,
                plugin.Y,
                plugin.Z,
                plugin.Heading,
                plugin.SpeedKph,
                plugin.Truck,
                plugin.Cargo,
                plugin.SourceCity,
                plugin.DestinationCity,
                null,
                plugin.Rpm,
                plugin.Fuel,
                plugin.OdometerKm,
                plugin.NavigationDistanceM,
                plugin.NavigationTimeS,
                plugin.SpeedLimitKph,
                plugin.SourceCompany,
                plugin.DestinationCompany);

            response = await api.SendLiveAsync(live, token);
            break;
        }

        case "fine":
        {
            var plugin = data.Deserialize<PluginFineTelemetry>();
            if (plugin is null) return;

            var fine = new FineTelemetry(
                config.VtcId,
                config.DriverId,
                plugin.Game,
                NormalizeFineType(plugin.Offence),
                checked((int)Math.Clamp(plugin.Amount, 0, int.MaxValue)),
                plugin.Game.Equals("ats", StringComparison.OrdinalIgnoreCase) ? "USD" : "EUR",
                null,
                DateTimeOffset.UtcNow);

            response = await api.SendFineAsync(fine, token);
            break;
        }

        case "job.completed":
        {
            var plugin = data.Deserialize<PluginJobCompletedTelemetry>();
            if (plugin is null) return;

            var job = new JobCompletedTelemetry(
                config.VtcId,
                config.DriverId,
                plugin.Game,
                plugin.Cargo,
                plugin.SourceCity,
                plugin.DestinationCity,
                plugin.DistanceKm,
                plugin.Income,
                DateTimeOffset.UtcNow);

            response = await api.SendJobAsync(job, token);
            break;
        }
    }

    if (response is not null && !response.IsSuccessStatusCode)
        Console.Error.WriteLine($"OpenHaul API rejected {type}: {(int)response.StatusCode} {response.ReasonPhrase}");
}

static string NormalizeFineType(string offence) => offence.ToLowerInvariant() switch
{
    "red_signal" => "red_light",
    "speeding" or "speeding_camera" => "speeding",
    "wrong_way" => "wrong_way",
    "crash" => "collision",
    "no_lights" or "avoid_sleeping" or "avoid_weighing" or "illegal_trailer" or
    "avoid_inspection" or "illegal_border_crossing" or "hard_shoulder_violation" or
    "damaged_vehicle_usage" or "generic" => "other",
    _ => "other",
};

static async Task RunSimulator(OpenHaulApi api, ClientConfig config, CancellationToken token)
{
    var x = 10_000d;
    var z = -5_000d;
    var heading = 0d;

    while (!token.IsCancellationRequested)
    {
        heading = (heading + 0.006) % 1.0;
        x += Math.Cos(heading * Math.PI * 2) * 2.5;
        z += Math.Sin(heading * Math.PI * 2) * 2.5;

        var telemetry = new LiveTelemetry(
            config.DriverId,
            config.Username,
            "ets2",
            config.VtcId,
            config.VtcName,
            config.VtcTag,
            x,
            35,
            z,
            heading,
            76,
            "Scania S",
            "Medical Vaccines",
            "Manchester",
            "Rotterdam",
            "OpenHaul Simulator");

        var response = await api.SendLiveAsync(telemetry, token);
        Console.WriteLine($"{DateTime.Now:T} live -> {(int)response.StatusCode}");

        await Task.Delay(1000, token);
    }
}
