$ErrorActionPreference = "Stop"

$env:RUSTFLAGS = "-C target-cpu=cascadelake"
$env:MEMOJI_BUILD_FLAVOR = "x64-avx512"

npm run tauri:build

New-Item -ItemType Directory -Force -Path "release/windows-avx512" | Out-Null
$appCandidates = @(
    "src-tauri/target/release/Memoji.exe",
    "src-tauri/target/release/app.exe"
)
$setupCandidates = @(
    "src-tauri/target/release/bundle/nsis/Memoji_2.0.0_x64-setup.exe",
    "src-tauri/target/release/bundle/nsis/Memoji_2.0.0-setup.exe"
)
$appPath = $appCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$setupPath = $setupCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $appPath) {
    throw "Windows executable was not found under src-tauri/target/release."
}

Copy-Item $appPath "release/windows-avx512/Memoji_2.0.0_x64-avx512.exe" -Force
if ($setupPath) {
    Copy-Item $setupPath "release/windows-avx512/Memoji_2.0.0_x64-avx512-setup.exe" -Force
}
