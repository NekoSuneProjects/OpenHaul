using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;

namespace OpenHaul.Client;

public sealed class MainForm : Form
{
    private readonly ClientSettings _settings = ClientSettings.Load();
    private readonly CancellationTokenSource _lifetime = new();

    private readonly TextBox _server = new();
    private readonly Label _account = new();
    private readonly Label _token = new();
    private readonly Label _status = new();
    private readonly TextBox _games = new();
    private readonly Button _signIn = new();
    private readonly Button _detect = new();
    private readonly Button _installPlugin = new();
    private readonly Button _telemetry = new();

    private CancellationTokenSource? _telemetryCancellation;
    private TelemetryService? _telemetryService;
    private Task? _telemetryTask;

    public MainForm()
    {
        Text = "OpenHaul Client";
        Width = 760;
        Height = 620;
        MinimumSize = new Size(680, 560);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(5, 20, 14);
        ForeColor = Color.FromArgb(235, 248, 240);
        Font = new Font("Segoe UI", 10F);

        BuildUi();
        RefreshProfile();

        FormClosing += (_, _) => _lifetime.Cancel();
        FormClosed += async (_, _) => await StopTelemetryAsync();
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(24),
            ColumnCount = 1,
            RowCount = 9,
            AutoScroll = true,
        };

        root.RowStyles.Clear();
        for (var i = 0; i < 9; i++)
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var title = new Label
        {
            Text = "OpenHaul",
            Font = new Font("Segoe UI", 24F, FontStyle.Bold),
            AutoSize = true,
            ForeColor = Color.FromArgb(87, 232, 144),
            Margin = new Padding(0, 0, 0, 12),
        };
        root.Controls.Add(title);

        root.Controls.Add(new Label
        {
            Text = "Server",
            AutoSize = true,
            ForeColor = Color.FromArgb(170, 195, 182),
        });

        _server.Text = _settings.ApiUrl;
        _server.Dock = DockStyle.Top;
        _server.BackColor = Color.FromArgb(10, 35, 24);
        _server.ForeColor = ForeColor;
        _server.BorderStyle = BorderStyle.FixedSingle;
        _server.Margin = new Padding(0, 6, 0, 18);
        root.Controls.Add(_server);

        var accountCard = new Panel
        {
            Dock = DockStyle.Top,
            Height = 110,
            BackColor = Color.FromArgb(8, 30, 20),
            Padding = new Padding(16),
            Margin = new Padding(0, 0, 0, 16),
        };

        _account.AutoSize = true;
        _account.Location = new Point(16, 16);
        _account.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
        accountCard.Controls.Add(_account);

        _token.AutoSize = true;
        _token.Location = new Point(16, 48);
        _token.ForeColor = Color.FromArgb(165, 195, 180);
        accountCard.Controls.Add(_token);

        _signIn.Text = "Sign in with Steam";
        _signIn.Width = 170;
        _signIn.Height = 34;
        _signIn.Location = new Point(500, 34);
        StyleButton(_signIn, primary: true);
        _signIn.Click += async (_, _) => await SignInAsync();
        accountCard.Controls.Add(_signIn);

        root.Controls.Add(accountCard);

