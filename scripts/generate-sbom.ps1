param(
  [string]$OutputPath = "release/sbom.cdx.json",
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if ($Help) {
  node scripts/generate-sbom.mjs --help
  exit $LASTEXITCODE
}

node scripts/generate-sbom.mjs --output $OutputPath
if ($LASTEXITCODE -ne 0) {
  throw "CycloneDX SBOM generation failed with exit code $LASTEXITCODE"
}
