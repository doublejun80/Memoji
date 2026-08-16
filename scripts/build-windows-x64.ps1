param(
    [string]$SignToolPath = "",
    [string]$CertificateThumbprint = "",
    [string]$TimestampUrl = "http://timestamp.digicert.com",
    [switch]$AllowUnsigned
)

$ErrorActionPreference = "Stop"
$signingConfigured = -not [string]::IsNullOrWhiteSpace($SignToolPath) -and -not [string]::IsNullOrWhiteSpace($CertificateThumbprint)
if (-not $signingConfigured -and -not $AllowUnsigned) {
    throw "Signing parameters are required for GA output. Supply -SignToolPath and -CertificateThumbprint, or explicitly use -AllowUnsigned for non-GA testing."
}
if ($signingConfigured -and -not (Test-Path $SignToolPath)) { throw "SignToolPath does not exist: $SignToolPath" }

Remove-Item Env:\RUSTFLAGS -ErrorAction SilentlyContinue
$env:MEMOJI_BUILD_FLAVOR = "x64"

npm run tauri:build

$version = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
$output = "release/windows-x64"
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
if (-not $setupPath) { throw "NSIS setup executable was not produced." }

$releaseApp = "$output/Memoji_${version}_x64.exe"
$releaseSetup = "$output/Memoji_${version}_x64-setup.exe"
Copy-Item $appPath $releaseApp -Force
Copy-Item $setupPath.FullName $releaseSetup -Force
if ($signingConfigured) {
    foreach ($binary in @($releaseApp, $releaseSetup)) {
        & $SignToolPath sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $binary
        if ($LASTEXITCODE -ne 0) { throw "Signing failed: $binary" }
        & $SignToolPath verify /pa /all $binary
        if ($LASTEXITCODE -ne 0) { throw "Signature verification failed: $binary" }
    }
} else {
    Write-Warning "Unsigned test output explicitly allowed. This package is not GA releasable."
}
Copy-Item NOTICE.md "$output/NOTICE.md" -Force
pwsh -File scripts/generate-sbom.ps1 -OutputPath "$output/sbom.cdx.json"
node scripts/generate-checksums.mjs --input $output --output "$output/SHA256SUMS"
