using System.Net;
using System.Reflection;
using System.Text.Json;
using OpenHaul.Client;

OverlayHotkeyTests.Run((condition, message) =>
{
    if (!condition) throw new Exception(message);
    Console.WriteLine("PASS " + message);
});

const BindingFlags fields = BindingFlags.Instance | BindingFlags.NonPublic;
var config = new ClientConfig("https://fixture.invalid", "", "", "test-driver", "Test Driver", null, null, null);
await using var service = new TelemetryService(config);
var api = (OpenHaulApi)typeof(TelemetryService).GetField("_api", fields)!.GetValue(service)!;
var httpField = typeof(OpenHaulApi).GetField("_http", fields)!;
((HttpClient)httpField.GetValue(api)!).Dispose();
var handler = new CaptureHandler();
httpField.SetValue(api, new HttpClient(handler) { BaseAddress = new Uri(config.ApiUrl) });
var statuses = new List<string>();
service.Status += statuses.Add;
var handle = typeof(TelemetryService).GetMethod("HandleEnvelope", fields)!;

async Task Send(string json) => await (Task)handle.Invoke(service, [json, CancellationToken.None])!;
void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
    Console.WriteLine("PASS " + message);
}

await Send("""
{"type":"live","data":{"game":"ats","x":-103451.5,"y":42,"z":12345.25,"heading":0.25,"speedKph":85.2,"rpm":1250,"fuel":300,"odometerKm":12000,"navigationDistanceM":7500,"navigationTimeS":600,"speedLimitKph":90,"truck":"Kenworth T680","cargo":"Machinery","sourceCity":"reno","destinationCity":"sacramento","sourceCompany":"source","destinationCompany":"destination"}}
""");
var live = handler.Requests[^1];
Check(live.Path == "/api/v1/telemetry/live", "live telemetry uses the live endpoint");
Check(live.Body.GetProperty("game").GetString() == "ats", "lowercase plugin game survives deserialization");
Check(live.Body.GetProperty("x").GetDouble() == -103451.5 && live.Body.GetProperty("z").GetDouble() == 12345.25, "actual map coordinates reach the server");
Check(live.Body.GetProperty("speedKph").GetDouble() == 85.2 && live.Body.GetProperty("navigationDistanceM").GetDouble() == 7500, "camelCase driving fields survive deserialization");
Check(live.Body.GetProperty("driverId").GetString() == "test-driver", "client attaches driver identity");
Check(statuses.Last().StartsWith("Online:"), "accepted live telemetry reports online");

await Send("""{"type":"fine","data":{"game":"ats","offence":"speeding_camera","amount":450}}""");
var fine = handler.Requests[^1];
Check(fine.Path.EndsWith("/fines") && fine.Body.GetProperty("amount").GetInt32() == 450 && fine.Body.GetProperty("type").GetString() == "speeding" && fine.Body.GetProperty("currency").GetString() == "USD", "plugin fine fields and ATS currency reach the server");

await Send("""{"type":"job.completed","data":{"game":"ets2","cargo":"steel","sourceCity":"berlin","destinationCity":"paris","sourceCompany":"source","destinationCompany":"destination","distanceKm":875.5,"income":12345}}""");
var job = handler.Requests[^1];
Check(job.Path.EndsWith("/jobs/completed") && job.Body.GetProperty("distanceKm").GetDouble() == 875.5 && job.Body.GetProperty("income").GetInt64() == 12345 && job.Body.GetProperty("destinationCity").GetString() == "paris", "completed-job values survive deserialization");

handler.Status = HttpStatusCode.Unauthorized;
await Send("""{"type":"live","data":{"game":"ats","x":1,"z":2}}""");
Check(statuses.Last().Contains("401"), "rejected telemetry reports HTTP failure");
handler.Status = HttpStatusCode.OK;
await Send("""{"type":"live","data":{"game":"ats","x":1,"z":2}}""");
Check(statuses.Last().StartsWith("Online:"), "online status recovers after rejection");
Check(handler.Contents.All(content => content.Disposed), "every HTTP response is disposed");

sealed class CaptureHandler : HttpMessageHandler
{
    public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;
    public List<(string Path, JsonElement Body)> Requests { get; } = [];
    public List<TrackedContent> Contents { get; } = [];

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
    {
        using var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
        Requests.Add((request.RequestUri!.AbsolutePath, json.RootElement.Clone()));
        var content = new TrackedContent();
        Contents.Add(content);
        return new HttpResponseMessage(Status) { Content = content };
    }
}

sealed class TrackedContent : StringContent
{
    public bool Disposed { get; private set; }
    public TrackedContent() : base("{}") { }
    protected override void Dispose(bool disposing) { Disposed = true; base.Dispose(disposing); }
}
