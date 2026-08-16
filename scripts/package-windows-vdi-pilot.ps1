param(
    [string]$BundleRoot = "release\memoji-vdi",
    [string]$OutputRoot = "release\windows-vdi-pilot",
    [Parameter(Mandatory = $true)][string]$Version,
    [long]$ModelPartBytes = 1900000000
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot "release"))
$bundleRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot $BundleRoot))
$outputRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot $OutputRoot))
Set-Location $repoRoot
if (-not $outputRoot.StartsWith("$releaseRoot$([IO.Path]::DirectorySeparatorChar)", [StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputRoot must stay below the repository release directory: $outputRoot"
}
if ($ModelPartBytes -le 0 -or $ModelPartBytes -gt 1900000000) {
    throw "ModelPartBytes must be between 1 and 1900000000 bytes."
}

$manifestPath = Join-Path $bundleRoot "ai\bundle-manifest.json"
if (-not (Test-Path $manifestPath)) { throw "Bundle manifest not found: $manifestPath" }
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$modelRelativePath = [string]$manifest.model.file
$modelPath = Join-Path (Join-Path $bundleRoot "ai") $modelRelativePath
$requiredFiles = @(
    (Join-Path $bundleRoot "Memoji.exe"),
    (Join-Path $bundleRoot "memoji-vdi-benchmark.exe"),
    (Join-Path $bundleRoot "ai\runtime\lib\litert-lm.dll"),
    $manifestPath,
    $modelPath,
    (Join-Path $bundleRoot "sbom.cdx.json"),
    (Join-Path $bundleRoot "README-VDI.txt"),
    (Join-Path $bundleRoot "UNSIGNED-VDI-PILOT.txt")
)
foreach ($requiredFile in $requiredFiles) {
    if (-not (Test-Path $requiredFile -PathType Leaf)) { throw "Required VDI payload file is missing: $requiredFile" }
}

if (Test-Path $outputRoot) { Remove-Item -LiteralPath $outputRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$coreStage = Join-Path $outputRoot ".core-staging"
New-Item -ItemType Directory -Force -Path $coreStage | Out-Null

foreach ($fileName in @("Memoji.exe", "memoji-vdi-benchmark.exe", "README-VDI.txt", "UNSIGNED-VDI-PILOT.txt", "sbom.cdx.json", "SHA256SUMS")) {
    $source = Join-Path $bundleRoot $fileName
    if (Test-Path $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $coreStage $fileName) -Force }
}

$coreAi = Join-Path $coreStage "ai"
New-Item -ItemType Directory -Force -Path $coreAi | Out-Null
Copy-Item -LiteralPath (Join-Path $bundleRoot "ai\runtime") -Destination $coreAi -Recurse -Force
foreach ($fileName in @("bundle-manifest.json", "runtime-compatibility.json", "NOTICE.txt")) {
    $source = Join-Path $bundleRoot "ai\$fileName"
    if (-not (Test-Path $source)) { throw "Required AI metadata is missing: $source" }
    Copy-Item -LiteralPath $source -Destination (Join-Path $coreAi $fileName) -Force
}

$modelTargetDirectory = Join-Path $coreAi (Split-Path -Parent $modelRelativePath)
New-Item -ItemType Directory -Force -Path $modelTargetDirectory | Out-Null
$assemblyScript = Join-Path $PSScriptRoot "assemble-windows-vdi-model.ps1"
Copy-Item -LiteralPath $assemblyScript -Destination (Join-Path $coreStage "Assemble-Memoji-VDI.ps1") -Force
Set-Content -Path (Join-Path $modelTargetDirectory "MODEL-ASSEMBLY-REQUIRED.txt") -Encoding UTF8 -Value @"
Gemma 모델은 GitHub 릴리즈 파일 크기 제한 때문에 여러 조각으로 나뉘어 있습니다.

1. core zip과 모든 .partNNN 파일을 같은 폴더에 둡니다.
2. core zip을 압축 해제합니다.
3. 압축 해제한 폴더에서 다음 명령을 실행합니다.

.\Assemble-Memoji-VDI.ps1 -PartsDirectory <모델 조각 폴더> -OutputPath ".\ai\$modelRelativePath" -ExpectedSha256 "$($manifest.model.sha256)"

조립 후 Memoji.exe와 ai 폴더의 상대 위치를 바꾸지 마십시오.
"@

$sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
if (-not $sevenZip) { throw "7z command is required to create the Windows VDI core archive." }
$coreAssetName = "Memoji-$Version-windows-x64-vdi-core.zip"
$coreAssetPath = Join-Path $outputRoot $coreAssetName
Push-Location $coreStage
try {
    & $sevenZip.Source a -tzip -mx=5 $coreAssetPath "*"
    if ($LASTEXITCODE -ne 0) { throw "7z failed to create the core archive." }
} finally {
    Pop-Location
}

$modelLabel = ([IO.Path]::GetFileName($modelPath) -replace '[^A-Za-z0-9._-]', '-')
$partPrefix = "Memoji-$Version-$modelLabel.part"
$partNames = [Collections.Generic.List[string]]::new()
$sourceStream = [IO.File]::OpenRead($modelPath)
$buffer = New-Object byte[] (8MB)
try {
    $partNumber = 1
    while ($sourceStream.Position -lt $sourceStream.Length) {
        $partName = "$partPrefix$($partNumber.ToString('000'))"
        $partPath = Join-Path $outputRoot $partName
        $partStream = [IO.File]::Open($partPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try {
            [long]$written = 0
            while ($written -lt $ModelPartBytes -and $sourceStream.Position -lt $sourceStream.Length) {
                $remaining = [Math]::Min([long]$buffer.Length, $ModelPartBytes - $written)
                $read = $sourceStream.Read($buffer, 0, [int]$remaining)
                if ($read -le 0) { break }
                $partStream.Write($buffer, 0, $read)
                $written += $read
            }
        } finally {
            $partStream.Dispose()
        }
        $partNames.Add($partName)
        $partNumber += 1
    }
} finally {
    $sourceStream.Dispose()
}

Copy-Item -LiteralPath $assemblyScript -Destination (Join-Path $outputRoot "Assemble-Memoji-VDI.ps1") -Force
$releaseManifest = [ordered]@{
    schemaVersion = 1
    version = $Version
    releaseClass = "unsigned-vdi-pilot"
    coreAsset = $coreAssetName
    model = [ordered]@{
        relativePath = $modelRelativePath
        bytes = [long]$manifest.model.bytes
        sha256 = [string]$manifest.model.sha256
        parts = @($partNames)
    }
}
$releaseManifest | ConvertTo-Json -Depth 8 | Set-Content -Path (Join-Path $outputRoot "release-manifest.json") -Encoding UTF8
Remove-Item -LiteralPath $coreStage -Recurse -Force

node scripts/generate-checksums.mjs --input $outputRoot --output (Join-Path $outputRoot "SHA256SUMS")
if ($LASTEXITCODE -ne 0) { throw "Release asset checksum generation failed." }

$oversizedAssets = @(Get-ChildItem -Path $outputRoot -File | Where-Object { $_.Length -ge 2000000000 })
if ($oversizedAssets.Count -gt 0) {
    throw "Release asset exceeds the 2000000000-byte limit: $($oversizedAssets.FullName -join ', ')"
}

Write-Host "Windows VDI pilot assets ready: $outputRoot"
Get-ChildItem -Path $outputRoot -File | Sort-Object Name | Select-Object Name, Length
