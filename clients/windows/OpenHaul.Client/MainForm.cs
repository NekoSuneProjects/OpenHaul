using System.Diagnostics;
using System.Net.Http.Json;

namespace OpenHaul.Client;

public sealed class MainForm : Form
{
    private readonly ClientSettings _settings = ClientSettings.Load();
    private readonly CancellationTokenSource _lifetime = new();
    private readonly UpdateManager _updater = new();

    private readonly Panel _content = new();
    private readonly Label _status = new();
    private readonly Label _accountSummary = new();
    private readonly Label _tokenSummary = new();
    private readonly Label _gamePath = new();
    private readonly Label _clientVersion = new();
    private readonly Label _latestVersion = new();
    private readonly Label _telemetryVersion = new();
    private readonly Label _updateLabel = new();
    private readonly ProgressBar _updateProgress = new();
    private readonly Button _updateButton = new();
    private readonly Button _playButton = new();
    private readonly Button _telemetryButton = new();
    private readonly Button _signInButton = new();
    private readonly ComboBox _gameSelector = new();
    private readonly TextBox _serverText = new();

    private ClientUpdateManifest? _manifest;
    private bool _mandatoryUpdatePending;
    private CancellationTokenSource? _telemetryCancellation;
    private TelemetryService? _telemetryService;
    private Task? _telemetryTask;

    private readonly Dictionary<string, Button> _navButtons = new(StringComparer.OrdinalIgnoreCase);

    public MainForm()
    {
        Text = "OpenHaul Launcher";
        Width = 1180;
        Height = 720;
        MinimumSize = new Size(980, 620);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = C(4, 15, 10);
        ForeColor = Color.White;
        Font = new Font("Segoe UI", 10F);
        FormBorderStyle = FormBorderStyle.None;

        _updater.Status += SetStatus;
        _updater.Progress += value =>
        {
            if (IsDisposed) return;
            if (InvokeRequired)
            {
                BeginInvoke(() => SetUpdateProgress(value));
                return;
            }
            SetUpdateProgress(value);
        };

        BuildShell();
        ShowPage("play");
        RefreshProfile();
        DetectGames();

        Shown += async (_, _) => await CheckUpdatesAsync(updateTelemetry: true);
        FormClosing += (_, _) => _lifetime.Cancel();
        FormClosed += async (_, _) => await StopTelemetryAsync();
    }

    private static Color C(int r, int g, int b) => Color.FromArgb(r, g, b);

    private void BuildShell()
    {
        var top = new Panel
        {
            Dock = DockStyle.Top,
            Height = 72,
            BackColor = C(6, 25, 16),
        };

        var logo = new Label
        {
            Text = "OpenHaul",
            AutoSize = true,
            Font = new Font("Segoe UI", 22F, FontStyle.Bold),
            ForeColor = C(72, 222, 133),
            Location = new Point(24, 18),
        };
        top.Controls.Add(logo);

        var subtitle = new Label
        {
            Text = "ETS2 / ATS Driver Launcher",
            AutoSize = true,
            ForeColor = C(135, 166, 149),
            Location = new Point(178, 29),
        };
        top.Controls.Add(subtitle);

        var minimize = WindowButton("—");
        minimize.Location = new Point(Width - 100, 16);
        minimize.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        minimize.Click += (_, _) => WindowState = FormWindowState.Minimized;
        top.Controls.Add(minimize);

        var close = WindowButton("×");
        close.Location = new Point(Width - 52, 16);
        close.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        close.Click += (_, _) => Close();
        top.Controls.Add(close);

        var sidebar = new Panel
        {
            Dock = DockStyle.Left,
            Width = 190,
            BackColor = C(5, 21, 14),
            Padding = new Padding(14, 20, 14, 20),
        };

        AddNav(sidebar, "play", "▶  Play", 20);
        AddNav(sidebar, "account", "●  Account", 72);
        AddNav(sidebar, "updates", "⇩  Updates", 124);
        AddNav(sidebar, "settings", "⚙  Settings", 176);

        var version = new Label
        {
            Text = "v" + UpdateManager.CurrentVersion,
            ForeColor = C(90, 120, 104),
            AutoSize = true,
            Location = new Point(18, 560),
            Anchor = AnchorStyles.Left | AnchorStyles.Bottom,
        };
        sidebar.Controls.Add(version);

        _content.Dock = DockStyle.Fill;
        _content.BackColor = C(4, 15, 10);
        _content.Padding = new Padding(30);

        var bottom = BuildUpdateBar();

        Controls.Add(_content);
        Controls.Add(sidebar);
        Controls.Add(bottom);
        Controls.Add(top);
    }

