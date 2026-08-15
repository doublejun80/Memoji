$ErrorActionPreference = "Stop"

$env:RUSTFLAGS = "-C target-cpu=cascadelake"
$env:MEMOJI_BUILD_FLAVOR = "x64-avx512"

npm run tauri:build

$version = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
$output = "release/windows-avx512"
New-Item -ItemType Directory -Force -Path $output | Out-Null
$appCandidates = @(
    "src-tauri/target/release/Memoji.exe",
    "src-tauri/target/release/app.exe"
)
$appPath = $appCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$setupPath = Get-ChildItem "src-tauri/target/release/bundle/nsis" -Recurse -File -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $appPath) {
    throw "Windows executable was not found under src-tauri/target/release."
}

Copy-Item $appPath "$output/Memoji_${version}_x64-avx512.exe" -Force
if ($setupPath) {
    Copy-Item $setupPath.FullName "$output/Memoji_${version}_x64-avx512-setup.exe" -Force
}
Copy-Item NOTICE.md "$output/NOTICE.md" -Force
pwsh -File scripts/generate-sbom.ps1 -OutputPath "$output/sbom.cdx.json"
node scripts/generate-checksums.mjs --input $output --output "$output/SHA256SUMS"
