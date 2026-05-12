param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

$ErrorActionPreference = "Stop"

$tag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
$exePath = "dist\Codex Pets Viewer.exe"

npm run build:win

if (-not (Test-Path -LiteralPath $exePath)) {
  throw "Build output not found: $exePath"
}

gh release create $tag `
  $exePath `
  --title "Codex Pets Viewer $tag" `
  --notes "Portable Windows EXE with bundled pets." `
  --latest
