using System.IO.Pipes;
using System.Text.Json;
using OpenHaul.Client;

var config = ClientConfig.FromEnvironment();
var simulate = args.Contains("--simulate", StringComparer.OrdinalIgnoreCase);

if (string.IsNullOrWhiteSpace(config.IngestKey))
{
    Console.Error.WriteLine("OPENHAUL_INGEST_KEY is required.");
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
Console.WriteLine(simulate ? "Mode: simulator" : $"Mode: telemetry pipe \\.\pipe\{config.PipeName}");

if (simulate)
{
    await RunSimulator(api, config, shutdown.Token);
    return 0;
}

while (!shutdown.IsCancellationRequested)
{
    try
    {
        await using var pipe = new NamedPipeClientStream(
            ".",
            config.PipeName,
            PipeDirection.In,
            PipeOptions.Asynchronous);

        Console.WriteLine("Waiting for SCS telemetry bridge…");
        await pipe.ConnectAsync(5000, shutdown.Token);
        Console.WriteLine("Telemetry bridge connected.");

        using var reader = new StreamReader(pipe);

        while (!shutdown.IsCancellationRequested && pipe.IsConnected)
        {
            var line = await reader.ReadLineAsync(shutdown.Token);
            if (line is null) break;
            if (string.IsNullOrWhiteSpace(line)) continue;

            await HandleEnvelope(line, api, shutdown.Token);
        }
    }
    catch (OperationCanceledException) when (shutdown.IsCancellationRequested)
    {
        break;
    }
    catch (TimeoutException)
    {
        Console.WriteLine("Telemetry bridge not available yet. Retrying…");
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Telemetry connection error: {ex.Message}");
    }

    if (!shutdown.IsCancellationRequested)
        await Task.Delay(2000, shutdown.Token);
}

return 0;

static async Task HandleEnvelope(string json, OpenHaulApi api, CancellationToken token)
{
    using var document = JsonDocument.Parse(json);
    if (!document.RootElement.TryGetProperty("type", out var typeProperty) ||
        !document.RootElement.TryGetProperty("data", out var data))
        return;

    var type = typeProperty.GetString();

    HttpResponseMessage? response = type switch
    {
        "live" => await api.SendLiveAsync(data.Deserialize<LiveTelemetry>()!, token),
        "fine" => await api.SendFineAsync(data.Deserialize<FineTelemetry>()!, token),
        "job.completed" => await api.SendJobAsync(data.Deserialize<JobCompletedTelemetry>()!, token),
        _ => null
    };

    if (response is not null && !response.IsSuccessStatusCode)
        Console.Error.WriteLine($"OpenHaul API rejected {type}: {(int)response.StatusCode} {response.ReasonPhrase}");
}

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
