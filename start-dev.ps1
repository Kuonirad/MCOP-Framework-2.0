# MCOP Framework 2.0 - Dev Launcher
Write-Host "◈ MCOP Framework 2.0 ◈" -ForegroundColor Cyan
Write-Host "Meta-Cognitive Optimization Protocol" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "Project: $PSScriptRoot" -ForegroundColor Gray
Write-Host "Node: $(node --version)  |  pnpm: $(pnpm --version)" -ForegroundColor Gray
Write-Host ""
Write-Host "Starting Turbopack dev server on http://localhost:3000 ..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop."
Write-Host ""

Set-Location $PSScriptRoot
pnpm dev
