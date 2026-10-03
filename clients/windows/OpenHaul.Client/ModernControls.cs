using System.Drawing.Drawing2D;

namespace OpenHaul.Client;

public sealed class RoundedPanel : Panel
{
    public int Radius { get; set; } = 14;
    public Color BorderColor { get; set; } = Color.FromArgb(24, 78, 52);
    public int BorderWidth { get; set; } = 1;

    public RoundedPanel()
    {
        DoubleBuffered = true;
        ResizeRedraw = true;
    }

    protected override void OnResize(EventArgs eventargs)
    {
        base.OnResize(eventargs);
        using var path = CreatePath(ClientRectangle, Radius);
        Region = new Region(path);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (BorderWidth <= 0) return;

        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = ClientRectangle;
        rect.Width -= 1;
        rect.Height -= 1;

        using var path = CreatePath(rect, Radius);
        using var pen = new Pen(BorderColor, BorderWidth);
        e.Graphics.DrawPath(pen, path);
    }

    private static GraphicsPath CreatePath(Rectangle rect, int radius)
    {
        var path = new GraphicsPath();
        var diameter = Math.Max(2, radius * 2);
        var arc = new Rectangle(rect.Location, new Size(diameter, diameter));

        path.AddArc(arc, 180, 90);
        arc.X = rect.Right - diameter;
        path.AddArc(arc, 270, 90);
        arc.Y = rect.Bottom - diameter;
        path.AddArc(arc, 0, 90);
        arc.X = rect.Left;
        path.AddArc(arc, 90, 90);
        path.CloseFigure();

        return path;
    }
}