    private static Button WindowButton(string text)
    {
        var button = new Button
        {
            Text = text,
            Width = 36,
            Height = 36,
            FlatStyle = FlatStyle.Flat,
            BackColor = C(3, 12, 8),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 14F, FontStyle.Bold),
            Cursor = Cursors.Hand,
            TabStop = false,
        };
        button.FlatAppearance.BorderSize = 0;
        return button;
    }

    private void AddNav(Panel sidebar, string key, string text, int y)
    {
        var button = new Button
        {
            Text = text,
            TextAlign = ContentAlignment.MiddleLeft,
            Width = 160,
            Height = 42,
            Location = new Point(14, y),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.Transparent,
            ForeColor = C(220, 240, 229),
            Font = new Font("Segoe UI", 10.5F, FontStyle.Bold),
            Cursor = Cursors.Hand,
        };
        button.FlatAppearance.BorderSize = 0;
        button.Click += (_, _) => ShowPage(key);
        sidebar.Controls.Add(button);
        _navButtons[key] = button;
    }

    private Panel BuildUpdateBar()
    {
        var panel = new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 74,
            BackColor = C(6, 27, 17),
            Padding = new Padding(18, 13, 18, 13),
        };

        _updateProgress.Minimum = 0;
        _updateProgress.Maximum = 100;
        _updateProgress.Value = 0;
        _updateProgress.Width = 150;
        _updateProgress.Height = 18;
        _updateProgress.Location = new Point(20, 27);
        panel.Controls.Add(_updateProgress);

        _updateLabel.Text = "Checking installation…";
        _updateLabel.AutoSize = true;
        _updateLabel.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        _updateLabel.Location = new Point(188, 27);
        panel.Controls.Add(_updateLabel);

        _status.Text = "Ready.";
        _status.AutoSize = true;
        _status.ForeColor = C(140, 170, 153);
        _status.Location = new Point(500, 27);
        panel.Controls.Add(_status);

        _updateButton.Text = "Check Updates";
        _updateButton.Width = 150;
        _updateButton.Height = 42;
        _updateButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _updateButton.Location = new Point(Width - 180, 16);
        StyleButton(_updateButton, true);
        _updateButton.Click += async (_, _) =>
        {
            if (_manifest is not null && UpdateManager.IsClientUpdateAvailable(_manifest))
                await InstallLauncherUpdateAsync();
            else
                await CheckUpdatesAsync(updateTelemetry: true);
        };
        panel.Controls.Add(_updateButton);

        return panel;
    }

    private void ShowPage(string page)
    {
        foreach (var (key, button) in _navButtons)
        {
            button.BackColor = key.Equals(page, StringComparison.OrdinalIgnoreCase)
                ? C(9, 47, 30)
                : Color.Transparent;
            button.ForeColor = key.Equals(page, StringComparison.OrdinalIgnoreCase)
                ? C(82, 234, 142)
                : C(220, 240, 229);
        }

        _content.SuspendLayout();
        _content.Controls.Clear();

        Control next = page switch
        {
            "account" => BuildAccountPage(),
            "updates" => BuildUpdatesPage(),
            "settings" => BuildSettingsPage(),
            _ => BuildPlayPage(),
        };

        next.Dock = DockStyle.Fill;
        _content.Controls.Add(next);
        _content.ResumeLayout();
    }

    private Control BuildPlayPage()
    {
        var page = PagePanel();
        page.Controls.Add(PageTitle("Drive with OpenHaul", "Start ETS2 or ATS with telemetry connected to your OpenHaul account."));

        var hero = Card(24, 110, 860, 270);
        var heroTitle = new Label
        {
            Text = "Ready to haul?",
            Font = new Font("Segoe UI", 24F, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(28, 28),
        };
        hero.Controls.Add(heroTitle);

        var hint = new Label
        {
            Text = "Choose your game. OpenHaul checks launcher and telemetry updates before play.",
            ForeColor = C(150, 180, 163),
            AutoSize = true,
            Location = new Point(30, 74),
        };
        hero.Controls.Add(hint);

        _gameSelector.DropDownStyle = ComboBoxStyle.DropDownList;
        _gameSelector.Items.Clear();
        _gameSelector.Items.Add("Euro Truck Simulator 2");
        _gameSelector.Items.Add("American Truck Simulator");
        _gameSelector.SelectedIndex = 0;
        _gameSelector.Width = 360;
        _gameSelector.Height = 38;
        _gameSelector.Location = new Point(30, 118);
        _gameSelector.BackColor = C(9, 38, 25);
        _gameSelector.ForeColor = Color.White;
        _gameSelector.SelectedIndexChanged += (_, _) => RefreshSelectedGamePath();
        hero.Controls.Add(_gameSelector);

        _gamePath.AutoSize = false;
        _gamePath.Size = new Size(600, 42);
        _gamePath.Location = new Point(30, 168);
        _gamePath.ForeColor = C(130, 160, 144);
        hero.Controls.Add(_gamePath);

        _playButton.Text = "▶  PLAY";
        _playButton.Width = 190;
        _playButton.Height = 58;
        _playButton.Location = new Point(640, 115);
        StyleButton(_playButton, true);
        _playButton.Font = new Font("Segoe UI", 13F, FontStyle.Bold);
        _playButton.Click += async (_, _) => await PlaySelectedGameAsync();
        hero.Controls.Add(_playButton);

        _telemetryButton.Text = "Start Telemetry";
        _telemetryButton.Width = 190;
        _telemetryButton.Height = 40;
        _telemetryButton.Location = new Point(640, 184);
        StyleButton(_telemetryButton, false);
        _telemetryButton.Click += async (_, _) => await ToggleTelemetryAsync();
        hero.Controls.Add(_telemetryButton);

        page.Controls.Add(hero);

        var info = Card(24, 404, 860, 120);
        info.Controls.Add(new Label
        {
            Text = "Account",
            Font = new Font("Segoe UI", 11F, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(24, 18),
        });
        var summary = new Label
        {
            Text = string.IsNullOrWhiteSpace(_settings.ClientToken)
                ? "Not signed in — open Account and connect with Steam."
                : $"{_settings.DisplayName} · {_settings.SteamId}",
            AutoSize = true,
            ForeColor = C(145, 178, 160),
            Location = new Point(24, 48),
        };
        info.Controls.Add(summary);
        page.Controls.Add(info);

        RefreshSelectedGamePath();
        ApplyMandatoryUpdateState();
        return page;
    }

    private Control BuildAccountPage()
    {
        var page = PagePanel();
        page.Controls.Add(PageTitle("Account", "Connect this PC to your OpenHaul profile."));

        var card = Card(24, 110, 860, 260);

        card.Controls.Add(new Label
        {
            Text = "OpenHaul server",
            AutoSize = true,
            Location = new Point(26, 24),
            ForeColor = C(160, 190, 173),
        });

        _serverText.Text = _settings.ApiUrl;
        _serverText.Location = new Point(26, 50);
        _serverText.Width = 540;
        _serverText.BackColor = C(4, 22, 14);
        _serverText.ForeColor = Color.White;
        _serverText.BorderStyle = BorderStyle.FixedSingle;
        card.Controls.Add(_serverText);

        _accountSummary.Location = new Point(26, 105);
        _accountSummary.AutoSize = true;
        _accountSummary.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
        card.Controls.Add(_accountSummary);

        _tokenSummary.Location = new Point(26, 140);
        _tokenSummary.AutoSize = true;
        _tokenSummary.ForeColor = C(145, 178, 160);
        card.Controls.Add(_tokenSummary);

        _signInButton.Text = string.IsNullOrWhiteSpace(_settings.ClientToken)
            ? "Sign in with Steam"
            : "Reconnect Account";
        _signInButton.Width = 190;
        _signInButton.Height = 44;
        _signInButton.Location = new Point(640, 48);
        StyleButton(_signInButton, true);
        _signInButton.Click += async (_, _) => await SignInAsync();
        card.Controls.Add(_signInButton);

        var web = new Button
        {
            Text = "Open Account Website",
            Width = 190,
            Height = 40,
            Location = new Point(640, 108),
        };
        StyleButton(web, false);
        web.Click += (_, _) => OpenUrl(ServerUrl() + "/account");
        card.Controls.Add(web);

        page.Controls.Add(card);
        RefreshProfile();
        return page;
    }

    private Control BuildUpdatesPage()
    {
        var page = PagePanel();
        page.Controls.Add(PageTitle("Versions & Updates", "Launcher and telemetry are checked independently."));

        var client = Card(24, 110, 410, 190);
        client.Controls.Add(CardTitle("OpenHaul Launcher"));
        _clientVersion.Text = "Installed: " + UpdateManager.CurrentVersion;
        _clientVersion.AutoSize = true;
        _clientVersion.Location = new Point(24, 68);
        _clientVersion.ForeColor = C(150, 180, 163);
        client.Controls.Add(_clientVersion);

        _latestVersion.Text = "Latest: checking…";
        _latestVersion.AutoSize = true;
        _latestVersion.Location = new Point(24, 96);
        _latestVersion.ForeColor = C(150, 180, 163);
        client.Controls.Add(_latestVersion);

        var check = new Button { Text = "Check now", Width = 130, Height = 38, Location = new Point(24, 132) };
        StyleButton(check, false);
        check.Click += async (_, _) => await CheckUpdatesAsync(updateTelemetry: false);
        client.Controls.Add(check);
        page.Controls.Add(client);

        var telemetry = Card(456, 110, 428, 190);
        telemetry.Controls.Add(CardTitle("SCS Telemetry Plugin"));
        _telemetryVersion.Text = "Latest: checking…";
        _telemetryVersion.AutoSize = true;
        _telemetryVersion.Location = new Point(24, 68);
        _telemetryVersion.ForeColor = C(150, 180, 163);
        telemetry.Controls.Add(_telemetryVersion);

        var pluginUpdate = new Button { Text = "Verify / Update Plugin", Width = 190, Height = 38, Location = new Point(24, 124) };
        StyleButton(pluginUpdate, true);
        pluginUpdate.Click += async (_, _) => await UpdateTelemetryAsync();
        telemetry.Controls.Add(pluginUpdate);
        page.Controls.Add(telemetry);

        return page;
    }

    private Control BuildSettingsPage()
    {
        var page = PagePanel();
        page.Controls.Add(PageTitle("Settings", "Detected games and telemetry installation."));

        var card = Card(24, 110, 860, 360);

        var detect = new Button { Text = "Detect ETS2 / ATS", Width = 170, Height = 40, Location = new Point(24, 24) };
        StyleButton(detect, false);
        detect.Click += (_, _) => DetectGames();
        card.Controls.Add(detect);

        var install = new Button { Text = "Install telemetry plugin", Width = 190, Height = 40, Location = new Point(210, 24) };
        StyleButton(install, true);
        install.Click += async (_, _) => await UpdateTelemetryAsync(forceLocalInstall: true);
        card.Controls.Add(install);

        var paths = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            BackColor = C(3, 16, 10),
            ForeColor = C(210, 235, 220),
            BorderStyle = BorderStyle.FixedSingle,
            Location = new Point(24, 86),
            Size = new Size(810, 230),
        };

        paths.Name = "gamePaths";
        card.Controls.Add(paths);
        page.Controls.Add(card);

        BeginInvoke(() => RefreshSettingsPaths(paths));
        return page;
    }

    private static Panel PagePanel() => new()
    {
        BackColor = C(4, 15, 10),
        AutoScroll = true,
    };

    private static Control PageTitle(string title, string subtitle)
    {
        var panel = new Panel { Location = new Point(24, 20), Size = new Size(860, 72) };
        panel.Controls.Add(new Label
        {
            Text = title,
            Font = new Font("Segoe UI", 22F, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(0, 0),
        });
        panel.Controls.Add(new Label
        {
            Text = subtitle,
            AutoSize = true,
            ForeColor = C(140, 170, 153),
            Location = new Point(2, 44),
        });
        return panel;
    }

    private static Panel Card(int x, int y, int width, int height) => new()
    {
        Location = new Point(x, y),
        Size = new Size(width, height),
        BackColor = C(7, 30, 19),
        BorderStyle = BorderStyle.FixedSingle,
    };

    private static Label CardTitle(string text) => new()
    {
        Text = text,
        Font = new Font("Segoe UI", 13F, FontStyle.Bold),
        AutoSize = true,
        Location = new Point(22, 22),
    };

    private static void StyleButton(Button button, bool primary)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 1;
        button.FlatAppearance.BorderColor = C(29, 96, 61);
        button.Cursor = Cursors.Hand;

        if (primary)
        {
            button.BackColor = C(72, 222, 133);
            button.ForeColor = C(3, 18, 11);
        }
        else
        {
            button.BackColor = C(8, 39, 25);
            button.ForeColor = Color.White;
        }
    }

    private void DetectGames()
    {
        RefreshSelectedGamePath();
        var box = FindControl<TextBox>("gamePaths");
        if (box is not null) RefreshSettingsPaths(box);
    }

    private void RefreshSettingsPaths(TextBox box)
    {
        var games = GameLocator.FindInstalledGames();
        box.Text = games.Count == 0
            ? "No ETS2 or ATS Steam installations detected."
            : string.Join(
                Environment.NewLine + Environment.NewLine,
                games.Select(game =>
                    $"{game.Game.ToUpperInvariant()} · Steam {game.AppId}{Environment.NewLine}{game.Path}"));
    }

    private void RefreshSelectedGamePath()
    {
        if (_gamePath.IsDisposed) return;

        var game = SelectedGameCode();
        var install = GameLocator.FindInstalledGames()
            .FirstOrDefault(item => item.Game.Equals(game, StringComparison.OrdinalIgnoreCase));

        _gamePath.Text = install is null
            ? "Game not detected. Check Settings."
            : install.Path;

        _playButton.Enabled = install is not null && !_mandatoryUpdatePending;
    }

    private string SelectedGameCode() =>
        _gameSelector.SelectedIndex == 1 ? "ats" : "ets2";

    private async Task PlaySelectedGameAsync()
    {
        if (_mandatoryUpdatePending)
        {
            SetStatus("A required launcher update must be installed before playing.");
            ShowPage("updates");
            return;
        }

        if (string.IsNullOrWhiteSpace(_settings.ClientToken))
        {
            SetStatus("Sign in with Steam before playing.");
            ShowPage("account");
            return;
        }

        if (_manifest is not null)
        {
            var plugin = await _updater.EnsureTelemetryAsync(_manifest, _lifetime.Token);
            if (!plugin.Success)
            {
                SetStatus("Telemetry update needs attention: " + string.Join(" | ", plugin.Failures));
                ShowPage("settings");
                return;
            }
        }

        if (_telemetryCancellation is null)
            await StartTelemetryAsync();

        var appId = SelectedGameCode() == "ats" ? 270880 : 227300;
        OpenUrl("steam://rungameid/" + appId);
        SetStatus("Launching " + (appId == 270880 ? "American Truck Simulator" : "Euro Truck Simulator 2") + "…");
    }

    private async Task SignInAsync()
    {
        _signInButton.Enabled = false;

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

            SetStatus("Creating Windows client login request…");
            var startResponse = await http.PostAsJsonAsync(
                "api/v1/client-auth/start",
                new { clientName = $"Windows Client · {Environment.MachineName}" },
                _lifetime.Token);

            startResponse.EnsureSuccessStatusCode();
            var start = await startResponse.Content.ReadFromJsonAsync<ClientAuthStart>(
                cancellationToken: _lifetime.Token);

            if (start is null)
                throw new InvalidOperationException("OpenHaul returned an invalid login request.");

            OpenUrl(start.VerificationUrl);
            SetStatus("Steam sign-in opened in your browser. Approve this PC there…");

            while (DateTimeOffset.UtcNow < start.ExpiresAt && !_lifetime.IsCancellationRequested)
            {
                await Task.Delay(Math.Max(1000, start.PollIntervalMs), _lifetime.Token);
                var pollResponse = await http.PostAsJsonAsync(
                    "api/v1/client-auth/poll",
                    new { requestId = start.RequestId, secret = start.Secret },
                    _lifetime.Token);

                if ((int)pollResponse.StatusCode == 410)
                    throw new InvalidOperationException("Login request expired. Try again.");

                if (!pollResponse.IsSuccessStatusCode) continue;

                var poll = await pollResponse.Content.ReadFromJsonAsync<ClientAuthPoll>(
                    cancellationToken: _lifetime.Token);

                if (poll?.Status == "pending") continue;
                if (poll?.Status != "approved" || string.IsNullOrWhiteSpace(poll.ClientToken)) continue;

                _settings.ApiUrl = server;
                _settings.ClientToken = poll.ClientToken;
                _settings.SteamId = poll.User?.SteamId ?? "";
                _settings.DisplayName = poll.User?.DisplayName ?? "";
                _settings.AvatarUrl = poll.User?.AvatarUrl;
                _settings.Save();

                RefreshProfile();
                SetStatus("Account connected. Client token saved automatically.");
                return;
            }

            throw new InvalidOperationException("Login request timed out.");
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            SetStatus("Sign-in failed: " + ex.Message);
        }
        finally
        {
            _signInButton.Enabled = true;
        }
    }

    private async Task CheckUpdatesAsync(bool updateTelemetry)
    {
        try
        {
            _updateButton.Enabled = false;
            _updateProgress.Value = 0;

            _manifest = await _updater.CheckAsync(_lifetime.Token);

            if (_manifest is null)
            {
                _updateLabel.Text = "Update service unavailable";
                _updateButton.Text = "Check Updates";
                return;
            }

            _latestVersion.Text = "Latest: " + _manifest.Client.Version;
            _telemetryVersion.Text = "Latest: " + _manifest.Telemetry.Version;

            _mandatoryUpdatePending =
                UpdateManager.IsClientUpdateAvailable(_manifest) &&
                _manifest.Client.Mandatory;

            if (UpdateManager.IsClientUpdateAvailable(_manifest))
            {
                _updateLabel.Text = _mandatoryUpdatePending
                    ? "Required launcher update available"
                    : "Launcher update available";
                _updateButton.Text = "Download Update";
                _updateProgress.Value = 0;
            }
            else
            {
                _updateLabel.Text = "Installation up to date";
                _updateButton.Text = "Check Updates";
                _updateProgress.Value = 100;

                if (updateTelemetry)
                    await UpdateTelemetryAsync();
            }

            ApplyMandatoryUpdateState();
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested)
        {
        }
        finally
        {
            _updateButton.Enabled = true;
        }
    }

    private async Task InstallLauncherUpdateAsync()
    {
        if (_manifest is null) return;

        try
        {
            _updateButton.Enabled = false;
            _updateButton.Text = "Updating…";
            await StopTelemetryAsync();
            await _updater.DownloadAndInstallClientAsync(_manifest, _lifetime.Token);
        }
        catch (Exception ex)
        {
            SetStatus("Launcher update failed: " + ex.Message);
            _updateButton.Enabled = true;
            _updateButton.Text = "Download Update";
        }
    }

    private async Task UpdateTelemetryAsync(bool forceLocalInstall = false)
    {
        try
        {
            if (_manifest is null)
                _manifest = await _updater.CheckAsync(_lifetime.Token);

            if (_manifest is null)
            {
                if (forceLocalInstall)
                {
                    var bundled = Path.Combine(AppContext.BaseDirectory, "OpenHaul.Telemetry.dll");
                    if (!File.Exists(bundled))
                        throw new FileNotFoundException("Bundled telemetry DLL is missing.", bundled);

                    var installed = GameLocator.InstallPlugin(bundled);
                    SetStatus(installed.Count > 0
                        ? $"Telemetry plugin installed to {installed.Count} game(s)."
                        : "No ETS2/ATS installations were detected.");
                }
                return;
            }

            var result = await _updater.EnsureTelemetryAsync(_manifest, _lifetime.Token);
            _telemetryVersion.Text = "Latest: " + result.Version;

            if (!result.Success)
            {
                SetStatus("Telemetry update incomplete: " + string.Join(" | ", result.Failures));
                return;
            }

            SetStatus(result.Installed.Count > 0
                ? $"Telemetry updated in {result.Installed.Count} game installation(s)."
                : "Telemetry plugin is up to date.");
        }
        catch (Exception ex)
        {
            SetStatus("Telemetry update failed: " + ex.Message);
        }
    }

    private async Task ToggleTelemetryAsync()
    {
        if (_telemetryCancellation is not null)
        {
            await StopTelemetryAsync();
            return;
        }

        await StartTelemetryAsync();
    }

    private async Task StartTelemetryAsync()
    {
        if (_mandatoryUpdatePending)
        {
            SetStatus("Install the required launcher update first.");
            return;
        }

        if (string.IsNullOrWhiteSpace(_settings.ClientToken))
        {
            SetStatus("Sign in with Steam first.");
            return;
        }

        _settings.Save();
        _telemetryCancellation = CancellationTokenSource.CreateLinkedTokenSource(_lifetime.Token);
        _telemetryService = new TelemetryService(_settings.ToConfig());
        _telemetryService.Status += SetStatus;
        _telemetryButton.Text = "Stop Telemetry";

        _telemetryTask = Task.Run(
            () => _telemetryService.RunAsync(_telemetryCancellation.Token),
            _telemetryCancellation.Token);

        SetStatus("Telemetry started. Open ETS2 or ATS.");
        await Task.CompletedTask;
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
        if (!_telemetryButton.IsDisposed) _telemetryButton.Text = "Start Telemetry";
    }

    private void RefreshProfile()
    {
        if (string.IsNullOrWhiteSpace(_settings.ClientToken))
        {
            _accountSummary.Text = "Not connected";
            _tokenSummary.Text = "No client credential saved.";
            return;
        }

        _accountSummary.Text = string.IsNullOrWhiteSpace(_settings.DisplayName)
            ? "Connected OpenHaul account"
            : $"{_settings.DisplayName} · SteamID {_settings.SteamId}";

        var prefix = _settings.ClientToken.Length > 20
            ? _settings.ClientToken[..20] + "…"
            : "oh_client_…";

        _tokenSummary.Text = "Client token: " + prefix + " · saved locally";
    }

    private string ServerUrl()
    {
        var value = _serverText.Text.Trim();
        if (string.IsNullOrWhiteSpace(value))
            value = _settings.ApiUrl;

        if (string.IsNullOrWhiteSpace(value))
            value = ClientSettings.DefaultApiUrl;

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
            throw new InvalidOperationException("Enter a valid OpenHaul server URL.");

        return value.TrimEnd('/');
    }

    private void ApplyMandatoryUpdateState()
    {
        _playButton.Enabled = !_mandatoryUpdatePending &&
                              GameLocator.FindInstalledGames().Any(game =>
                                  game.Game.Equals(SelectedGameCode(), StringComparison.OrdinalIgnoreCase));
        _telemetryButton.Enabled = !_mandatoryUpdatePending &&
                                   !string.IsNullOrWhiteSpace(_settings.ClientToken);
    }

    private void SetUpdateProgress(int value)
    {
        _updateProgress.Value = Math.Clamp(value, 0, 100);
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

    private T? FindControl<T>(string name) where T : Control
    {
        foreach (Control control in _content.Controls)
        {
            var found = FindRecursive<T>(control, name);
            if (found is not null) return found;
        }
        return null;
    }

    private static T? FindRecursive<T>(Control parent, string name) where T : Control
    {
        if (parent is T typed && typed.Name == name) return typed;
        foreach (Control child in parent.Controls)
        {
            var found = FindRecursive<T>(child, name);
            if (found is not null) return found;
        }
        return null;
    }

    private static void OpenUrl(string url)
    {
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
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
