using System.Windows.Forms;
using OpenHaul.Client;

internal static class OverlayHotkeyTests
{
    public static void Run(Action<bool, string> check)
    {
        var shortcuts = new (string Name, Keys Key, uint Modifiers)[]
        {
            ("Alt+I", Keys.I, 1), ("Alt+O", Keys.O, 1),
            ("Ctrl+I", Keys.I, 2), ("Ctrl+O", Keys.O, 2),
            ("Shift+F8", Keys.F8, 4), ("F8", Keys.F8, 0),
            ("F9", Keys.F9, 0), ("F10", Keys.F10, 0),
            ("F11", Keys.F11, 0), ("F12", Keys.F12, 0),
        };

        foreach (var shortcut in shortcuts)
        {
            var state = new OverlayHotkeyState(shortcut.Name);
            check(state.Key == shortcut.Key && state.Modifiers == shortcut.Modifiers,
                $"{shortcut.Name} parses the configured key and modifiers");

            for (var press = 0; press < 3; press++)
            {
                state.Update(true, shortcut.Modifiers);
                state.Update(true, shortcut.Modifiers); // Auto-repeat / polling.
                check(!state.TryTakeToggle(shortcut.Modifiers),
                    $"{shortcut.Name} press {press + 1} waits for release before moving focus");
                state.Update(false, shortcut.Modifiers);
                if (shortcut.Modifiers != 0)
                    check(!state.TryTakeToggle(shortcut.Modifiers),
                        $"{shortcut.Name} lets the foreground app receive modifier-up");
                check(state.TryTakeToggle(0) && !state.TryTakeToggle(0),
                    $"{shortcut.Name} press {press + 1} toggles exactly once and rearms");
            }
        }

        var altFirst = new OverlayHotkeyState("Alt+I");
        altFirst.Update(true, 1);
        altFirst.Update(true, 0); // Alt released before I, then an I repeat.
        check(!altFirst.TryTakeToggle(0), "releasing Alt first still waits for I-up");
        altFirst.Update(false, 0);
        check(altFirst.TryTakeToggle(0), "Alt-first release completes the shortcut");
        altFirst.Update(true, 0);
        altFirst.Update(false, 0);
        check(!altFirst.TryTakeToggle(0), "I alone does not inherit a stuck Alt modifier");
        altFirst.Update(true, 1);
        altFirst.Update(false, 0);
        check(altFirst.TryTakeToggle(0), "Alt+I works again after Alt-first release");

        var wrongModifiers = new OverlayHotkeyState("F8");
        wrongModifiers.Update(true, 4);
        wrongModifiers.Update(true, 0);
        wrongModifiers.Update(false, 0);
        check(!wrongModifiers.TryTakeToggle(0), "Shift+F8 does not accidentally trigger plain F8");
        wrongModifiers.Update(true, 0);
        wrongModifiers.Update(false, 0);
        check(wrongModifiers.TryTakeToggle(0), "plain F8 recovers after an unmatched chord");

        var lateModifier = new OverlayHotkeyState("Alt+I");
        lateModifier.Update(true, 0);
        lateModifier.Update(true, 1);
        lateModifier.Update(false, 0);
        check(!lateModifier.TryTakeToggle(0), "holding I then pressing Alt does not turn a repeat into a shortcut");

        var recovered = new OverlayHotkeyState("F8");
        recovered.Update(true, 0); // Hook key-down.
        recovered.Update(true, 0); // Poll sees the same held key.
        recovered.RequestToggle(); // WM_HOTKEY fallback sees the same shortcut.
        recovered.Update(false, 0); // Poll recovers a missing hook key-up.
        check(recovered.TryTakeToggle(0) && !recovered.TryTakeToggle(0),
            "hook, polling and registration notifications do not double-toggle");
        recovered.Update(true, 0);
        recovered.Update(false, 0);
        check(recovered.TryTakeToggle(0), "polling recovers after a missed hook release");

        var registered = new OverlayHotkeyState("Alt+I");
        registered.RequestToggle(); // A press too short to be sampled by polling.
        registered.Update(false, 0);
        check(registered.TryTakeToggle(0), "WM_HOTKEY preserves a quick press between polling ticks");

        var reconfigured = new OverlayHotkeyState("F8");
        reconfigured.Update(true, 0);
        reconfigured = new OverlayHotkeyState("Alt+I");
        check(!reconfigured.TryTakeToggle(0), "changing shortcuts discards pending input from the old shortcut");
    }
}
