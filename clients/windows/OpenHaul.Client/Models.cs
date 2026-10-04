using System.Text.Json.Serialization;

namespace OpenHaul.Client;

public sealed record TelemetryEnvelope(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("data")] object Data);

public sealed record PluginLiveTelemetry(
    string Game,
    double X,
    double? Y,
    double Z,
    double Heading,
    double SpeedKph,
    double? Rpm,
    double? Fuel,
    double? OdometerKm,
    double? NavigationDistanceM,
    double? NavigationTimeS,
    double? SpeedLimitKph,
    double? TruckDamagePercent,
    double? TrailerDamagePercent,
    double? CargoDamagePercent,
    bool? SpecialJob,
    bool? CargoLoaded,
    string? Truck,
    string? Cargo,
    string? SourceCity,
    string? DestinationCity,
    string? SourceCompany,
    string? DestinationCompany);

public sealed record PluginFineTelemetry(
    string Game,
    string Offence,
    long Amount);

public sealed record PluginJobCompletedTelemetry(
    string Game,
    string? Cargo,
    string? SourceCity,
    string? DestinationCity,
    string? SourceCompany,
    string? DestinationCompany,
    double? DistanceKm,
    long? Income);

public sealed record LiveTelemetry(
    string DriverId,
    string Username,
    string Game,
    int? VtcId,
    string? VtcName,
    string? VtcTag,
    double X,
    double? Y,
    double Z,
    double Heading,
    double SpeedKph,
    string? Truck,
    string? Cargo,
    string? SourceCity,
    string? DestinationCity,
    string? Server,
    double? Rpm = null,
    double? Fuel = null,
    double? OdometerKm = null,
    double? NavigationDistanceM = null,
    double? NavigationTimeS = null,
    double? SpeedLimitKph = null,
    double? TruckDamagePercent = null,
    double? TrailerDamagePercent = null,
    double? CargoDamagePercent = null,
    bool? SpecialJob = null,
    bool? CargoLoaded = null,
    string? SourceCompany = null,
    string? DestinationCompany = null);

public sealed record FineTelemetry(
    int? VtcId,
    string DriverId,
    string Game,
    string Type,
    int Amount,
    string Currency,
    string? City,
    DateTimeOffset OccurredAt);

public sealed record JobCompletedTelemetry(
    int? VtcId,
    string DriverId,
    string Game,
    string? Cargo,
    string? SourceCity,
    string? DestinationCity,
    double? DistanceKm,
    long? Income,
    DateTimeOffset CompletedAt);

public sealed record ClientConfig(
    string ApiUrl,
    string IngestKey,
    string ClientToken,
    string DriverId,
    string Username,
    int? VtcId,
    string? VtcName,
    string? VtcTag,
    string PipeName = "OpenHaulTelemetry")
{
    public static ClientConfig FromEnvironment() => new(
        Environment.GetEnvironmentVariable("OPENHAUL_API_URL") ?? ClientSettings.DefaultApiUrl,
        Environment.GetEnvironmentVariable("OPENHAUL_INGEST_KEY") ?? "",
        Environment.GetEnvironmentVariable("OPENHAUL_CLIENT_TOKEN") ?? "",
        Environment.GetEnvironmentVariable("OPENHAUL_DRIVER_ID") ?? Environment.UserName,
        Environment.GetEnvironmentVariable("OPENHAUL_USERNAME") ?? Environment.UserName,
        int.TryParse(Environment.GetEnvironmentVariable("OPENHAUL_VTC_ID"), out var vtcId) ? vtcId : null,
        Environment.GetEnvironmentVariable("OPENHAUL_VTC_NAME"),
        Environment.GetEnvironmentVariable("OPENHAUL_VTC_TAG"),
        Environment.GetEnvironmentVariable("OPENHAUL_PIPE_NAME") ?? "OpenHaulTelemetry"
    );
}
