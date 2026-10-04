# OpenHaul Windows Client

The Windows client is the bridge between ETS2/ATS telemetry and an OpenHaul server.

## Current development features

- Connects to a local named pipe called `OpenHaulTelemetry`
- Accepts newline-delimited JSON events from the future SCS native plugin
- Sends live positions to `/api/v1/telemetry/live`
- Sends fines to `/api/v1/telemetry/fines`
- Sends completed jobs to `/api/v1/telemetry/jobs/completed`
- Reconnects when the game/plugin closes
- Includes `--simulate` mode so server/map development can be tested without launching ETS2/ATS

## Overlay hotkeys

Choose the overlay shortcut in the launcher's Settings page (default: `Alt+I`;
`F8` is also available). Press and release the whole shortcut to toggle the
interactive overlay while ATS/ETS2 or the overlay has focus. Focus changes after
release so the game receives the key and modifier releases. Closing the overlay
returns focus to the game; switching to another application hides it without
pulling focus back.

The launcher uses a global keyboard hook with asynchronous polling to recover
missed events, plus a non-repeating registered hotkey if hook installation fails.

To run the Windows client regression checks:

```powershell
dotnet run --project clients/windows/OpenHaul.Client.Tests/OpenHaul.Client.Tests.csproj
```

Manual game check: with either simulator focused, toggle three times using `F8`,
then `Alt+I` (release I first, then repeat releasing Alt first). Hold the shortcut
to check it toggles only once on release. Repeat with the launcher minimized to
the tray, close through the overlay UI, and Alt+Tab away and back. Verify that
keyboard control returns to the game and modifiers are not stuck.

## Environment

```text
OPENHAUL_API_URL=http://localhost:3001
# Recommended for normal Steam-linked users:
OPENHAUL_CLIENT_TOKEN=oh_client_your_account_token

# Instance administrators can alternatively use:
OPENHAUL_INGEST_KEY=change-this-ingest-key
OPENHAUL_DRIVER_ID=steam-or-openhaul-driver-id
OPENHAUL_USERNAME=Driver Name
OPENHAUL_VTC_ID=1
OPENHAUL_VTC_NAME=My VTC
OPENHAUL_VTC_TAG=VTC
OPENHAUL_PIPE_NAME=OpenHaulTelemetry
```

## Simulation

```powershell
$env:OPENHAUL_INGEST_KEY="change-this-ingest-key"
$env:OPENHAUL_VTC_ID="1"
dotnet run --project .\OpenHaul.Client\OpenHaul.Client.csproj -- --simulate
```

This creates a moving ETS2 test driver that appears on the OpenHaul global/VTC live feeds.


## Account-linked authentication

Sign in to the OpenHaul website with Steam and create a Windows Client token from the Account page. Set that value as `OPENHAUL_CLIENT_TOKEN`.

When a client token is used, the server derives the driver SteamID and display name from the account. If `OPENHAUL_VTC_ID` is set, the API verifies that the account is an active member of that VTC before accepting VTC-linked telemetry. Leave `OPENHAUL_VTC_ID` empty to track as an independent driver.
