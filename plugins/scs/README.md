# OpenHaul SCS Telemetry Plugin

OpenHaul includes a real native Windows telemetry plugin for Euro Truck Simulator 2 and American Truck Simulator.

It builds against the official **SCS Telemetry SDK 1.15**. The SDK itself is not vendored into this repository; GitHub Actions downloads the official archive from SCS Software during the build.

## Build artifact

Workflow: `.github/workflows/scs-plugin.yml`

Artifact: `OpenHaul-SCS-Telemetry-win-x64` containing `OpenHaul.Telemetry.dll`.

## Installation

The OpenHaul Windows client can install the DLL into all detected Steam copies of ETS2 and ATS:

```powershell
OpenHaul.Client.exe --install-plugin .\OpenHaul.Telemetry.dll
```

The destination is `<game>\bin\win_x64\plugins\OpenHaul.Telemetry.dll`.

## Architecture

The plugin runs inside ETS2/ATS and exposes `\\.\pipe\OpenHaulTelemetry`.

The OpenHaul desktop client connects to that pipe. The DLL only sends game telemetry; it never stores the OpenHaul API key, VTC API key, or driver credentials.

## Live data

The plugin currently reads world X/Y/Z, heading, speed, engine RPM, fuel, odometer, navigation distance/time/speed limit, truck brand/model, cargo, source/destination city/company, configured job income and planned job distance.

## Gameplay events

### Player fined

The native SCS `player.fined` event publishes the raw SCS offence and amount. The desktop client normalizes red signals, speeding, wrong-way and crash offences into OpenHaul fine categories.

### Job delivered

The native SCS `job.delivered` event publishes cargo, source/destination, delivered distance and revenue. The Windows client attaches the driver's OpenHaul identity and VTC before sending it to the server.

## Local build

Download SCS Telemetry SDK 1.15 and pass its `include` directory to CMake:

```powershell
cmake -S plugins/scs -B build/scs -A x64 -DSCS_SDK_INCLUDE="C:\path\to\scs_sdk\include"
cmake --build build/scs --config Release
```


<!-- build-trigger -->
