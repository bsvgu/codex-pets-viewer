param(
  [string]$ContentDir = "dist-content",
  [string]$Tag = "pets-content-stable"
)

$ErrorActionPreference = "Stop"

$gh = "gh"
$localGh = Join-Path (Split-Path $PSScriptRoot -Parent) "tools\bin\gh.exe"
if (Test-Path -LiteralPath $localGh) {
  $gh = $localGh
}

$manifestPath = Join-Path $ContentDir "pet-content-manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Missing manifest: $manifestPath"
}

$assets = @(Get-ChildItem -LiteralPath $ContentDir -File | Where-Object {
  $_.Name -eq "pet-content-manifest.json" -or $_.Extension -eq ".zip"
} | ForEach-Object { $_.FullName })

if (-not $assets.Length) {
  throw "No content assets found in $ContentDir"
}

& $gh release view $Tag *> $null
if ($LASTEXITCODE -ne 0) {
  & $gh release create $Tag --title "Codex Pets Content" --notes "Stable pet content manifest and packs." --latest=false
}

& $gh release upload $Tag @assets --clobber
Write-Host "Uploaded content assets to release $Tag"
