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
        _http.PostAsJsonAsync("api/v1/telemetry/live", telemetry, _json, token);

    public Task<HttpResponseMessage> SendOfflineAsync(string driverId, CancellationToken token) =>
        _http.DeleteAsync($"api/v1/telemetry/live/{Uri.EscapeDataString(driverId)}", token);

    public Task<HttpResponseMessage> SendFineAsync(FineTelemetry fine, CancellationToken token) =>
        _http.PostAsJsonAsync("api/v1/telemetry/fines", fine, _json, token);

    public Task<HttpResponseMessage> SendJobAsync(JobCompletedTelemetry job, CancellationToken token) =>
        _http.PostAsJsonAsync("api/v1/telemetry/jobs/completed", job, _json, token);

    public void Dispose() => _http.Dispose();
}
