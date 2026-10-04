using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace OpenHaul.Client;

/// <summary>
/// Full OpenHaul in-game workspace for ETS2/ATS.
/// F8 opens a real interactive overlay over the game with map, drive and settings pages.
/// The overlay is hidden when the simulator is not the foreground app.
/// </summary>
public sealed class GameOverlayForm : Form
{
    private const int WsExToolWindow = 0x00000080;

    private readonly ClientSettings _settings;
    private readonly WebView2 _webView = new();
    private readonly System.Windows.Forms.Timer _windowTimer = new();
    private PluginLiveTelemetry? _telemetry;
    private IntPtr _gameWindow;
    private bool _userVisible;
    private bool _webReady;

    public bool IsUserVisible => _userVisible;

    public GameOverlayForm(ClientSettings settings)
    {
        _settings = settings;

        Text = "OpenHaul Game Overlay";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        BackColor = Color.Black;
        StartPosition = FormStartPosition.Manual;
        KeyPreview = true;

        _webView.Dock = DockStyle.Fill;
        Controls.Add(_webView);

        _windowTimer.Interval = 150;
        _windowTimer.Tick += (_, _) => TrackGameWindow();

        Shown += async (_, _) => await EnsureWebViewAsync();
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= WsExToolWindow;
            return cp;
        }
    }

    public void Start()
    {
        if (!IsHandleCreated)
        {
            Show();
            Hide();
        }

        _userVisible = false;
        _windowTimer.Start();
        TrackGameWindow();
    }

    public void SetEnabled(bool enabled)
    {
        _settings.OverlayEnabled = enabled;
        _settings.Save();

        if (!enabled)
        {
            _userVisible = false;
            Hide();
        }
    }

    public void ToggleVisibility()
    {
        if (!_settings.OverlayEnabled)
        {
            _settings.OverlayEnabled = true;
            _settings.Save();
        }

        _userVisible = !_userVisible;

        if (_userVisible)
        {
            _ = EnsureWebViewAsync();
            TrackGameWindow(forceShow: true);
        }
        else
        {
            Hide();
        }
    }

    public void ReloadUi()
    {
        if (!_webReady) return;
        NavigateOverlay();
    }

    public void UpdateTelemetry(PluginLiveTelemetry telemetry)
    {
        _telemetry = telemetry;

        if (!_webReady || _webView.CoreWebView2 is null) return;

        try
        {
            var payload = JsonSerializer.Serialize(new
            {
                type = "telemetry.local",
                value = telemetry,
            });
            _webView.CoreWebView2.PostWebMessageAsJson(payload);
        }
        catch
        {
            // The web overlay also receives server-side realtime data,
            // so local message failures must never interrupt telemetry.
        }
    }

    private async Task EnsureWebViewAsync()
    {
        if (_webReady || IsDisposed) return;

        try
        {
            await _webView.EnsureCoreWebView2Async();
            if (_webView.CoreWebView2 is null) return;

            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
            _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

            _webReady = true;
            NavigateOverlay();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "OpenHaul could not start the in-game overlay browser.\n\n" +
                "Install/repair Microsoft Edge WebView2 Runtime and restart OpenHaul.\n\n" +
                ex.Message,
                "OpenHaul Overlay",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    private void NavigateOverlay()
    {
        if (!_webReady || _webView.CoreWebView2 is null) return;

        var root = ResolveWebRoot();
        var url =
            root +
            "/overlay?driver=" + Uri.EscapeDataString(_settings.SteamId ?? "") +
            "&mode=" + Uri.EscapeDataString(_settings.OverlayMapType) +
            "&size=" + Uri.EscapeDataString(_settings.OverlayMapSize) +
            "&traffic=" + (_settings.OverlayTrafficAlerts ? "1" : "0") +
            "&staff=" + (_settings.OverlayStaffAlerts ? "1" : "0") +
            "&missions=" + (_settings.OverlayCargoMissions ? "1" : "0");

        _webView.CoreWebView2.Navigate(url);
    }

    private string ResolveWebRoot()
    {
        var configured = (_settings.ApiUrl ?? "").Trim().TrimEnd('/');
        if (string.IsNullOrWhiteSpace(configured))
            return "https://openhaul.nekosunevr.co.uk";

        if (configured.StartsWith("http://localhost:3001", StringComparison.OrdinalIgnoreCase))
            return configured.Replace(":3001", ":3000", StringComparison.OrdinalIgnoreCase);

        if (configured.StartsWith("http://127.0.0.1:3001", StringComparison.OrdinalIgnoreCase))
            return configured.Replace(":3001", ":3000", StringComparison.OrdinalIgnoreCase);

        return configured;
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var document = JsonDocument.Parse(e.WebMessageAsJson);
            var root = document.RootElement;
            var type = root.TryGetProperty("type", out var typeValue)
                ? typeValue.GetString()
                : null;

            switch (type)
            {
                case "overlay.hide":
                    _userVisible = false;
                    Hide();
                    break;

                case "overlay.mapType":
                    if (root.TryGetProperty("value", out var mapType))
                    {
                        var value = mapType.GetString();
                        if (value is "road" or "satellite" or "xray")
                        {
                            _settings.OverlayMapType = value;
                            _settings.Save();
                        }
                    }
                    break;

                case "overlay.mapSize":
                    if (root.TryGetProperty("value", out var mapSize))
                    {
                        var value = mapSize.GetString();
                        if (value is "compact" or "medium" or "large")
                        {
                            _settings.OverlayMapSize = value;
                            _settings.Save();
                        }
                    }
                    break;

                case "overlay.preference":
                    if (root.TryGetProperty("key", out var prefKey) &&
                        root.TryGetProperty("value", out var prefValue) &&
                        prefValue.ValueKind is JsonValueKind.True or JsonValueKind.False)
                    {
                        var enabled = prefValue.GetBoolean();
                        switch (prefKey.GetString())
                        {
                            case "traffic":
                                _settings.OverlayTrafficAlerts = enabled;
                                break;
                            case "staff":
                                _settings.OverlayStaffAlerts = enabled;
                                break;
                            case "missions":
                                _settings.OverlayCargoMissions = enabled;
                                break;
                        }
                        _settings.Save();
                    }
                    break;
            }
        }
        catch
        {
            // Ignore malformed UI messages.
        }
    }

    private void TrackGameWindow(bool forceShow = false)
    {
        if (IsDisposed) return;

        if (!_settings.OverlayEnabled || !_userVisible)
        {
            if (Visible) Hide();
            return;
        }

        var game = FindGameProcess();
        if (game is null || game.MainWindowHandle == IntPtr.Zero)
        {
            _gameWindow = IntPtr.Zero;
            if (Visible) Hide();
            return;
        }

        _gameWindow = game.MainWindowHandle;

        if (IsIconic(_gameWindow))
        {
            if (Visible) Hide();
            return;
        }

        var foreground = GetForegroundWindow();
        if (!forceShow && foreground != _gameWindow && foreground != Handle)
        {
            if (Visible) Hide();
            return;
        }

        if (!GetClientRect(_gameWindow, out var rect))
        {
            if (Visible) Hide();
            return;
        }

        var origin = new NativePoint { X = 0, Y = 0 };
        if (!ClientToScreen(_gameWindow, ref origin))
        {
            if (Visible) Hide();
            return;
        }

        var width = Math.Max(1, rect.Right - rect.Left);
        var height = Math.Max(1, rect.Bottom - rect.Top);

        SetWindowPos(
            Handle,
            HwndTopMost,
            origin.X,
            origin.Y,
            width,
            height,
            SwpShowWindow);

        if (!Visible) Show();

        BringToFront();
        _webView.Focus();
    }

    private static Process? FindGameProcess()
    {
        static Process? Find(string name) =>
            Process.GetProcessesByName(name)
                .FirstOrDefault(process => process.MainWindowHandle != IntPtr.Zero);

        return Find("eurotrucks2") ?? Find("amtrucks");
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _windowTimer.Stop();
            _windowTimer.Dispose();

            if (_webView.CoreWebView2 is not null)
                _webView.CoreWebView2.WebMessageReceived -= OnWebMessageReceived;

            _webView.Dispose();
        }

        base.Dispose(disposing);
    }

    private static readonly IntPtr HwndTopMost = new(-1);
    private const uint SwpShowWindow = 0x0040;

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint
    {
        public int X;
        public int Y;
    }

    [DllImport("user32.dll")]
    private static extern bool GetClientRect(IntPtr hWnd, out NativeRect lpRect);

    [DllImport("user32.dll")]
    private static extern bool ClientToScreen(IntPtr hWnd, ref NativePoint lpPoint);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int X,
        int Y,
        int cx,
        int cy,
        uint uFlags);
}
