[CmdletBinding(DefaultParameterSetName = "Build")]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("ets2", "ats")]
  [string]$Game,

  [Parameter(Mandatory = $true, ParameterSetName = "Build")]
  [string]$GamePath,

  [Parameter(Mandatory = $true, ParameterSetName = "Build")]
  [string]$TruckSimMapsPath,

  [string]$WorkDir = ".\\data-runtime\\map-build",

  [string]$TippecanoeImage = "openhaul-tippecanoe:latest",

  [switch]$UpdateTruckSimMaps,

  [Parameter(Mandatory = $true, ParameterSetName = "TilesOnly")]
  [switch]$TilesOnly
)

$ErrorActionPreference = "Stop"

$OpenHaulRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
if (-not $TilesOnly) {
  $GamePath = (Resolve-Path $GamePath).Path
  $TruckSimMapsPath = (Resolve-Path $TruckSimMapsPath).Path

  # npm searches parent directories when the selected directory has no package.json.
  # Validate before installing anything so an empty folder cannot select OpenHaul.
  foreach ($RequiredFile in @("package.json", "packages/clis/parser/package.json", "packages/clis/parser/index.ts", "packages/clis/generator/package.json", "packages/clis/generator/index.ts")) {
    if (-not (Test-Path -LiteralPath (Join-Path $TruckSimMapsPath $RequiredFile) -PathType Leaf)) {
      throw "TruckSimMapsPath must point to a TruckSim Maps source checkout, not an empty game/output folder. Missing: $RequiredFile in $TruckSimMapsPath. Clone https://github.com/truckermudgeon/maps.git with --recurse-submodules, then pass the clone root as -TruckSimMapsPath. See README.md: Real SCS road map data."
    }
  }

  $RequiredGameArchives = @(
    "base.scs",
    "base_map.scs",
    "base_share.scs",
    "core.scs",
    "def.scs",
    "locale.scs",
    "version.scs"
  )

  $MissingGameArchives = @()
  foreach ($Archive in $RequiredGameArchives) {
    if (-not (Test-Path -LiteralPath (Join-Path $GamePath $Archive) -PathType Leaf)) {
      $MissingGameArchives += $Archive
    }
  }

  if ($MissingGameArchives.Count -gt 0) {
    $GameName = if ($Game -eq "ats") { "American Truck Simulator" } else { "Euro Truck Simulator 2" }
    throw "$GameName game root is invalid or incomplete. Expected the directory containing the .scs archives. Missing: $($MissingGameArchives -join ', '). Path received: $GamePath"
  }

  $ScsCount = @(Get-ChildItem -LiteralPath $GamePath -Filter "*.scs" -File).Count
  Write-Host "Validated $Game installation: $ScsCount .scs archives found."
}

$MapId = if ($Game -eq "ets2") { "europe" } else { "usa" }
$ParserOut = Join-Path $OpenHaulRoot $WorkDir
$GeneratorOut = Join-Path $ParserOut "generated"
$GeoJsonOut = Join-Path $GeneratorOut "geojson"
$PmTilesOut = Join-Path $GeneratorOut "pmtiles"

New-Item -ItemType Directory -Force $ParserOut | Out-Null
New-Item -ItemType Directory -Force $GeneratorOut | Out-Null
New-Item -ItemType Directory -Force $GeoJsonOut | Out-Null
New-Item -ItemType Directory -Force $PmTilesOut | Out-Null

$GeneratorOut = (Resolve-Path -LiteralPath $GeneratorOut).Path
$GeoJsonOut = (Resolve-Path -LiteralPath $GeoJsonOut).Path
$PmTilesOut = (Resolve-Path -LiteralPath $PmTilesOut).Path

# One-time migration from the old flat generated/ layout.
$LegacyGeoJson = Join-Path $GeneratorOut "$Game.geojson"
$LegacyPmTiles = Join-Path $GeneratorOut "$Game.pmtiles"
$GeoJsonFile = Join-Path $GeoJsonOut "$Game.geojson"
$PmTilesFile = Join-Path $PmTilesOut "$Game.pmtiles"

if ((Test-Path -LiteralPath $LegacyGeoJson -PathType Leaf) -and -not (Test-Path -LiteralPath $GeoJsonFile -PathType Leaf)) {
  Move-Item -LiteralPath $LegacyGeoJson -Destination $GeoJsonFile -Force
  Write-Host "Migrated legacy GeoJSON backup to: $GeoJsonFile"
}

if ((Test-Path -LiteralPath $LegacyPmTiles -PathType Leaf) -and -not (Test-Path -LiteralPath $PmTilesFile -PathType Leaf)) {
  Move-Item -LiteralPath $LegacyPmTiles -Destination $PmTilesFile -Force
  Write-Host "Migrated legacy PMTiles backup to: $PmTilesFile"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required to build PMTiles with Tippecanoe."
}