        var actions = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            WrapContents = true,
            Margin = new Padding(0, 0, 0, 14),
        };

        _detect.Text = "Detect ETS2 / ATS";
        _detect.AutoSize = true;
        StyleButton(_detect);
        _detect.Click += (_, _) => DetectGames();
        actions.Controls.Add(_detect);

        _installPlugin.Text = "Install telemetry plugin";
        _installPlugin.AutoSize = true;
        StyleButton(_installPlugin);
        _installPlugin.Click += (_, _) => InstallPlugin();
        actions.Controls.Add(_installPlugin);

        _telemetry.Text = "Start telemetry";
        _telemetry.AutoSize = true;
        StyleButton(_telemetry, primary: true);
        _telemetry.Click += async (_, _) => await ToggleTelemetryAsync();
        actions.Controls.Add(_telemetry);

        root.Controls.Add(actions);

        _games.Multiline = true;
        _games.ReadOnly = true;
        _games.Height = 180;
        _games.Dock = DockStyle.Top;
        _games.ScrollBars = ScrollBars.Vertical;
        _games.BackColor = Color.FromArgb(3, 15, 10);
        _games.ForeColor = Color.FromArgb(205, 230, 215);
        _games.BorderStyle = BorderStyle.FixedSingle;
        _games.Text = "Click “Detect ETS2 / ATS” to scan your Steam libraries.";
        root.Controls.Add(_games);

        _status.AutoSize = true;
        _status.MaximumSize = new Size(680, 0);
        _status.ForeColor = Color.FromArgb(170, 195, 182);
        _status.Margin = new Padding(0, 14, 0, 0);
        _status.Text = "Ready.";
        root.Controls.Add(_status);

        var note = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(680, 0),
            ForeColor = Color.FromArgb(120, 150, 135),
            Margin = new Padding(0, 18, 0, 0),
            Text = "Your client token is created by OpenHaul after Steam approval and stored only in your Windows profile. You can revoke it from your OpenHaul Account page.",
        };
        root.Controls.Add(note);

        Controls.Add(root);
    }

    private static void StyleButton(Button button, bool primary = false)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderColor = Color.FromArgb(28, 90, 58);
        button.FlatAppearance.BorderSize = 1;
        button.Padding = new Padding(10, 4, 10, 4);
        button.Margin = new Padding(0, 0, 10, 8);
        button.Cursor = Cursors.Hand;

        if (primary)
        {
            button.BackColor = Color.FromArgb(72, 222, 133);
            button.ForeColor = Color.FromArgb(3, 18, 11);
        }
        else
        {
            button.BackColor = Color.FromArgb(9, 38, 25);
            button.ForeColor = Color.FromArgb(230, 245, 235);
        }
    }

    private void RefreshProfile()
    {
        if (string.IsNullOrWhiteSpace(_settings.ClientToken))
        {
            _account.Text = "Not connected";
            _token.Text = "No client token is configured.";
            _signIn.Text = "Sign in with Steam";
            _telemetry.Enabled = false;
            return;
        }

        _account.Text = string.IsNullOrWhiteSpace(_settings.DisplayName)
            ? "Connected OpenHaul account"
            : $"{_settings.DisplayName} · SteamID {_settings.SteamId}";

        var prefix = _settings.ClientToken.Length > 20
            ? _settings.ClientToken[..20] + "…"
            : "oh_client_…";

        _token.Text = $"Client token: {prefix} · saved locally";
        _signIn.Text = "Reconnect account";
        _telemetry.Enabled = true;
    }

    private string ServerUrl()
    {
        var value = _server.Text.Trim();
        if (string.IsNullOrWhiteSpace(value))
            value = ClientSettings.DefaultApiUrl;

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
            throw new InvalidOperationException("Enter a valid OpenHaul http:// or https:// server URL.");

        return value.TrimEnd('/');
    }

    private async Task SignInAsync()
    {
        _signIn.Enabled = false;

        try
        {
            var server = ServerUrl();
            _settings.ApiUrl = server;
            _settings.Save();

            using var http = new HttpClient
            {
                BaseAddress = new Uri(server + "/"),
                Timeout = TimeSpan.FromSeconds(15),
            };

            _status.Text = "Creating Windows client login request…";

            var startResponse = await http.PostAsJsonAsync(
                "api/v1/client-auth/start",
                new { clientName = $"Windows Client · {Environment.MachineName}" },
                _lifetime.Token);

            startResponse.EnsureSuccessStatusCode();
            var start = await startResponse.Content.ReadFromJsonAsync<ClientAuthStart>(
                cancellationToken: _lifetime.Token);

            if (start is null)
                throw new InvalidOperationException("OpenHaul returned an invalid login request.");

            Process.Start(new ProcessStartInfo(start.VerificationUrl)
            {
                UseShellExecute = true,
            });

            _status.Text = "Steam sign-in opened in your browser. Approve this Windows Client there…";

            var expires = start.ExpiresAt;
            while (DateTimeOffset.UtcNow < expires && !_lifetime.IsCancellationRequested)
            {
                await Task.Delay(Math.Max(1000, start.PollIntervalMs), _lifetime.Token);

                var pollResponse = await http.PostAsJsonAsync(
                    "api/v1/client-auth/poll",
                    new { requestId = start.RequestId, secret = start.Secret },
                    _lifetime.Token);

                if ((int)pollResponse.StatusCode == 410)
                    throw new InvalidOperationException("Login request expired. Click Sign in with Steam and try again.");

                if (!pollResponse.IsSuccessStatusCode)
                    continue;

                var poll = await pollResponse.Content.ReadFromJsonAsync<ClientAuthPoll>(
                    cancellationToken: _lifetime.Token);

                if (poll?.Status == "pending")
                    continue;

                if (poll?.Status != "approved" || string.IsNullOrWhiteSpace(poll.ClientToken))
                    continue;

                _settings.ApiUrl = server;
                _settings.ClientToken = poll.ClientToken;
                _settings.SteamId = poll.User?.SteamId ?? "";
                _settings.DisplayName = poll.User?.DisplayName ?? "";
                _settings.AvatarUrl = poll.User?.AvatarUrl;
                _settings.Save();

                RefreshProfile();
                _status.Text = "✅ Account connected. Your client token is filled and saved automatically.";
                return;
            }

            throw new InvalidOperationException("Login request timed out. Try signing in again.");
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            _status.Text = "Sign-in failed: " + ex.Message;
        }
        finally
        {
            _signIn.Enabled = true;
        }
    }

    private void DetectGames()
    {
        try
        {
            var games = GameLocator.FindInstalledGames();
            if (games.Count == 0)
            {
                _games.Text = "No ETS2 or ATS Steam installations were detected.";
                return;
            }

            _games.Text = string.Join(
                Environment.NewLine + Environment.NewLine,
                games.Select(game =>
                    $"{game.Game.ToUpperInvariant()} · Steam {game.AppId}{Environment.NewLine}{game.Path}"));

            _status.Text = $"Detected {games.Count} game installation(s).";
        }
        catch (Exception ex)
        {
            _status.Text = "Game detection failed: " + ex.Message;
        }
    }

    private void InstallPlugin()
    {
        try
        {
            var plugin = Path.Combine(AppContext.BaseDirectory, "OpenHaul.Telemetry.dll");
            if (!File.Exists(plugin))
                throw new FileNotFoundException("The installer did not include OpenHaul.Telemetry.dll.", plugin);

            var installed = GameLocator.InstallPlugin(plugin);
            if (installed.Count == 0)
            {
                _status.Text = "No ETS2/ATS installations were detected.";
                return;
            }

            _games.Text = string.Join(
                Environment.NewLine,
                installed.Select(path => "✅ Installed: " + path));

            _status.Text = $"Telemetry plugin installed to {installed.Count} game installation(s).";
        }
        catch (UnauthorizedAccessException)
        {
            _status.Text = "Windows blocked plugin installation. Restart OpenHaul Client as Administrator and try again.";
        }
        catch (Exception ex)
        {
            _status.Text = "Plugin installation failed: " + ex.Message;
        }
    }

    private async Task ToggleTelemetryAsync()
    {
        if (_telemetryCancellation is not null)
        {
            await StopTelemetryAsync();
            return;
        }

        if (string.IsNullOrWhiteSpace(_settings.ClientToken))
        {
            _status.Text = "Sign in with Steam first.";
            return;
        }

        try
        {
            _settings.ApiUrl = ServerUrl();
            _settings.Save();

            _telemetryCancellation = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token);
            _telemetryService = new TelemetryService(_settings.ToConfig());
            _telemetryService.Status += SetStatus;
            _telemetry.Text = "Stop telemetry";
            _server.Enabled = false;
            _signIn.Enabled = false;

            _telemetryTask = Task.Run(
                () => _telemetryService.RunAsync(_telemetryCancellation.Token),
                _telemetryCancellation.Token);

            _status.Text = "Telemetry started. Open ETS2 or ATS.";
        }
        catch (Exception ex)
        {
            _status.Text = "Unable to start telemetry: " + ex.Message;
            await StopTelemetryAsync();
        }
    }

    private async Task StopTelemetryAsync()
    {
        var cancellation = _telemetryCancellation;
        var service = _telemetryService;
        var task = _telemetryTask;

        _telemetryCancellation = null;
        _telemetryService = null;
        _telemetryTask = null;

        cancellation?.Cancel();

        if (task is not null)
        {
            try { await task; }
            catch (OperationCanceledException) { }
        }

        if (service is not null)
        {
            service.Status -= SetStatus;
            await service.DisposeAsync();
        }

        cancellation?.Dispose();

        if (!IsDisposed)
        {
            _telemetry.Text = "Start telemetry";
            _server.Enabled = true;
            _signIn.Enabled = true;
            _status.Text = "Telemetry stopped.";
        }
    }

    private void SetStatus(string message)
    {
        if (IsDisposed) return;

        if (InvokeRequired)
        {
            BeginInvoke(() => SetStatus(message));
            return;
        }

        _status.Text = message;
    }

    private sealed record ClientAuthStart(
        string RequestId,
        string Secret,
        DateTimeOffset ExpiresAt,
        string VerificationUrl,
        int PollIntervalMs);

    private sealed record ClientAuthPoll(
        string Status,
        string? ClientToken,
        ClientAuthUser? User);

    private sealed record ClientAuthUser(
        string SteamId,
        string DisplayName,
        string? AvatarUrl);
}
