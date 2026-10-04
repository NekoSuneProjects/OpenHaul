@echo off
setlocal EnableExtensions

for %%I in ("%~dp0..") do set "OPENHAUL_ROOT=%%~fI"
if not defined OPENHAUL_MAP_REPO set "OPENHAUL_MAP_REPO=NekoSuneProjects/OpenHaul"
set "SELECTED_GAME=all"
set "SKIP_PUBLISH=%OPENHAUL_SKIP_MAP_PUBLISH%"

:parse_args
if "%~1"=="" goto :args_done
if /I "%~1"=="--help" goto :usage_ok
if /I "%~1"=="-h" goto :usage_ok
if /I "%~1"=="--no-publish" (
  set "SKIP_PUBLISH=1"
  shift
  goto :parse_args
)
if /I "%~1"=="--game" (
  if "%~2"=="" goto :usage_error
  set "SELECTED_GAME=%~2"
  shift
  shift
  goto :parse_args
)
if /I "%~1"=="--repo" (
  if "%~2"=="" goto :usage_error
  set "OPENHAUL_MAP_REPO=%~2"
  shift
  shift
  goto :parse_args
)
echo Unknown option: %~1
goto :usage_error

:args_done
if /I "%SELECTED_GAME%"=="all" goto :validated_game
if /I "%SELECTED_GAME%"=="ats" goto :validated_game
if /I "%SELECTED_GAME%"=="ets2" goto :validated_game
echo --game must be all, ats or ets2.
exit /b 2

:validated_game

cd /d "%OPENHAUL_ROOT%" || exit /b 1

where git >nul 2>nul || (
  echo Git is required.
  exit /b 1
)
where npm >nul 2>nul || (
  echo Node.js/npm is required.
  exit /b 1
)

echo Initializing TruckSim Maps submodule...
git submodule update --init --recursive GameMap/maps || exit /b 1

if /I "%SELECTED_GAME%"=="ats" goto :build_ats

echo.
echo Building Euro Truck Simulator 2 map...
powershell -NoProfile -ExecutionPolicy Bypass -File "%OPENHAUL_ROOT%\tools\maps\build-scs-map.ps1" -Game ets2 || exit /b 1

:build_ats
if /I "%SELECTED_GAME%"=="ets2" goto :publish

echo.
echo Building American Truck Simulator map...
powershell -NoProfile -ExecutionPolicy Bypass -File "%OPENHAUL_ROOT%\tools\maps\build-scs-map.ps1" -Game ats || exit /b 1

:publish
if /I "%SKIP_PUBLISH%"=="1" goto :done

if not exist "%OPENHAUL_ROOT%\data-runtime\maps\ets2.pmtiles" (
  echo Publishing requires data-runtime\maps\ets2.pmtiles. Build both maps first or use --no-publish.
  exit /b 1
)
if not exist "%OPENHAUL_ROOT%\data-runtime\maps\ats.pmtiles" (
  echo Publishing requires data-runtime\maps\ats.pmtiles. Build both maps first or use --no-publish.
  exit /b 1
)

echo.
echo Publishing ATS + ETS2 map release to %OPENHAUL_MAP_REPO%...
call npm run map:publish -- --ets2 "%OPENHAUL_ROOT%\data-runtime\maps\ets2.pmtiles" --ats "%OPENHAUL_ROOT%\data-runtime\maps\ats.pmtiles" --repo "%OPENHAUL_MAP_REPO%" || exit /b 1

:done
echo.
echo OpenHaul map build complete.
exit /b 0

:usage_error
echo.
:usage
echo Usage: GameMap\build-maps.bat [--game all^|ats^|ets2] [--no-publish] [--repo OWNER/REPOSITORY]
echo.
echo Builds ATS/ETS2 maps using the GameMap\maps submodule. Steam game paths are auto-detected.
exit /b 2

:usage_ok
echo Usage: GameMap\build-maps.bat [--game all^|ats^|ets2] [--no-publish] [--repo OWNER/REPOSITORY]
echo.
echo Builds ATS/ETS2 maps using the GameMap\maps submodule. Steam game paths are auto-detected.
exit /b 0

