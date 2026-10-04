using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace OpenHaul.Client;

/// <summary>
/// External, click-through OpenHaul HUD for ETS2/ATS.
/// It follows the game client window and never injects code into the game.
/// </summary>
public sealed class GameOverlayForm : Form
{
    private const int WsExTransparent = 0x00000020;
    private const int WsExToolWindow = 0x00000080;
    private const int WsExNoActivate = 0x08000000;

    private readonly ClientSettings _settings;
    private readonly System.Windows.Forms.Timer _windowTimer = new();
    private PluginLiveTelemetry? _telemetry;
    private DateTimeOffset _lastTelemetryAt;
    private IntPtr _gameWindow;
    private bool _userVisible = true;

    public bool IsUserVisible => _userVisible;

    public GameOverlayForm(ClientSettings settings)
    {
        _settings = settings;

        Text = "OpenHaul Game Overlay";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        BackColor = Color.Fuchsia;
        TransparencyKey = Color.Fuchsia;
        DoubleBuffered = true;
        StartPosition = FormStartPosition.Manual;

        SetStyle(
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.UserPaint |
            ControlStyles.OptimizedDoubleBuffer,
            true);

        _windowTimer.Interval = 250;
        _windowTimer.Tick += (_, _) => TrackGameWindow();
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= WsExTransparent | WsExToolWindow | WsExNoActivate;
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

        _windowTimer.Start();
        TrackGameWindow();
    }

    public void SetEnabled(bool enabled)
    {
        _settings.OverlayEnabled = enabled;
        if (enabled) _userVisible = true;
        _settings.Save();
        TrackGameWindow(forceShow: enabled);
    }

    public void ToggleVisibility()
    {
        _userVisible = !_userVisible;
        TrackGameWindow(forceShow: _userVisible);
    }

    public void UpdateTelemetry(PluginLiveTelemetry telemetry)
    {
        if (IsDisposed) return;

        if (InvokeRequired)
        {
            BeginInvoke(() => UpdateTelemetry(telemetry));
            return;
        }

        _telemetry = telemetry;
        _lastTelemetryAt = DateTimeOffset.UtcNow;
        Invalidate();
        TrackGameWindow();
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

        // Only render while the truck simulator itself is the active foreground
        // application. This keeps OpenHaul inside/on top of the game instead of
        // floating over the desktop or other applications.
        if (IsIconic(_gameWindow))
        {
            if (Visible) Hide();
            return;
        }

        var foreground = GetForegroundWindow();
        if (foreground != _gameWindow)
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

        if (!IsHandleCreated)
        {
            Show();
            Hide();
        }

        // Place the transparent HUD exactly over the game's client area and
        // force it above the game without activating/focusing the overlay.
        SetWindowPos(
            Handle,
            HwndTopMost,
            origin.X,
            origin.Y,
            width,
            height,
            SwpNoActivate | SwpShowWindow);

        if (!Visible) Show();
        Invalidate();
    }

