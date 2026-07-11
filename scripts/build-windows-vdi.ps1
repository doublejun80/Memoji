param(
    [string]$ModelSource = "$env:USERPROFILE\.litert-lm\models\gemma4-e2b\model.litertlm"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $repoRoot "release\memoji-vdi"
$aiRoot = Join-Path $releaseRoot "ai"

Set-Location $repoRoot

if (-not (Test-Path $ModelSource)) {
    throw "Gemma model not found: $ModelSource"
}

node scripts/prepare-vdi-ai-bundle.mjs --output $aiRoot --model $ModelSource

Remove-Item Env:\RUSTFLAGS -ErrorAction SilentlyContinue
$env:MEMOJI_BUILD_FLAVOR = "windows-vdi-x64"
npm run tauri:build -- --no-bundle

$appCandidates = @(
    "src-tauri\target\release\Memoji.exe",
    "src-tauri\target\release\app.exe"
)
$appPath = $appCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $appPath) {
    throw "Windows executable was not found under src-tauri\target\release."
}

Copy-Item $appPath (Join-Path $releaseRoot "Memoji.exe") -Force
New-Item -ItemType Directory -Force -Path (Join-Path $releaseRoot "data") | Out-Null

$instructions = @"
Memoji VDI Offline Bundle

1. Copy this entire folder to a writable local VDI disk.
2. Keep Memoji.exe and the ai folder together.
3. Run Memoji.exe. The app starts the bundled LiteRT-LM server automatically.
4. For persistent notes, set MEMOJI_DATA_PATH to a persistent user folder.

Do not copy Memoji.exe alone. The ai folder contains the LiteRT runtime and Gemma model.
See ai\NOTICE.txt for model and runtime attribution.
"@
Set-Content -Path (Join-Path $releaseRoot "README-VDI.txt") -Value $instructions -Encoding UTF8

Write-Host "VDI offline bundle ready: $releaseRoot"
