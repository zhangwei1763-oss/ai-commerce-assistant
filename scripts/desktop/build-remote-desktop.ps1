param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,
  [switch]$DirOnly
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
  Write-Host "[desktop] $message" -ForegroundColor Cyan
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

if ($ApiBaseUrl -notmatch '^https?://') {
  throw "ApiBaseUrl must start with http:// or https://"
}

Push-Location $projectRoot
try {
  Write-Step "packaging desktop client"
  if ($DirOnly) {
    & node .\scripts\desktop\build-remote-desktop.mjs --api-base-url $ApiBaseUrl --dir
  } else {
    & node .\scripts\desktop\build-remote-desktop.mjs --api-base-url $ApiBaseUrl
  }

  if ($LASTEXITCODE -ne 0) {
    throw "desktop packaging failed"
  }
} finally {
  Pop-Location
}

Write-Step "desktop package is ready"
