# Builds the PiP window host (pip-window.exe) with the C# compiler that ships
# with Windows, then registers it for the TRINITX extension (current user
# only, no admin). Run again after moving the repo or changing the extension.
#
#   powershell -ExecutionPolicy Bypass -File native-host\install.ps1
#
# The extension id of an unpacked extension comes from its folder path:
# gmpddpmaibejcjaompcignfmodkloaop for this repo on Alexis' PC.
param([string]$ExtensionId = "gmpddpmaibejcjaompcignfmodkloaop")

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$name = "com.trinitx.pip_window"
$exe = Join-Path $here "pip-window.exe"
$manifestPath = Join-Path $here "$name.json"

# 1. Build (winexe: no console window flashes when Chrome starts it).
$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $csc /nologo /optimize /target:winexe "/out:$exe" (Join-Path $here "pip-window.cs")
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

# 2. Host manifest (UTF-8 without BOM, absolute path to the exe).
$manifest = [ordered]@{
  name = $name
  description = "TRINITX: moves the Twitch PiP window beyond Chrome's scripted size cap"
  path = $exe
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json
[IO.File]::WriteAllText($manifestPath, $manifest, (New-Object Text.UTF8Encoding $false))

# 3. Registration for Chrome (current user).
$key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$name"
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name "(Default)" -Value $manifestPath

Write-Output "OK: $name registered for chrome-extension://$ExtensionId/"
Write-Output "    exe: $exe"
