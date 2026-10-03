param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("ets2", "ats")]
  [string]$Game,

  [Parameter(Mandatory = $true)]
  [string]$GamePath,

  [Parameter(Mandatory = $true)]
  [string]$TruckSimMapsPath,

  [string]$WorkDir = ".\\data-runtime\\map-build",

  [string]$TippecanoeImage = "ghcr.io/felt/tippecanoe:latest"
)

$ErrorActionPreference = "Stop"

$OpenHaulRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$GamePath = (Resolve-Path $GamePath).Path
$TruckSimMapsPath = (Resolve-Path $TruckSimMapsPath).Path

# npm searches parent directories when the selected directory has no package.json.
# Validate before installing anything so an empty folder cannot select OpenHaul.
foreach ($RequiredFile in @("package.json", "packages/clis/parser/package.json", "packages/clis/parser/index.ts", "packages/clis/generator/package.json", "packages/clis/generator/index.ts")) {
  if (-not (Test-Path -LiteralPath (Join-Path $TruckSimMapsPath $RequiredFile) -PathType Leaf)) {
    throw "TruckSimMapsPath must point to a TruckSim Maps source checkout, not an empty game/output folder. Missing: $RequiredFile in $TruckSimMapsPath. Clone https://github.com/truckermudgeon/maps.git with --recurse-submodules, then pass the clone root as -TruckSimMapsPath. See README.md: Real SCS road map data."
  }
}

$MapId = if ($Game -eq "ets2") { "europe" } else { "usa" }
$ParserOut = Join-Path $OpenHaulRoot $WorkDir
$GeneratorOut = Join-Path $ParserOut "generated"

New-Item -ItemType Directory -Force $ParserOut | Out-Null
New-Item -ItemType Directory -Force $GeneratorOut | Out-Null

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required to build PMTiles with Tippecanoe."
}

Write-Host "OpenHaul SCS map builder"
Write-Host "Game: $Game ($MapId)"
Write-Host "Game files: $GamePath"
Write-Host "TruckSim Maps: $TruckSimMapsPath"
Write-Host "Working directory: $ParserOut"

Push-Location $TruckSimMapsPath
try {
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
  npm run build --workspace=packages/clis/parser
  if ($LASTEXITCODE -ne 0) { throw "TruckSim Maps native parser build failed. Ensure submodules are initialized and node-gyp build prerequisites are installed (Python and Visual Studio C++ Build Tools on Windows)." }

  # Use this checkout's TypeScript runner directly; never fetch generic CLI names
  # from the npm registry or depend on Unix-style parser symlinks on Windows.
  Write-Host "Parsing installed SCS game files..."
  node "$TsxCli" "packages/clis/parser/index.ts" -i "$GamePath" -o "$ParserOut"
  if ($LASTEXITCODE -ne 0) { throw "TruckSim Maps parser failed." }

  Write-Host "Generating SCS road/prefab/city GeoJSON..."
  node "$TsxCli" "packages/clis/generator/index.ts" map -m $MapId -i "$ParserOut" -o "$GeneratorOut" -t geojson
  if ($LASTEXITCODE -ne 0) { throw "TruckSim Maps GeoJSON generator failed." }
}
finally {
  Pop-Location
}

$GeoJsonFile = Join-Path $GeneratorOut "$Game.geojson"
$PmTilesFile = Join-Path $GeneratorOut "$Game.pmtiles"

if (-not (Test-Path $GeoJsonFile)) {
  throw "Expected GeoJSON output was not found: $GeoJsonFile"
}

Write-Host "Generating PMTiles with Tippecanoe Docker image..."
docker run --rm `
  -v "${GeneratorOut}:/data" `
  $TippecanoeImage `
  tippecanoe `
  -Z4 -z13 -B4 -b10 --force `
  -y type -y dlcGuard -y zIndex -y height -y hidden -y secret `
  -y poiType -y poiName -y sprite -y scaleRank -y capital -y roadType `
  -y color -y name `
  -o "/data/$Game.pmtiles" `
  "/data/$Game.geojson"

if ($LASTEXITCODE -ne 0) {
  throw "Tippecanoe PMTiles generation failed."
}

if (-not (Test-Path $PmTilesFile)) {
  throw "Expected PMTiles output was not found: $PmTilesFile"
}

Push-Location $OpenHaulRoot
try {
  Write-Host "Importing PMTiles into OpenHaul..."
  npm run map:import -- --game $Game --file "$PmTilesFile"
  if ($LASTEXITCODE -ne 0) { throw "OpenHaul PMTiles import failed." }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Done."
Write-Host "OpenHaul API will serve: /api/v1/public/map/$Game.pmtiles"
Write-Host "The web live map auto-detects the imported asset."
