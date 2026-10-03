param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("ets2", "ats")]
  [string]$Game,

  [Parameter(Mandatory = $true)]
  [string]$GamePath,

  [Parameter(Mandatory = $true)]
  [string]$TruckSimMapsPath,

  [string]$WorkDir = ".\data-runtime\map-build"
)

$ErrorActionPreference = "Stop"

$OpenHaulRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$GamePath = (Resolve-Path $GamePath).Path
$TruckSimMapsPath = (Resolve-Path $TruckSimMapsPath).Path

$MapId = if ($Game -eq "ets2") { "europe" } else { "usa" }
$ParserOut = Join-Path (Resolve-Path -LiteralPath $OpenHaulRoot) $WorkDir
$GeneratorOut = Join-Path $ParserOut "generated"

New-Item -ItemType Directory -Force $ParserOut | Out-Null
New-Item -ItemType Directory -Force $GeneratorOut | Out-Null

Write-Host "OpenHaul SCS map builder"
Write-Host "Game: $Game ($MapId)"
Write-Host "Game files: $GamePath"
Write-Host "TruckSim Maps: $TruckSimMapsPath"
Write-Host "Working directory: $ParserOut"

Push-Location $TruckSimMapsPath
try {
  if (-not (Test-Path "node_modules")) {
    Write-Host "Installing TruckSim Maps dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
  }

  Write-Host "Parsing installed SCS game files..."
  npx parser -i "$GamePath" -o "$ParserOut"
  if ($LASTEXITCODE -ne 0) { throw "TruckSim Maps parser failed." }

  Write-Host "Generating PMTiles..."
  npx generator map -m $MapId -i "$ParserOut" -o "$GeneratorOut"
  if ($LASTEXITCODE -ne 0) { throw "TruckSim Maps generator failed." }
}
finally {
  Pop-Location
}

$ExpectedFile = Join-Path $GeneratorOut "$Game.pmtiles"
if (-not (Test-Path $ExpectedFile)) {
  throw "Expected PMTiles output was not found: $ExpectedFile"
}

Push-Location $OpenHaulRoot
try {
  Write-Host "Importing PMTiles into OpenHaul..."
  npm run map:import -- --game $Game --file "$ExpectedFile"
  if ($LASTEXITCODE -ne 0) { throw "OpenHaul PMTiles import failed." }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Done. Restart the OpenHaul API/web containers if they are already running."
Write-Host "The live map will auto-detect the imported $Game PMTiles asset."
