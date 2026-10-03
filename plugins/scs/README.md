# OpenHaul SCS Telemetry Plugin

This directory is reserved for the native SCS Telemetry SDK plugin used by Euro Truck Simulator 2 and American Truck Simulator.

## Bridge contract

The plugin will expose a Windows named pipe:

```text
\\.\pipe\OpenHaulTelemetry
```

and write one JSON object per line.

### Live telemetry

```json
{
  "type": "live",
  "data": {
    "driverId": "123",
    "username": "NekoSuneVR",
    "game": "ets2",
    "vtcId": 1,
    "x": 10000.0,
    "y": 35.0,
    "z": -5000.0,
    "heading": 0.42,
    "speedKph": 82.0,
    "truck": "Scania S",
    "cargo": "Medical Vaccines",
    "sourceCity": "Manchester",
    "destinationCity": "Rotterdam"
  }
}
```

### Fine

```json
{
  "type": "fine",
  "data": {
    "vtcId": 1,
    "driverId": "123",
    "game": "ets2",
    "type": "red_light",
    "amount": 360,
    "currency": "EUR",
    "city": "Berlin",
    "occurredAt": "2026-10-03T08:00:00Z"
  }
}
```

### Completed job

```json
{
  "type": "job.completed",
  "data": {
    "vtcId": 1,
    "driverId": "123",
    "game": "ets2",
    "cargo": "Medical Vaccines",
    "sourceCity": "Manchester",
    "destinationCity": "Rotterdam",
    "distanceKm": 693,
    "income": 42120,
    "completedAt": "2026-10-03T09:00:00Z"
  }
}
```

The native plugin itself is not committed as a fake implementation: it will be built against the real SCS Telemetry SDK and will remain open source in this directory.
