using System.Net.Http.Json;
using System.Text.Json;

namespace OpenHaul.Client;

public sealed class OpenHaulApi : IDisposable
{
    private readonly HttpClient _http;
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    public OpenHaulApi(ClientConfig config)
    {
        _http = new HttpClient
        {
            BaseAddress = new Uri(config.ApiUrl.TrimEnd('/') + "/"),
            Timeout = TimeSpan.FromSeconds(10)
        };
        if (!string.IsNullOrWhiteSpace(config.ClientToken))
            _http.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", config.ClientToken);
        else if (!string.IsNullOrWhiteSpace(config.IngestKey))
            _http.DefaultRequestHeaders.Add("X-Ingest-Key", config.IngestKey);

        _http.DefaultRequestHeaders.UserAgent.ParseAdd("OpenHaul.Client/0.1");
    }

    public Task<HttpResponseMessage> SendLiveAsync(LiveTelemetry telemetry, CancellationToken token) =>
        SendWithReconnectAsync(
            () => new HttpRequestMessage(HttpMethod.Post, "api/v1/telemetry/live")
            {
                Content = JsonContent.Create(telemetry, options: _json),
            },
            token);

    public Task<HttpResponseMessage> SendOfflineAsync(string driverId, CancellationToken token) =>
        SendWithReconnectAsync(
            () => new HttpRequestMessage(HttpMethod.Delete, $"api/v1/telemetry/live/{Uri.EscapeDataString(driverId)}"),
            token);

    public Task<HttpResponseMessage> SendFineAsync(FineTelemetry fine, CancellationToken token) =>
        SendWithReconnectAsync(
            () => new HttpRequestMessage(HttpMethod.Post, "api/v1/telemetry/fines")
            {
                Content = JsonContent.Create(fine, options: _json),
            },
            token);

    public Task<HttpResponseMessage> SendJobAsync(JobCompletedTelemetry job, CancellationToken token) =>
        SendWithReconnectAsync(
            () => new HttpRequestMessage(HttpMethod.Post, "api/v1/telemetry/jobs/completed")
            {
                Content = JsonContent.Create(job, options: _json),
            },
            token);

    public Task<HttpResponseMessage> SendEventAsync(GenericTelemetryEvent telemetryEvent, CancellationToken token) =>
        SendWithReconnectAsync(
            () => new HttpRequestMessage(HttpMethod.Post, "api/v1/telemetry/events")
            {
                Content = JsonContent.Create(telemetryEvent, options: _json),
            },
            token);

    public async Task<ClientDispatchList> GetDispatchesAsync(CancellationToken token)
    {
        using var response = await SendWithReconnectAsync(
            () => new HttpRequestMessage(HttpMethod.Get, "api/v1/client/dispatch"),
            token);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<ClientDispatchList>(_json, token)
            ?? new ClientDispatchList([]);
    }

    public async Task RespondDispatchAsync(long dispatchId, string decision, CancellationToken token)
    {
        using var response = await SendWithReconnectAsync(
            () => new HttpRequestMessage(HttpMethod.Post, $"api/v1/client/dispatch/{dispatchId}/respond")
            {
                Content = JsonContent.Create(new { decision }, options: _json),
            },
            token);
        response.EnsureSuccessStatusCode();
    }

    public async Task SendPresenceAsync(CancellationToken token)
    {
        using var response = await SendWithReconnectAsync(
            () => new HttpRequestMessage(HttpMethod.Post, "api/v1/client/presence")
            {
                Content = JsonContent.Create(new { }, options: _json),
            },
            token);
        response.EnsureSuccessStatusCode();
    }

    public async Task SendPresenceOfflineAsync(CancellationToken token)
    {
        using var response = await SendWithReconnectAsync(
            () => new HttpRequestMessage(HttpMethod.Delete, "api/v1/client/presence"),
            token);
        if (response.StatusCode != System.Net.HttpStatusCode.NoContent)
            response.EnsureSuccessStatusCode();
    }

    private async Task<HttpResponseMessage> SendWithReconnectAsync(
        Func<HttpRequestMessage> requestFactory,
        CancellationToken token)
    {
        var delays = new[]
        {
            TimeSpan.Zero,
            TimeSpan.FromSeconds(1),
            TimeSpan.FromSeconds(2),
            TimeSpan.FromSeconds(5),
        };

        Exception? lastError = null;

        for (var attempt = 0; attempt < delays.Length; attempt++)
        {
            if (delays[attempt] > TimeSpan.Zero)
                await Task.Delay(delays[attempt], token);

            using var request = requestFactory();

            try
            {
                var response = await _http.SendAsync(request, token);

                if (!IsTransient(response.StatusCode) || attempt == delays.Length - 1)
                    return response;

                response.Dispose();
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                lastError = ex;
                if (attempt == delays.Length - 1)
                    throw;
            }
        }

        throw lastError ?? new HttpRequestException("OpenHaul request failed after reconnect attempts.");
    }

    private static bool IsTransient(System.Net.HttpStatusCode statusCode) =>
        statusCode is
            System.Net.HttpStatusCode.RequestTimeout or
            System.Net.HttpStatusCode.TooManyRequests or
            System.Net.HttpStatusCode.InternalServerError or
            System.Net.HttpStatusCode.BadGateway or
            System.Net.HttpStatusCode.ServiceUnavailable or
            System.Net.HttpStatusCode.GatewayTimeout;

    public void Dispose() => _http.Dispose();
}
