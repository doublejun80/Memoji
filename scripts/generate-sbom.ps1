param(
  [string]$OutputPath = "release/sbom.cdx.json",
  [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
  Write-Output @"
Usage: pwsh -File scripts/generate-sbom.ps1 [-OutputPath <file>]

Generates a CycloneDX 1.5 JSON software bill of materials from the locked npm
dependency tree and Cargo metadata. This script never reads signing secrets.
"@
  exit 0
}

$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$npmTree = npm ls --all --json 2>$null | ConvertFrom-Json
$cargoTree = cargo metadata --locked --format-version 1 --manifest-path "src-tauri/Cargo.toml" | ConvertFrom-Json
$components = [ordered]@{}

function Add-Component([string]$Type, [string]$Name, [string]$Version, [string]$Purl) {
  if ([string]::IsNullOrWhiteSpace($Name) -or [string]::IsNullOrWhiteSpace($Version)) { return }
  $key = "$Type|$Name|$Version"
  if (-not $components.Contains($key)) {
    $components[$key] = [ordered]@{
      type = "library"
      name = $Name
      version = $Version
      purl = $Purl
    }
  }
}

function Add-NpmDependencies($Dependencies) {
  if ($null -eq $Dependencies) { return }
  foreach ($property in $Dependencies.PSObject.Properties) {
    $dependency = $property.Value
    $encodedName = [System.Uri]::EscapeDataString($property.Name)
    Add-Component "npm" $property.Name $dependency.version "pkg:npm/$encodedName@$($dependency.version)"
    Add-NpmDependencies $dependency.dependencies
  }
}

Add-NpmDependencies $npmTree.dependencies
foreach ($package in $cargoTree.packages) {
  $encodedName = [System.Uri]::EscapeDataString($package.name)
  Add-Component "cargo" $package.name $package.version "pkg:cargo/$encodedName@$($package.version)"
}

$document = [ordered]@{
  bomFormat = "CycloneDX"
  specVersion = "1.5"
  serialNumber = "urn:uuid:$([guid]::NewGuid())"
  version = 1
  metadata = [ordered]@{
    timestamp = [DateTimeOffset]::UtcNow.ToString("o")
    tools = @([ordered]@{ vendor = "Memoji"; name = "generate-sbom.ps1"; version = "1" })
    component = [ordered]@{
      type = "application"
      name = $packageJson.name
      version = $packageJson.version
    }
  }
  components = @($components.Values)
}

$parent = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($parent)) {
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
}
$document | ConvertTo-Json -Depth 12 | Set-Content -Path $OutputPath -Encoding utf8
Write-Output "Wrote $($components.Count) components to $OutputPath"
