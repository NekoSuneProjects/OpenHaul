using System.Text.Json;

namespace OpenHaul.Client;

public sealed class OfflineTelemetryQueue
{
    private readonly string _path;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    private sealed record Entry(string Payload, DateTimeOffset QueuedAt);

    public OfflineTelemetryQueue()
    {
        var directory = Path.Combine(ClientSettings.SettingsDirectory, "telemetry");
        Directory.CreateDirectory(directory);
        _path = Path.Combine(directory, "offline-queue.json");
    }

    public async Task EnqueueAsync(string payload, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(payload)) return;

        using var doc = JsonDocument.Parse(payload);
        var type = doc.RootElement.TryGetProperty("type", out var t) ? t.GetString() : null;

        // Live position is superseded by the next live packet. Queueing 4Hz live
        // telemetry during an outage would create a huge stale replay.
        if (string.Equals(type, "live", StringComparison.OrdinalIgnoreCase)) return;

        await _gate.WaitAsync(token);
        try
        {
            var entries = await ReadUnsafeAsync(token);
            entries.Add(new Entry(payload, DateTimeOffset.UtcNow));

            // Keep the queue bounded; lifecycle/job/fine/expense messages are tiny.
            if (entries.Count > 5000)
                entries.RemoveRange(0, entries.Count - 5000);

            await WriteUnsafeAsync(entries, token);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<IReadOnlyList<string>> PeekAsync(int limit, CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            return (await ReadUnsafeAsync(token))
                .Take(Math.Max(1, limit))
                .Select(entry => entry.Payload)
                .ToArray();
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task RemoveFirstAsync(int count, CancellationToken token)
    {
        if (count <= 0) return;

        await _gate.WaitAsync(token);
        try
        {
            var entries = await ReadUnsafeAsync(token);
            entries.RemoveRange(0, Math.Min(count, entries.Count));
            await WriteUnsafeAsync(entries, token);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<int> CountAsync(CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        try
        {
            return (await ReadUnsafeAsync(token)).Count;
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<List<Entry>> ReadUnsafeAsync(CancellationToken token)
    {
        if (!File.Exists(_path)) return [];

        try
        {
            await using var stream = File.OpenRead(_path);
            return await JsonSerializer.DeserializeAsync<List<Entry>>(stream, _json, token) ?? [];
        }
        catch
        {
            // Preserve a corrupt queue for diagnostics and continue with a new one.
            try
            {
                var corrupt = _path + ".corrupt-" + DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                File.Move(_path, corrupt, overwrite: true);
            }
            catch {}
            return [];
        }
    }

    private async Task WriteUnsafeAsync(List<Entry> entries, CancellationToken token)
    {
        var temporary = _path + ".tmp";

        await using (var stream = new FileStream(
            temporary,
            FileMode.Create,
            FileAccess.Write,
            FileShare.None,
            32 * 1024,
            useAsync: true))
        {
            await JsonSerializer.SerializeAsync(stream, entries, _json, token);
            await stream.FlushAsync(token);
        }

        File.Move(temporary, _path, overwrite: true);
    }
}
