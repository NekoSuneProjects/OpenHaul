[Setup]
AppId={{2D17E5C6-27B8-49B1-9F9A-1EE6A5A0E761}
AppName=OpenHaul Client
AppVersion={#MyAppVersion}
AppPublisher=OpenHaul
DefaultDirName={autopf}\OpenHaul
DefaultGroupName=OpenHaul
DisableProgramGroupPage=yes
OutputDir=..\..\..\artifacts\installer
OutputBaseFilename=OpenHaul-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
WizardStyle=modern
SetupLogging=yes

[Files]
Source: "..\..\..\artifacts\OpenHaul.Client\OpenHaul.Client.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\..\artifacts\OpenHaul.Updater\OpenHaul.Updater.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\..\artifacts\OpenHaul.Client\OpenHaul.Telemetry.dll"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\OpenHaul Client"; Filename: "{app}\OpenHaul.Client.exe"
Name: "{autodesktop}\OpenHaul Client"; Filename: "{app}\OpenHaul.Client.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Run]
Filename: "{app}\OpenHaul.Client.exe"; Description: "Launch OpenHaul Client"; Flags: nowait postinstall skipifsilent
