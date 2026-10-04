using System.IO.Pipes;
using System.Diagnostics;
using System.Text.Json;

namespace OpenHaul.Client;

public sealed class TelemetryService : IAsyncDisposable
{
    private static readonly JsonSerializerOptions PluginJson = new(JsonSerializerDefaults.Web);
    private readonly ClientConfig _config;
    private readonly OpenHaulApi _api;
    private bool _liveAccepted;

    public event Action<string>? Status;
    public event Action<PluginLiveTelemetry>? LiveTelemetryReceived;

    public TelemetryService(ClientConfig config)
    {
        _config = config;
        _api = new OpenHaulApi(config);
    }

    public async Task RunAsync(CancellationToken token)
    {
        Status?.Invoke("Waiting for ETS2/ATS telemetry plugin…");

        try
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    await using var pipe = new NamedPipeClientStream(
                        ".",
                        _config.PipeName,
                        PipeDirection.In,
                        PipeOptions.Asynchronous);

                    await pipe.ConnectAsync(5000, token);
                    _liveAccepted = false;
                    Status?.Invoke("Telemetry plugin connected; waiting for driving data…");
                    using var reader = new StreamReader(pipe);
                    while (!token.IsCancellationRequested && pipe.IsConnected)
                    {
                        var line = await reader.ReadLineAsync(token);
                        if (line is null) break;
                        if (string.IsNullOrWhiteSpace(line)) continue;

                        await HandleEnvelope(line, token);
                    }

                    _liveAccepted = false;
                    Status?.Invoke("Game closed or telemetry disconnected. Waiting…");
                }
                catch (OperationCanceledException) when (token.IsCancellationRequested)
                {
                    break;
                }
                catch (TimeoutException)
                {
                    if (IsSupportedGameRunning())
                    {
                        Status?.Invoke("ETS2/ATS is running, but the OpenHaul telemetry plugin did not connect. Close the game, verify/update the plugin, then restart the game.");
                    }
                    else
                    {
                        Status?.Invoke("Waiting for ETS2/ATS to start…");
                    }
                }
                catch (Exception ex)
                {
                    Status?.Invoke("Telemetry error: " + ex.Message);
                }

                if (!token.IsCancellationRequested)
                    await Task.Delay(2000, token);
            }
        }
        finally
        {
            try
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                await _api.SendOfflineAsync(_config.DriverId, timeout.Token);
            }
            catch
            {
                // Best effort only during shutdown.
            }
        }
    }

    private async Task HandleEnvelope(string json, CancellationToken token)
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
                var plugin = data.Deserialize<PluginLiveTelemetry>(PluginJson);
                if (plugin is null) return;

                LiveTelemetryReceived?.Invoke(plugin);

                var live = new LiveTelemetry(
                    _config.DriverId,
                    _config.Username,
                    plugin.Game,
                    _config.VtcId,
                    _config.VtcName,
                    _config.VtcTag,
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
                    plugin.TruckDamagePercent,
                    plugin.TrailerDamagePercent,
                    plugin.CargoDamagePercent,
                    plugin.SpecialJob,
                    plugin.CargoLoaded,
                    plugin.SourceCompany,
                    plugin.DestinationCompany);

                response = await _api.SendLiveAsync(live, token);
                if (response.IsSuccessStatusCode && !_liveAccepted)
                {
                    _liveAccepted = true;
                    Status?.Invoke($"Online: {plugin.Game.ToUpperInvariant()} driving telemetry accepted by OpenHaul.");
                }
                break;
            }

            case "fine":
            {
                var plugin = data.Deserialize<PluginFineTelemetry>(PluginJson);
                if (plugin is null) return;

                var fine = new FineTelemetry(
                    _config.VtcId,
                    _config.DriverId,
                    plugin.Game,
                    NormalizeFineType(plugin.Offence),
                    checked((int)Math.Clamp(plugin.Amount, 0, int.MaxValue)),
                    plugin.Game.Equals("ats", StringComparison.OrdinalIgnoreCase) ? "USD" : "EUR",
                    null,
                    DateTimeOffset.UtcNow);

                response = await _api.SendFineAsync(fine, token);
                break;
            }

            case "job.completed":
            {
                var plugin = data.Deserialize<PluginJobCompletedTelemetry>(PluginJson);
                if (plugin is null) return;

                var job = new JobCompletedTelemetry(
                    _config.VtcId,
                    _config.DriverId,
                    plugin.Game,
                    plugin.Cargo,
                    plugin.SourceCity,
                    plugin.DestinationCity,
                    plugin.DistanceKm,
                    plugin.Income,
                    DateTimeOffset.UtcNow);

                response = await _api.SendJobAsync(job, token);
                break;
            }
        }

        if (response is null) return;
        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                if (type == "live") _liveAccepted = false;
                Status?.Invoke($"OpenHaul rejected {type}: {(int)response.StatusCode} {response.ReasonPhrase}");
            }
            else if (type == "live" && !_liveAccepted)
            {
                _liveAccepted = true;
                Status?.Invoke("Online: driving telemetry accepted by OpenHaul.");
            }
        }
    }

    private static string NormalizeFineType(string offence) => offence.ToLowerInvariant() switch
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

    private static bool IsSupportedGameRunning() =>
        Process.GetProcessesByName("eurotrucks2").Length > 0 ||
        Process.GetProcessesByName("amtrucks").Length > 0;

    public ValueTask DisposeAsync()
    {
        _api.Dispose();
        return ValueTask.CompletedTask;
    }
}
