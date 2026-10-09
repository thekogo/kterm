# Downloads the modern ConPTY (conpty.dll + OpenConsole.exe, x64) that portable-pty loads from next to
# kterm.exe. The ConPTY built into Windows drops mouse input for console programs such as wsl.exe.
$ErrorActionPreference = "Stop"
$version = "1.24.261001001"
$out = Join-Path $PSScriptRoot "../src-tauri/conpty"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "conpty-$version"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $tmp, $out | Out-Null
$pkg = Join-Path $tmp "pkg.zip"
Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.windows.console.conpty/$version/microsoft.windows.console.conpty.$version.nupkg" -OutFile $pkg
Expand-Archive $pkg -DestinationPath $tmp -Force
Copy-Item (Join-Path $tmp "runtimes/win-x64/native/conpty.dll") $out -Force
Copy-Item (Join-Path $tmp "build/native/runtimes/x64/OpenConsole.exe") $out -Force
Write-Host "ConPTY $version -> $out"
