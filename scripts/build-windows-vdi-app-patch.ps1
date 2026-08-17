param(
    [Parameter(Mandatory = $true)][string]$Version
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot "release"))
$outputRoot = Join-Path $releaseRoot "windows-vdi-app-patch"
$stageName = "Memoji-$Version-windows-x64-app-only"
$stageRoot = Join-Path $outputRoot $stageName
$zipPath = Join-Path $outputRoot "$stageName.zip"
Set-Location $repoRoot

if (-not $outputRoot.StartsWith("$releaseRoot$([IO.Path]::DirectorySeparatorChar)", [StringComparison]::OrdinalIgnoreCase)) {
    throw "App patch output must stay below the repository release directory: $outputRoot"
}
if (Test-Path $outputRoot) {
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

Remove-Item Env:\RUSTFLAGS -ErrorAction SilentlyContinue
$env:MEMOJI_BUILD_FLAVOR = "windows-vdi-x64-app-patch"
npm run tauri:build -- --no-bundle
if ($LASTEXITCODE -ne 0) { throw "Tauri VDI application build failed." }

$appCandidates = @("src-tauri\target\release\Memoji.exe", "src-tauri\target\release\app.exe")
$appPath = $appCandidates | Where-Object { Test-Path $_ -PathType Leaf } | Select-Object -First 1
if (-not $appPath) { throw "Windows executable was not found under src-tauri\target\release." }

Copy-Item -LiteralPath $appPath -Destination (Join-Path $stageRoot "Memoji.exe") -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Start-Memoji-VDI.cmd") -Destination (Join-Path $stageRoot "Start-Memoji-VDI.cmd") -Force

Set-Content -Path (Join-Path $stageRoot "README-APP-PATCH.txt") -Encoding UTF8 -Value @"
Memoji $Version Windows VDI 앱 전용 수정본

이 압축에는 Memoji.exe와 실행 스크립트만 들어 있습니다. 기존의 대용량 MASCOX/ai 모델, data, webview2 폴더는 다시 복사하거나 삭제하지 않습니다.

적용 방법
1. 실행 중인 Memoji를 완전히 종료합니다.
2. VDI에 이미 복사한 Memoji 폴더를 엽니다.
3. 기존 Memoji.exe와 Start-Memoji-VDI.cmd만 백업한 뒤, 이 압축의 같은 이름 파일로 덮어씁니다.
4. 기존 ai, MASCOX, data, webview2 폴더는 그대로 둡니다.
5. Start-Memoji-VDI.cmd를 실행합니다.

이번 수정은 앱 창이 뜨기 전에 Gemma/LiteRT 네이티브 DLL을 자동 로드하지 않습니다. 창이 먼저 열린 뒤 AI 기능을 실제로 사용할 때만 모델을 불러옵니다.
실패하면 같은 폴더의 Memoji-launch-diagnostics.txt와 Memoji-startup-diagnostics.log를 보관하십시오.

주의: 이 파일은 Authenticode 코드서명되지 않은 VDI 시험판입니다.
"@

Set-Content -Path (Join-Path $stageRoot "UNSIGNED-VDI-PILOT.txt") -Encoding UTF8 -Value @"
이 파일은 코드서명되지 않은 Windows VDI 시험 배포물입니다.
대상 VDI의 EDR 허용과 실제 실행 검증 전에는 조직 배포에 사용하지 마십시오.
"@

node scripts/generate-checksums.mjs --input $stageRoot --output (Join-Path $stageRoot "SHA256SUMS")
if ($LASTEXITCODE -ne 0) { throw "App patch checksum generation failed." }

$forbiddenPayloads = @("ai", "MASCOX", "data", "webview2", "models")
foreach ($payload in $forbiddenPayloads) {
    if (Test-Path (Join-Path $stageRoot $payload)) {
        throw "App-only patch unexpectedly contains reusable payload: $payload"
    }
}

Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal
$zipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
Set-Content -Path (Join-Path $outputRoot "SHA256SUMS") -Encoding ascii -Value "$zipHash  $([IO.Path]::GetFileName($zipPath))"

Write-Host "Windows VDI app-only patch ready: $zipPath"
Get-ChildItem -LiteralPath $outputRoot -File | Sort-Object Name | Select-Object Name, Length
