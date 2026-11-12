#!/usr/bin/env bash
# ==============================================================================
# INSTALADOR AUTOMÁTICO DE PRODUCCIÓN (VPS UBUNTU 22.04 / 24.04)
# MONTAÑA REDONDA PARADISE — POS, FACTURACIÓN Y CONTROL DE TICKETS QR
# ==============================================================================
set -e

echo "=================================================================="
echo " ⛰️  MONTAÑA REDONDA PARADISE - INSTALADOR DE SERVIDOR ONLINE"
echo "=================================================================="

if [ "$EUID" -ne 0 ]; then
  echo "Por favor ejecute este script como root o con sudo: sudo bash deploy-vps.sh"
  exit 1
fi

read -p "Dominio para el Frontend POS (ej. pos.montanaredondaparadise.com): " FRONTEND_DOMAIN
read -p "Dominio para la API Backend (ej. api.montanaredondaparadise.com): " BACKEND_DOMAIN

if [ -z "$FRONTEND_DOMAIN" ] || [ -z "$BACKEND_DOMAIN" ]; then
  echo "Error: Debe ingresar ambos subdominios."
  exit 1
fi

echo "1/5 Actualizando paquetes e instalando Docker..."
apt-get update -y
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "2/5 Instalando Caddy (Proxy Inverso con HTTPS Automático)..."
if ! command -v caddy &> /dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "3/5 Generando claves criptográficas seguras en .env..."
DB_PASS=$(openssl rand -hex 16)
JWT_SEC=$(openssl rand -hex 32)
QR_SEC=$(openssl rand -hex 32)

cat > .env <<EOF
DB_HOST=postgres
DB_PORT=5432
DB_USER=mrp_admin
DB_PASSWORD=${DB_PASS}
DB_NAME=montana_redonda_db
PORT=4000
JWT_SECRET=${JWT_SEC}
QR_HMAC_SECRET=${QR_SEC}
NEXT_PUBLIC_API_URL=https://${BACKEND_DOMAIN}/api
EOF

echo "4/5 Configurando certificados SSL HTTPS en /etc/caddy/Caddyfile..."
cat > /etc/caddy/Caddyfile <<EOF
${FRONTEND_DOMAIN} {
    reverse_proxy localhost:3000
}

${BACKEND_DOMAIN} {
    reverse_proxy localhost:4000
}
EOF

systemctl reload caddy || systemctl restart caddy

echo "5/5 Construyendo y levantando PostgreSQL 16 + Backend + Frontend..."
docker compose -f docker-compose.prod.yml up -d --build

# Configurar respaldo diario automático a las 23:00
mkdir -p /root/backups_montana_redonda
CRON_JOB="0 23 * * * docker exec mrp_postgres pg_dump -U mrp_admin montana_redonda_db | gzip > /root/backups_montana_redonda/mrp_db_\$(date +\%F).sql.gz"
(crontab -l 2>/dev/null | grep -v "mrp_postgres" ; echo "$CRON_JOB") | crontab -

echo "=================================================================="
echo " ✅ INSTALACIÓN COMPLETADA EXITOSAMENTE"
echo "------------------------------------------------------------------"
echo " 🌐 Sistema POS y Escáner QR : https://${FRONTEND_DOMAIN}"
echo " 🔌 API Backend              : https://${BACKEND_DOMAIN}/api/health"
echo " 💾 Respaldos diarios BD     : /root/backups_montana_redonda/"
echo "=================================================================="

