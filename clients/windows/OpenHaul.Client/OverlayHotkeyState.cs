namespace OpenHaul.Client;

// Shared by hook notifications and asynchronous polling. Neither source owns
// modifier state, so losing focus or missing a key-up cannot leave it latched.
internal sealed class OverlayHotkeyState
{
    public Keys Key { get; }
    public uint Modifiers { get; }
    private bool _keyDown;
    private bool _pendingToggle;

    public OverlayHotkeyState(string? hotkey)
    {
        Key = Keys.I;
        foreach (var part in (hotkey ?? "Alt+I").Split('+',
            StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (part.Equals("Alt", StringComparison.OrdinalIgnoreCase)) Modifiers |= 0x0001;
            else if (part.Equals("Ctrl", StringComparison.OrdinalIgnoreCase) || part.Equals("Control", StringComparison.OrdinalIgnoreCase)) Modifiers |= 0x0002;
            else if (part.Equals("Shift", StringComparison.OrdinalIgnoreCase)) Modifiers |= 0x0004;
            else if (Enum.TryParse<Keys>(part, true, out var key)) Key = key;
        }
    }

    public void Update(bool keyDown, uint modifiers)
    {
        if (keyDown && !_keyDown && modifiers == Modifiers)
            RequestToggle();

        // Always process releases, regardless of the current modifiers.
        _keyDown = keyDown;
    }

    public void RequestToggle() => _pendingToggle = true;

    public bool TryTakeToggle(uint modifiers)
    {
        // Let the foreground app receive key-up before moving focus. This also
        // coalesces hook, polling and WM_HOTKEY into a single activation.
        if (!_pendingToggle || _keyDown || modifiers != 0) return false;
        _pendingToggle = false;
        return true;
    }
}