# Check Docker before spending time parsing installed game files.
$DockerOs = docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0) {
  throw "Docker is unavailable. Start Docker Desktop and retry."
}
if ($DockerOs.Trim() -ne "linux") {
  throw "OpenHaul map generation needs Docker Desktop in Linux containers mode. Current Docker OSType: $DockerOs"
}

function Ensure-TippecanoeImage {
  param([string]$Image)

  $ImageExists = docker image ls --format "{{.Repository}}:{{.Tag}}" | Where-Object { $_ -eq $Image }
  if ($ImageExists) {
    docker run --rm $Image tippecanoe --version
    if ($LASTEXITCODE -eq 0) { return }
  }

  if ($Image -ne "openhaul-tippecanoe:latest") {
    Write-Host "Trying custom Tippecanoe image: $Image"
    docker run --rm $Image tippecanoe --version
    if ($LASTEXITCODE -eq 0) { return }
    Write-Warning "Custom Tippecanoe image failed. Falling back to OpenHaul local image."
  }

  $Dockerfile = Join-Path $PSScriptRoot "tippecanoe.Dockerfile"
  if (-not (Test-Path -LiteralPath $Dockerfile -PathType Leaf)) {
    throw "Missing OpenHaul Tippecanoe Dockerfile: $Dockerfile"
  }

  Write-Host "Building OpenHaul Tippecanoe image locally from the official Felt source..."
  docker build --pull -f "$Dockerfile" -t "openhaul-tippecanoe:latest" "$PSScriptRoot"
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to build the local OpenHaul Tippecanoe image. Check Docker Desktop networking and the build output above."
  }

  docker run --rm "openhaul-tippecanoe:latest" tippecanoe --version
  if ($LASTEXITCODE -ne 0) {
    throw "The locally built OpenHaul Tippecanoe image could not run."
  }

  $script:TippecanoeImage = "openhaul-tippecanoe:latest"
}

Ensure-TippecanoeImage -Image $TippecanoeImage

Write-Host "OpenHaul SCS map builder"
Write-Host "Game: $Game ($MapId)"
Write-Host "Game files: $GamePath"
Write-Host "TruckSim Maps: $TruckSimMapsPath"
Write-Host "Working directory: $ParserOut"