    private static Process? FindGameProcess()
    {
        static Process? Find(string name) =>
            Process.GetProcessesByName(name)
                .FirstOrDefault(process => process.MainWindowHandle != IntPtr.Zero);

        return Find("eurotrucks2") ?? Find("amtrucks");
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        var panel = new RectangleF(24, 24, 470, 205);
        using var panelPath = Rounded(panel, 16);
        using var panelBrush = new SolidBrush(Color.FromArgb(238, 5, 24, 15));
        using var borderPen = new Pen(Color.FromArgb(220, 45, 160, 96), 1.4f);
        e.Graphics.FillPath(panelBrush, panelPath);
        e.Graphics.DrawPath(borderPen, panelPath);

        using var brandFont = new Font("Segoe UI", 11F, FontStyle.Bold);
        using var speedFont = new Font("Segoe UI Variable Display", 32F, FontStyle.Bold);
        using var headingFont = new Font("Segoe UI", 10F, FontStyle.Bold);
        using var bodyFont = new Font("Segoe UI", 9.5F, FontStyle.Regular);
        using var smallFont = new Font("Segoe UI", 8.5F, FontStyle.Regular);

        using var accent = new SolidBrush(Color.FromArgb(82, 234, 142));
        using var white = new SolidBrush(Color.White);
        using var muted = new SolidBrush(Color.FromArgb(155, 184, 166));
        using var warning = new SolidBrush(Color.FromArgb(245, 190, 82));

        e.Graphics.DrawString("OPENHAUL", brandFont, accent, 44, 39);
        e.Graphics.DrawString("F8  SHOW / HIDE", smallFont, muted, 360, 42);

        var telemetryFresh = _telemetry is not null &&
                             DateTimeOffset.UtcNow - _lastTelemetryAt < TimeSpan.FromSeconds(8);

        if (!telemetryFresh || _telemetry is null)
        {
            e.Graphics.DrawString("Waiting for ETS2 / ATS telemetry…", headingFont, white, 44, 88);
            e.Graphics.DrawString(
                "Start the OpenHaul launcher and telemetry plugin.",
                bodyFont,
                muted,
                44,
                116);
            return;
        }

        var t = _telemetry;
        var speed = Math.Max(0, Math.Round(t.SpeedKph));
        var speedLimit = t.SpeedLimitKph is > 0 ? Math.Round(t.SpeedLimitKph.Value) : (double?)null;

        e.Graphics.DrawString(speed.ToString("0"), speedFont, white, 42, 70);
        e.Graphics.DrawString("km/h", bodyFont, muted, 125, 104);

        if (speedLimit is not null)
        {
            var over = speed > speedLimit.Value + 1;
            e.Graphics.DrawString(
                "LIMIT " + speedLimit.Value.ToString("0"),
                headingFont,
                over ? warning : accent,
                178,
                82);
        }

        var fuel = t.Fuel is null ? "—" : Math.Max(0, t.Fuel.Value).ToString("0");
        var rpm = t.Rpm is null ? "—" : Math.Max(0, t.Rpm.Value).ToString("0");
        e.Graphics.DrawString("Fuel  " + fuel, bodyFont, white, 178, 111);
        e.Graphics.DrawString("RPM  " + rpm, bodyFont, white, 285, 111);

        var truck = string.IsNullOrWhiteSpace(t.Truck) ? "Truck" : t.Truck;
        e.Graphics.DrawString(Trim(truck, 42), headingFont, white, 44, 142);

        var route = RouteText(t);
        e.Graphics.DrawString(Trim(route, 60), bodyFont, muted, 44, 168);

        var nav = NavigationText(t);
        if (!string.IsNullOrWhiteSpace(nav))
            e.Graphics.DrawString(nav, smallFont, accent, 44, 194);
    }

    private static string RouteText(PluginLiveTelemetry t)
    {
        var source = string.IsNullOrWhiteSpace(t.SourceCity) ? "Unknown" : t.SourceCity;
        var destination = string.IsNullOrWhiteSpace(t.DestinationCity) ? "Free drive" : t.DestinationCity;
        var cargo = string.IsNullOrWhiteSpace(t.Cargo) ? "" : " · " + t.Cargo;

        if (destination == "Free drive") return destination;
        return source + " → " + destination + cargo;
    }

    private static string NavigationText(PluginLiveTelemetry t)
    {
        var parts = new List<string>();

        if (t.NavigationDistanceM is > 0)
        {
            var km = t.NavigationDistanceM.Value / 1000d;
            parts.Add(km >= 10 ? km.ToString("0") + " km remaining" : km.ToString("0.0") + " km remaining");
        }

        if (t.NavigationTimeS is > 0)
        {
            var eta = TimeSpan.FromSeconds(t.NavigationTimeS.Value);
            parts.Add(eta.TotalHours >= 1
                ? ((int)eta.TotalHours) + "h " + eta.Minutes + "m ETA"
                : Math.Max(1, eta.Minutes) + "m ETA");
        }

        return string.Join(" · ", parts);
    }

    private static string Trim(string value, int length) =>
        value.Length <= length ? value : value[..Math.Max(0, length - 1)] + "…";

    private static GraphicsPath Rounded(RectangleF rect, float radius)
    {
        var path = new GraphicsPath();
        var diameter = radius * 2f;

        path.AddArc(rect.X, rect.Y, diameter, diameter, 180, 90);
        path.AddArc(rect.Right - diameter, rect.Y, diameter, diameter, 270, 90);
        path.AddArc(rect.Right - diameter, rect.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(rect.X, rect.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();

        return path;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _windowTimer.Stop();
            _windowTimer.Dispose();
        }

        base.Dispose(disposing);
    }

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

    private static readonly IntPtr HwndTopMost = new(-1);
    private const uint SwpNoActivate = 0x0010;
    private const uint SwpShowWindow = 0x0040;

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
