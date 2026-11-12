# ==============================================================================
# PUBLICAR EL SISTEMA ONLINE GRATIS (COSTO $0) CON HTTPS PARA CELULARES Y TABLETS
# MONTAÑA REDONDA PARADISE — TÚNEL SEGURO CLOUDFLARE
# ==============================================================================
$ErrorActionPreference = "Continue"

Write-Host "==================================================================" -ForegroundColor Green
Write-Host " 🌐 MONTAÑA REDONDA PARADISE - PUBLICACIÓN ONLINE GRATUITA ($0)" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green

$cloudflaredExe = "$env:LOCALAPPDATA\mrp-pg16\cloudflared.exe"

if (-not (Test-Path $cloudflaredExe)) {
  Write-Host "Descargando cliente oficial ligero de Cloudflare Tunnel (gratuito)..." -ForegroundColor Yellow
  New-Item -ItemType Directory -Force -Path "$env:LOCALAPPDATA\mrp-pg16" | Out-Null
  curl.exe -sSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -o $cloudflaredExe
}

Write-Host ""
Write-Host "✅ Generando enlace público HTTPS gratuito hacia http://localhost:3000 ..." -ForegroundColor Cyan
Write-Host "📱 Copie la dirección https://....trycloudflare.com que aparecerá abajo y ábrala en cualquier teléfono móvil, tablet o computadora con Internet:" -ForegroundColor Green
Write-Host ""

& $cloudflaredExe tunnel --url http://localhost:3000

