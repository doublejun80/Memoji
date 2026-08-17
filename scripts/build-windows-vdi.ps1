param(
    [ValidateSet("e2b", "e4b")][string]$ModelPreset = "e2b",
    [string]$ModelSource = "",
    [switch]$DownloadModel,
    [string]$SignToolPath = "",
    [string]$CertificateThumbprint = "",
    [string]$TimestampUrl = "http://timestamp.digicert.com",
    [string]$WebView2OfflineInstallerUrl = "https://go.microsoft.com/fwlink/?linkid=2124701",
    [switch]$AllowUnsigned
)

$ErrorActionPreference = "Stop"
$signingConfigured = -not [string]::IsNullOrWhiteSpace($SignToolPath) -and -not [string]::IsNullOrWhiteSpace($CertificateThumbprint)
if (-not $signingConfigured -and -not $AllowUnsigned) {
    throw "Signing parameters are required for GA output. Supply -SignToolPath and -CertificateThumbprint, or explicitly use -AllowUnsigned for non-GA testing."
}
if ($signingConfigured -and -not (Test-Path $SignToolPath)) { throw "SignToolPath does not exist: $SignToolPath" }
$repoRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $repoRoot "release\memoji-vdi"
$aiRoot = Join-Path $releaseRoot "ai"
$webView2Root = Join-Path $releaseRoot "webview2"
$webView2Installer = Join-Path $webView2Root "MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
$unsignedMarker = Join-Path $releaseRoot "UNSIGNED-VDI-PILOT.txt"
Set-Location $repoRoot
New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
Remove-Item -LiteralPath $unsignedMarker -Force -ErrorAction SilentlyContinue

$bundleArgs = @("scripts/prepare-vdi-ai-bundle.mjs", "--output", $aiRoot, "--model-preset", $ModelPreset)
if ($DownloadModel) { $bundleArgs += "--download-model" }
elseif (-not [string]::IsNullOrWhiteSpace($ModelSource)) { $bundleArgs += @("--model", $ModelSource) }
node @bundleArgs
if ($LASTEXITCODE -ne 0) { throw "Native LiteRT-LM bundle preparation failed." }
node scripts/verify-litert-runtime.mjs --bundle $aiRoot --strict
if ($LASTEXITCODE -ne 0) { throw "Native LiteRT-LM bundle verification failed." }

Remove-Item Env:\RUSTFLAGS -ErrorAction SilentlyContinue
$env:MEMOJI_BUILD_FLAVOR = "windows-vdi-x64"
npm run tauri:build -- --no-bundle
if ($LASTEXITCODE -ne 0) { throw "Tauri VDI application build failed." }
cargo build --release --manifest-path src-tauri/Cargo.toml --bin memoji-vdi-benchmark
if ($LASTEXITCODE -ne 0) { throw "VDI benchmark harness build failed." }

$appCandidates = @("src-tauri\target\release\Memoji.exe", "src-tauri\target\release\app.exe")
$appPath = $appCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $appPath) { throw "Windows executable was not found under src-tauri\target\release." }
$benchmarkPath = "src-tauri\target\release\memoji-vdi-benchmark.exe"
if (-not (Test-Path $benchmarkPath)) { throw "VDI benchmark executable was not produced." }

$releaseApp = Join-Path $releaseRoot "Memoji.exe"
$releaseBenchmark = Join-Path $releaseRoot "memoji-vdi-benchmark.exe"
Copy-Item $appPath $releaseApp -Force
Copy-Item $benchmarkPath $releaseBenchmark -Force
Copy-Item (Join-Path $PSScriptRoot "Start-Memoji-VDI.cmd") (Join-Path $releaseRoot "Start-Memoji-VDI.cmd") -Force
New-Item -ItemType Directory -Force -Path (Join-Path $releaseRoot "data") | Out-Null
New-Item -ItemType Directory -Force -Path $webView2Root | Out-Null

