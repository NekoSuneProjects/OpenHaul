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
