using System.IO.Pipes;
using System.Diagnostics;
using System.Text.Json;

namespace OpenHaul.Client;

public sealed class TelemetryService : IAsyncDisposable
{
    private static readonly JsonSerializerOptions PluginJson = new(JsonSerializerDefaults.Web);
    private readonly ClientConfig _config;
    private readonly OpenHaulApi _api;
    private readonly OfflineTelemetryQueue _offlineQueue = new();
    private readonly string _sessionId = Guid.NewGuid().ToString("N");
    private bool _liveAccepted;
    private bool _serverUnavailable;
    private bool _replayingOffline;

    public event Action<string>? Status;
    public event Action<PluginLiveTelemetry>? LiveTelemetryReceived;
    public event Action? PluginReconnectNeeded;

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

                        try
                        {
                            await HandleEnvelope(line, token);
                        }
                        catch (OperationCanceledException) when (token.IsCancellationRequested)
                        {
                            throw;
                        }
                        catch (HttpRequestException ex)
                        {
                            _liveAccepted = false;
                            await _offlineQueue.EnqueueAsync(line, token);
                            MarkServerUnavailable("OpenHaul site/API is offline. Telemetry events are queued locally and will resend automatically…");
                            Debug.WriteLine("OpenHaul reconnect: " + ex.Message);
                        }
                        catch (TaskCanceledException) when (!token.IsCancellationRequested)
                        {
                            _liveAccepted = false;
                            await _offlineQueue.EnqueueAsync(line, token);
                            MarkServerUnavailable("OpenHaul site/API timed out. Telemetry events are queued locally and will resend automatically…");
                        }
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
                        Status?.Invoke("ETS2/ATS is running, but the telemetry plugin is not connected. OpenHaul will repair/update it automatically as soon as the game closes.");
                        PluginReconnectNeeded?.Invoke();
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
                    SessionDetector.DetectTruckersMpServer(),
                    plugin.Rpm,
                    plugin.Fuel,
                    plugin.OdometerKm,
                    plugin.NavigationDistanceM,
                    plugin.NavigationTimeS,
                    plugin.SpeedLimitKph,
                    plugin.TruckDamagePercent,
                    plugin.EngineDamagePercent,
                    plugin.TransmissionDamagePercent,
                    plugin.CabinDamagePercent,
                    plugin.ChassisDamagePercent,
                    plugin.WheelDamagePercent,
                    plugin.TrailerDamagePercent,
                    plugin.TrailerChassisDamagePercent,
                    plugin.CargoDamagePercent,
                    plugin.SpecialJob,
                    plugin.CargoLoaded,
                    plugin.SourceCompany,
                    plugin.DestinationCompany,
                    SessionDetector.SessionMode(),
                    SessionDetector.DriverStatus(plugin),
                    _sessionId);

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
                    DateTimeOffset.UtcNow,
                    plugin.EventId ?? $"{_config.DriverId}:fine:{plugin.Game}:{plugin.Offence}:{plugin.Amount}:{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}");

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
                    DateTimeOffset.UtcNow,
                    plugin.EventId,
                    "completed",
                    plugin.Expenses ?? 0,
                    plugin.Late ?? false,
                    plugin.CargoDamagePercent ?? 0,
                    plugin.TruckDamagePercent ?? 0,
                    plugin.TrailerDamagePercent ?? 0,
                    plugin.SourceCompany,
                    plugin.DestinationCompany,
                    plugin.SourceX,
                    plugin.SourceZ,
                    plugin.DestinationX,
                    plugin.DestinationZ);

                response = await _api.SendJobAsync(job, token);
                break;
            }

            default:
            {
                if (string.IsNullOrWhiteSpace(type) ||
                    !(type.StartsWith("job.", StringComparison.OrdinalIgnoreCase) ||
                      type.StartsWith("expense.", StringComparison.OrdinalIgnoreCase) ||
                      type.StartsWith("damage.", StringComparison.OrdinalIgnoreCase) ||
                      type.StartsWith("refuel.", StringComparison.OrdinalIgnoreCase) ||
                      type.StartsWith("collision.", StringComparison.OrdinalIgnoreCase) ||
                      type.StartsWith("route.", StringComparison.OrdinalIgnoreCase)))
                    break;

                var plugin = data.Deserialize<PluginGenericTelemetryEvent>(PluginJson);
                if (plugin is null) return;

                var externalId = plugin.EventId ??
                    $"{_config.DriverId}:{type}:{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";

                var telemetryEvent = new GenericTelemetryEvent(
                    _config.VtcId,
                    _config.DriverId,
                    plugin.Game,
                    type,
                    externalId,
                    DateTimeOffset.UtcNow,
                    plugin.Amount,
                    plugin.Currency,
                    plugin.X,
                    plugin.Y,
                    plugin.Z,
                    plugin.Cargo,
                    plugin.SourceCity,
                    plugin.DestinationCity,
                    plugin.DamagePercent,
                    plugin.Detail);

                response = await _api.SendEventAsync(telemetryEvent, token);
                break;
            }
        }

        if (response is null) return;
        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                if (type == "live") _liveAccepted = false;

                if ((int)response.StatusCode is 408 or 425 or 429 or 500 or 502 or 503 or 504)
                {
                    MarkServerUnavailable($"OpenHaul server temporarily unavailable ({(int)response.StatusCode}). Reconnecting automatically…");
                }
                else
                {
                    Status?.Invoke($"OpenHaul rejected {type}: {(int)response.StatusCode} {response.ReasonPhrase}");
                }
            }
            else
            {
                if (_serverUnavailable)
                {
                    _serverUnavailable = false;
                    Status?.Invoke("OpenHaul connection restored automatically.");
                }

                if (type == "live" && !_liveAccepted)
                {
                    _liveAccepted = true;
                    Status?.Invoke("Online: driving telemetry accepted by OpenHaul.");
                }

                if (!_replayingOffline)
                    await FlushOfflineQueueAsync(token);
            }
        }
    }

    private async Task FlushOfflineQueueAsync(CancellationToken token)
    {
        if (_replayingOffline) return;

        _replayingOffline = true;
        try
        {
            while (!token.IsCancellationRequested)
            {
                var batch = await _offlineQueue.PeekAsync(25, token);
                if (batch.Count == 0) break;

                var sent = 0;
                foreach (var payload in batch)
                {
                    try
                    {
                        await HandleEnvelope(payload, token);
                        sent++;
                    }
                    catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
                    {
                        MarkServerUnavailable("OpenHaul is still offline; queued telemetry will retry later.");
                        break;
                    }
                }

                if (sent > 0)
                {
                    await _offlineQueue.RemoveFirstAsync(sent, token);
                    Status?.Invoke($"Resent {sent} queued telemetry event(s).");
                }

                if (sent < batch.Count) break;
            }
        }
        finally
        {
            _replayingOffline = false;
        }
    }

    private void MarkServerUnavailable(string message)
    {
        if (_serverUnavailable) return;
        _serverUnavailable = true;
        Status?.Invoke(message);
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
