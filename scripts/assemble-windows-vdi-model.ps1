param(
    [Parameter(Mandatory = $true)][string]$PartsDirectory,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][ValidatePattern("^[A-Fa-f0-9]{64}$")][string]$ExpectedSha256,
    [string]$Pattern = "*.litertlm.part*"
)

$ErrorActionPreference = "Stop"
$parts = @(Get-ChildItem -Path $PartsDirectory -File -Filter $Pattern | Sort-Object Name)
if ($parts.Count -eq 0) {
    throw "모델 조각을 찾지 못했습니다: $PartsDirectory\$Pattern"
}

$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutput
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$partialOutput = "$resolvedOutput.partial"
Remove-Item -LiteralPath $partialOutput -Force -ErrorAction SilentlyContinue

$destination = [IO.File]::Open(
    $partialOutput,
    [IO.FileMode]::CreateNew,
    [IO.FileAccess]::Write,
    [IO.FileShare]::None
)
try {
    foreach ($part in $parts) {
        $source = [IO.File]::OpenRead($part.FullName)
        try {
            $source.CopyTo($destination)
        } finally {
            $source.Dispose()
        }
    }
} finally {
    $destination.Dispose()
}

$actualSha256 = (Get-FileHash -LiteralPath $partialOutput -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSha256 -ne $ExpectedSha256.ToLowerInvariant()) {
    Remove-Item -LiteralPath $partialOutput -Force -ErrorAction SilentlyContinue
    throw "조립된 모델 SHA-256 불일치: expected=$ExpectedSha256 actual=$actualSha256"
}

Move-Item -LiteralPath $partialOutput -Destination $resolvedOutput -Force
Write-Host "Gemma 모델 조립 및 SHA-256 검증 완료: $resolvedOutput"
