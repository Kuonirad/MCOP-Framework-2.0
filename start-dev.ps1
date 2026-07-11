param(
  [ValidateSet('dev', 'standalone')]
  [string]$Mode = 'dev'
)

# MCOP Framework 2.0 - cross-platform-parity launcher
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "◈ MCOP Framework 2.0 ◈" -ForegroundColor Cyan
Write-Host "Meta-Cognitive Optimization Protocol" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "Project: $PSScriptRoot" -ForegroundColor Gray
Write-Host "Node: $(node --version)  |  pnpm: $(pnpm --version)" -ForegroundColor Gray
Write-Host ""

if ($Mode -eq 'standalone') {
  Write-Host "Building and starting the staged production server on http://127.0.0.1:3000 ..." -ForegroundColor Green
  pnpm standalone:build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  pnpm standalone:start
  exit $LASTEXITCODE
}

Write-Host "Starting Turbopack dev server on http://localhost:3000 ..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop."
Write-Host ""
pnpm dev
