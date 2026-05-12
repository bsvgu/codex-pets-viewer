param(
  [string]$PetsDir = "assets\pets",
  [string]$OutputDir = "dist-content",
  [string]$MinimumAppVersion = "1.3.2"
)

$ErrorActionPreference = "Stop"

function Clean-Name([string]$Value) {
  return ($Value -replace "[^a-zA-Z0-9_.-]", "-").Trim("-")
}

if (-not (Test-Path -LiteralPath $PetsDir)) {
  throw "Pets directory not found: $PetsDir"
}

Remove-Item -LiteralPath $OutputDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $OutputDir | Out-Null

$pets = @()

foreach ($folder in Get-ChildItem -LiteralPath $PetsDir -Directory) {
  $manifestPath = Join-Path $folder.FullName "pet.json"

  if (-not (Test-Path -LiteralPath $manifestPath)) {
    continue
  }

  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $id = if ($manifest.id) { [string]$manifest.id } else { $folder.Name }
  $version = if ($manifest.version) { [string]$manifest.version } else { "1.0.0" }
  $assetName = "pet-$(Clean-Name $id)-$(Clean-Name $version).zip"
  $zipPath = Join-Path $OutputDir $assetName
  $children = Get-ChildItem -LiteralPath $folder.FullName -Force

  Compress-Archive -Path $children.FullName -DestinationPath $zipPath -Force

  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
  $pets += [ordered]@{
    id = $id
    displayName = if ($manifest.displayName) { [string]$manifest.displayName } else { $id }
    version = $version
    assetName = $assetName
    sha256 = $hash
    description = if ($manifest.description) { [string]$manifest.description } else { "" }
  }
}

$contentManifest = [ordered]@{
  schemaVersion = 1
  minimumAppVersion = $MinimumAppVersion
  pets = $pets
}

$contentManifest |
  ConvertTo-Json -Depth 8 |
  Set-Content -LiteralPath (Join-Path $OutputDir "pet-content-manifest.json") -Encoding UTF8

Write-Host "Content release written to $OutputDir"
