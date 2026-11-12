# ==============================================================================
# MONTAÑA REDONDA PARADISE - GENERADOR DE PAQUETE PARA HOSTING COMPARTIDO (cPanel)
# ==============================================================================
# Este script compila el Frontend como archivos estáticos puros (HTML, CSS, JS,
# .htaccess y config.js) y crea el archivo "hosting-compartido-public_html.zip"
# listo para subir y descomprimir en la carpeta public_html de tu Hosting.
# ==============================================================================

$ErrorActionPreference = "Stop"
$env:PATH = "$env:APPDATA\npm;$env:PATH"
$env:STATIC_EXPORT = "true"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " COMPILANDO FRONTEND ESTÁTICO PARA HOSTING COMPARTIDO (cPanel)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

pnpm --filter @mrp/shared run build
pnpm --filter @mrp/frontend run build

$outDir = Join-Path $PSScriptRoot "apps\frontend\out"
$zipPath = Join-Path $PSScriptRoot "hosting-compartido-public_html.zip"

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

# Asegurar que .htaccess y config.js estén incluidos en la carpeta out
Copy-Item (Join-Path $PSScriptRoot "apps\frontend\public\.htaccess") (Join-Path $outDir ".htaccess") -Force
Copy-Item (Join-Path $PSScriptRoot "apps\frontend\public\config.js") (Join-Path $outDir "config.js") -Force

# Empaquetar con barras diagonales (/) estándar de Linux para compatibilidad 100% con cPanel / Hostinger
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipStream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::Create)
$zipArchive = New-Object System.IO.Compression.ZipArchive($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)
$files = Get-ChildItem -Path $outDir -Recurse -Force | Where-Object { -not $_.PSIsContainer }
foreach ($file in $files) {
  $relPath = $file.FullName.Substring($outDir.Length + 1).Replace('\', '/')
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipArchive, $file.FullName, $relPath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
}
$zipArchive.Dispose()
$zipStream.Dispose()

Write-Host "`n==================================================================" -ForegroundColor Green
Write-Host " ¡PAQUETE GENERADO EXITOSAMENTE!" -ForegroundColor Green
Write-Host " Archivo listo para subir a public_html:" -ForegroundColor Yellow
Write-Host " -> $zipPath" -ForegroundColor White
Write-Host "==================================================================" -ForegroundColor Green