Invoke-WebRequest -Uri $WebView2OfflineInstallerUrl -OutFile $webView2Installer
if (-not (Test-Path $webView2Installer -PathType Leaf)) {
    throw "WebView2 offline installer download failed."
}
if ((Get-Item $webView2Installer).Length -lt 100MB) {
    throw "Downloaded WebView2 file is too small to be the x64 offline installer."
}
$webView2Signature = Get-AuthenticodeSignature -FilePath $webView2Installer
if ($webView2Signature.Status -ne "Valid" -or $webView2Signature.SignerCertificate.Subject -notmatch "Microsoft Corporation") {
    throw "WebView2 offline installer Authenticode verification failed."
}

node scripts/generate-sbom.mjs --output (Join-Path $releaseRoot "sbom.cdx.json")
if ($LASTEXITCODE -ne 0) { throw "SBOM generation failed." }

if ($signingConfigured) {
    foreach ($binary in @($releaseApp, $releaseBenchmark, (Join-Path $aiRoot "runtime\lib\litert-lm.dll"))) {
        & $SignToolPath sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $binary
        if ($LASTEXITCODE -ne 0) { throw "Signing failed: $binary" }
        & $SignToolPath verify /pa /all $binary
        if ($LASTEXITCODE -ne 0) { throw "Signature verification failed: $binary" }
    }
} else {
    Write-Warning "Unsigned test output explicitly allowed. This bundle is not GA releasable."
    Set-Content -Path $unsignedMarker -Encoding UTF8 -Value @"
이 파일은 코드서명되지 않은 Windows VDI 시험 배포물입니다.
대상 VDI의 EDR 허용, 실제 성능 측정, Authenticode 서명 전에는 정식 배포에 사용하지 마십시오.
"@
}

$instructions = @"
Memoji 2.0 Windows VDI 오프라인 시험판

주의: 코드서명되지 않은 시험판입니다. EDR 허용과 실제 VDI 검증 전에는 조직 배포에 사용하지 마십시오.

1. 이 폴더 전체를 VDI의 쓰기 가능한 로컬 디스크로 복사합니다.
2. Memoji.exe와 ai 폴더의 상대 위치를 그대로 유지합니다.
3. 영구 저장 폴더가 필요하면 실행 전에 MEMOJI_DATA_PATH를 사용자 영구 드라이브로 지정합니다.
4. Start-Memoji-VDI.cmd를 실행합니다. WebView2 Runtime이 없으면 포함된 Microsoft 오프라인 설치 파일로 사용자 단위 설치를 먼저 시도합니다. Memoji.exe를 직접 실행해도 같은 사전 점검을 수행합니다.
5. LiteRT-LM 0.16 C API는 앱 프로세스 안에서 동작하며 Python sidecar나 localhost 포트를 열지 않습니다.
6. 배포 전에 다음 명령으로 대상 풀을 측정합니다.
   .\memoji-vdi-benchmark.exe --bundle .\ai --model gemma4-$ModelPreset --threads 2,4 --prompt-chars 256,1024 --output-tokens 64,256 --output .\vdi-benchmark.json
7. 실패 시 Memoji-launch-diagnostics.txt, Memoji-startup-diagnostics.log, 앱 데이터 폴더의 logs와 vdi-benchmark.json을 함께 수집합니다. 문서 본문과 모델 파일은 로그에 포함하지 않습니다.
8. 롤백하려면 Memoji.exe를 종료하고 이 시험판 폴더만 제거합니다. MEMOJI_DATA_PATH의 사용자 DB는 삭제하지 않습니다.

E2B는 8GB 이상 VDI의 기본값입니다. E4B는 16GB 이상 풀에서 측정 후 사용합니다.
모델·런타임 출처와 라이선스는 ai\NOTICE.txt 및 sbom.cdx.json에서 확인합니다.
"@
Set-Content -Path (Join-Path $releaseRoot "README-VDI.txt") -Value $instructions -Encoding UTF8
node scripts/verify-windows-vdi-launch.mjs --bundle $releaseRoot
if ($LASTEXITCODE -ne 0) { throw "Windows VDI launch contract verification failed." }
node scripts/generate-checksums.mjs --input $releaseRoot --output (Join-Path $releaseRoot "SHA256SUMS")
if ($LASTEXITCODE -ne 0) { throw "Checksum generation failed." }

Write-Host "VDI offline bundle ready: $releaseRoot"
