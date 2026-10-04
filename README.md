# OpenHaul Radio Catalog

Machine-generated radio data used by OpenHaul.

Layout:

```
manifest.json
CA/active.json
CA/dead.json
GB/active.json
GB/dead.json
US/active.json
US/dead.json
...
```

- `active.json`: stations that passed the latest daily HTTP stream probe.
- `dead.json`: stations that failed the latest daily probe.
- Dead stations are checked again every day and automatically move back to `active.json` when they recover.
- New Radio Browser stations are discovered during the same daily scan.

Raw files can be consumed from Windows, Linux, macOS, Docker, PowerShell, curl, or any GitHub Action.