if (-not $TilesOnly) {
  Push-Location $TruckSimMapsPath
  try {
    if ($UpdateTruckSimMaps) {
      if (-not (Test-Path -LiteralPath (Join-Path $TruckSimMapsPath ".git"))) {
        throw "-UpdateTruckSimMaps requires TruckSimMapsPath to be a Git checkout."
      }
      Write-Host "Updating TruckSim Maps checkout..."
      git pull --ff-only
      if ($LASTEXITCODE -ne 0) { throw "Unable to update TruckSim Maps checkout. Commit/stash local changes or update it manually." }
      git submodule update --init --recursive
      if ($LASTEXITCODE -ne 0) { throw "Unable to update TruckSim Maps submodules." }
    }

    $TruckSimCommit = git rev-parse --short HEAD 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Host "TruckSim Maps commit: $TruckSimCommit" }

    $TsxCli = Join-Path $TruckSimMapsPath "node_modules/tsx/dist/cli.mjs"
    if (-not (Test-Path -LiteralPath $TsxCli -PathType Leaf)) {
      Write-Host "Installing TruckSim Maps dependencies..."
      npm install
      if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
    }

    if (-not (Test-Path -LiteralPath $TsxCli -PathType Leaf)) {
      throw "TruckSim Maps dependencies are incomplete: $TsxCli is missing. Run npm install in $TruckSimMapsPath."
    }

    Write-Host "Building TruckSim Maps native parser addons..."
    node (Join-Path $PSScriptRoot "prepare-trucksim-maps.mjs") "$TruckSimMapsPath"
    if ($LASTEXITCODE -ne 0) { throw "TruckSim Maps compatibility setup failed." }
    npm run build --workspace=packages/clis/parser
    if ($LASTEXITCODE -ne 0) { throw "TruckSim Maps native parser build failed. Ensure submodules are initialized and node-gyp build prerequisites are installed (Python and Visual Studio C++ Build Tools on Windows)." }

    # Use this checkout's TypeScript runner directly; never fetch generic CLI names
    # from the npm registry or depend on Unix-style parser symlinks on Windows.
    Write-Host "Parsing installed SCS game files..."
    $ParserLog = Join-Path $ParserOut "$Game-parser.log"
    $ParserErrorLog = Join-Path $ParserOut "$Game-parser-error.log"
    Remove-Item -LiteralPath $ParserLog, $ParserErrorLog -Force -ErrorAction SilentlyContinue

    # Start-Process joins -ArgumentList into a command line on Windows.
    # Quote path arguments explicitly so game folders such as
    # "American Truck Simulator" are passed as one argument.
    function Quote-NativeArgument {
      param([string]$Value)
      return '"' + ($Value -replace '"', '\"') + '"'
    }

    $ParserArgs = @(
      (Quote-NativeArgument $TsxCli),
      "packages/clis/parser/index.ts",
      "-i",
      (Quote-NativeArgument $GamePath),
      "-o",
      (Quote-NativeArgument $ParserOut)
    )

    Write-Host "Parser input path: $GamePath"
    Write-Host "Parser output path: $ParserOut"

    $ParserProcess = Start-Process -FilePath "node" `
      -ArgumentList $ParserArgs `
      -WorkingDirectory $TruckSimMapsPath `
      -RedirectStandardOutput $ParserLog `
      -RedirectStandardError $ParserErrorLog `
      -NoNewWindow `
      -Wait `
      -PassThru

    if (Test-Path -LiteralPath $ParserLog) {
      Get-Content -LiteralPath $ParserLog
    }

    if ($ParserProcess.ExitCode -ne 0) {
      Write-Host ""
      Write-Host "----- TruckSim Maps parser stdout tail -----" -ForegroundColor Yellow
      if (Test-Path -LiteralPath $ParserLog) {
        Get-Content -LiteralPath $ParserLog | Select-Object -Last 120
      }
      Write-Host "----- TruckSim Maps parser stderr tail -----" -ForegroundColor Red
      if (Test-Path -LiteralPath $ParserErrorLog) {
        Get-Content -LiteralPath $ParserErrorLog | Select-Object -Last 120
      }
      Write-Host "---------------------------------------------" -ForegroundColor Red
      throw "TruckSim Maps parser failed with exit code $($ParserProcess.ExitCode). Full logs: $ParserLog and $ParserErrorLog"
    }

    Write-Host "Generating SCS road/prefab/city GeoJSON..."
    node "$TsxCli" "packages/clis/generator/index.ts" map -m $MapId -i "$ParserOut" -o "$GeoJsonOut" -t geojson
    if ($LASTEXITCODE -ne 0) { throw "TruckSim Maps GeoJSON generator failed." }
    Write-Host "GeoJSON backup: $GeoJsonFile"
  }
  finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $GeoJsonFile -PathType Leaf)) {
  throw "Expected GeoJSON backup was not found: $GeoJsonFile"
}

$PmTilesBuildingFile = Join-Path $PmTilesOut "$Game.building.pmtiles"
Remove-Item -LiteralPath $PmTilesBuildingFile -Force -ErrorAction SilentlyContinue

Write-Host "Generating PMTiles with Tippecanoe Docker image: $TippecanoeImage"
docker run --rm `
  --mount "type=bind,source=${GeoJsonOut},target=/geojson,readonly" `
  --mount "type=bind,source=${PmTilesOut},target=/pmtiles" `
  $TippecanoeImage `
  tippecanoe `
  -Z1 -z13 -B4 -b10 --force `
  -y type -y dlcGuard -y zIndex -y height -y hidden -y secret `
  -y poiType -y poiName -y sprite -y scaleRank -y capital -y roadType `
  -y color -y name `
  -o "/pmtiles/$Game.building.pmtiles" `
  "/geojson/$Game.geojson"

if ($LASTEXITCODE -ne 0) {
  Remove-Item -LiteralPath $PmTilesBuildingFile -Force -ErrorAction SilentlyContinue
  throw "Tippecanoe PMTiles generation failed (exit $LASTEXITCODE). The previous PMTiles backup and live map were left untouched. Retry with -Game $Game -TilesOnly to reuse the GeoJSON."
}

if (-not (Test-Path -LiteralPath $PmTilesBuildingFile -PathType Leaf)) {
  throw "Expected completed PMTiles build was not found: $PmTilesBuildingFile"
}

# Replace the generated backup only after the new archive completed successfully.
Remove-Item -LiteralPath $PmTilesFile -Force -ErrorAction SilentlyContinue
Move-Item -LiteralPath $PmTilesBuildingFile -Destination $PmTilesFile -Force
Write-Host "PMTiles backup updated: $PmTilesFile"

Push-Location $OpenHaulRoot
try {
  Write-Host "Publishing completed PMTiles into OpenHaul live maps..."
  npm run map:import -- --game $Game --file "$PmTilesFile"
  if ($LASTEXITCODE -ne 0) { throw "OpenHaul PMTiles import failed." }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Done."
Write-Host "GeoJSON backup: $GeoJsonFile"
Write-Host "PMTiles backup: $PmTilesFile"
Write-Host "Live map: $(Join-Path $OpenHaulRoot "data-runtime/maps/$Game.pmtiles")"
Write-Host "OpenHaul API will serve: /api/v1/public/map/$Game.pmtiles"
Write-Host "The web live map auto-detects the replaced asset."
