# ==============================================================================
# INICIAR SISTEMA LOCALMENTE EN WINDOWS (POSTGRESQL 16 + BACKEND + FRONTEND)
# MONTAÑA REDONDA PARADISE — MICHÉS, REPÚBLICA DOMINICANA
# ==============================================================================
$ErrorActionPreference = "Continue"
$env:PATH = "$env:APPDATA\npm;$env:PATH"

Write-Host "==================================================================" -ForegroundColor Green
Write-Host " ⛰️  MONTAÑA REDONDA PARADISE - INICIANDO SISTEMA COMPLETO" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green

# 1. Verificar o iniciar PostgreSQL 16 local
$pgBin = "$env:LOCALAPPDATA\mrp-pg16\bin"
$pgData = "$env:LOCALAPPDATA\mrp-pg16\data"

if (Test-Path "$pgBin\pg_ctl.exe") {
  & "$pgBin\pg_ctl.exe" -D $pgData status 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Iniciando motor PostgreSQL 16 en el puerto 5432..." -ForegroundColor Yellow
    Remove-Item "$pgData\postmaster.pid" -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath "$pgBin\postgres.exe" -ArgumentList "-D `"$pgData`" -p 5432" -WindowStyle Hidden
    Start-Sleep -Seconds 3
  } else {
    Write-Host "✅ PostgreSQL 16 ya está activo en el puerto 5432." -ForegroundColor Cyan
  }
}

# 2. Iniciar Backend y Frontend
Write-Host "Iniciando Backend API (http://localhost:4000/api) y Frontend POS (http://localhost:3000)..." -ForegroundColor Yellow
pnpm run dev

