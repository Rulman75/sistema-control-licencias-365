#!/usr/bin/env bash
# ==============================================================================
# Script de Instalación y Despliegue en Producción Linux (Servidor Totem DMZ CMDS)
# Proyecto: Sistema de Control de Licencias Microsoft 365 — CMDS Antofagasta
# Servidor Destino: Servidor Linux Totem (totem.cmds.cl / 200.29.191.72)
# Ruta en Disco: /var/www/sistema-control-licencias-365
# Base de Datos Principal: PostgreSQL Centralizado CMDS (192.168.30.47:5432 / bd_licencias_365)
# Puerto de Aplicación: 3008 | Proceso PM2: licencias-365-cmds
# ==============================================================================

set -e

APP_DIR="/var/www/sistema-control-licencias-365"
REPO_URL="https://github.com/Rulman75/sistema-control-licencias-365.git"
PM2_NAME="licencias-365-cmds"
PORT="3008"
DOMAIN_NAMES="licencias365.cmds.cl m365.cmds.cl licencias.cmds.cl"

PG_CENTRAL_HOST="192.168.30.47"
PG_CENTRAL_PORT="5432"
PG_CENTRAL_USER="cmds_admin"
PG_CENTRAL_PASS="${PG_PASS:-}"
PG_CENTRAL_DB="bd_licencias_365"

echo "=================================================================="
echo "  Desplegando Sistema de Control de Licencias M365 CMDS ($(hostname))"
echo "=================================================================="

# 1. Clonar o actualizar el repositorio desde GitHub
if [ ! -d "$APP_DIR/.git" ]; then
  echo "[1/5] Clonando repositorio desde GitHub en $APP_DIR..."
  sudo mkdir -p "$APP_DIR"
  sudo chown -R "$USER":"$USER" "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "[1/5] Actualizando repositorio existente en $APP_DIR..."
  cd "$APP_DIR"
  git fetch origin
  git reset --hard origin/main
fi

# 2. Instalar dependencias del Backend
echo "[2/5] Instalando dependencias de Node.js en backend..."
cd "$APP_DIR/backend"
npm install --omit=dev

# 3. Verificar conectividad hacia el servidor PostgreSQL centralizado (192.168.30.47:5432)
echo "[3/5] Verificando conexión de red desde este servidor hacia PostgreSQL ($PG_CENTRAL_HOST:$PG_CENTRAL_PORT)..."
if timeout 4 bash -c "</dev/tcp/${PG_CENTRAL_HOST}/${PG_CENTRAL_PORT}" 2>/dev/null; then
  echo "  -> OK: Conectividad TCP confirmada hacia PostgreSQL Centralizado (${PG_CENTRAL_HOST}:${PG_CENTRAL_PORT})."
else
  echo "  -> AVISO: No se detectó alcance TCP directo a ${PG_CENTRAL_HOST}:${PG_CENTRAL_PORT} desde esta DMZ."
  echo "     Verifique la regla de Firewall DMZ -> LAN (Permitir TCP 5432 hacia 192.168.30.47)."
  echo "     El sistema operará mientras tanto con su motor local sincronizado (backend/data/store.json con los 7.524 usuarios)."
fi

# 4. Generar archivo backend/.env de producción si no existe
if [ ! -f "$APP_DIR/backend/.env" ]; then
  echo "[4/5] Generando archivo backend/.env conectado a PostgreSQL Centralizado ($PG_CENTRAL_HOST)..."
  if [ -z "$PG_CENTRAL_PASS" ]; then
    read -rsp "  Ingrese contraseña de PostgreSQL (${PG_CENTRAL_USER}@${PG_CENTRAL_HOST}): " PG_CENTRAL_PASS
    echo ""
  fi
  RANDOM_JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)
  cat <<EOF > "$APP_DIR/backend/.env"
PORT=${PORT}
PG_HOST=${PG_CENTRAL_HOST}
PG_PORT=${PG_CENTRAL_PORT}
PG_USER=${PG_CENTRAL_USER}
PG_PASS=${PG_CENTRAL_PASS}
PG_DB=${PG_CENTRAL_DB}
JWT_SECRET=${RANDOM_JWT_SECRET}
JWT_EXPIRES_IN=8h
EOF
  chmod 600 "$APP_DIR/backend/.env"
else
  echo "[4/5] Archivo backend/.env ya existe, conservando configuración actual."
  chmod 600 "$APP_DIR/backend/.env" || true
fi

# 5. Iniciar o reiniciar proceso en PM2, configurar Nginx y abrir puerto
echo "[5/5] Configurando proceso '$PM2_NAME' en PM2 (Puerto $PORT)..."
if pm2 describe "$PM2_NAME" > /dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  cd "$APP_DIR/backend"
  pm2 start server.js --name "$PM2_NAME"
fi
pm2 save

# Configurar VirtualHost en Nginx (sin interferir con totem-cmds.conf)
if [ -d "/etc/nginx/conf.d" ]; then
  NGINX_CONF="/etc/nginx/conf.d/licencias-365-cmds.conf"
  echo "Configurando VirtualHost Nginx en ${NGINX_CONF} (${DOMAIN_NAMES})..."
  sudo tee "${NGINX_CONF}" > /dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN_NAMES};

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }
}
EOF
  sudo nginx -t && sudo systemctl reload nginx || true
fi

if command -v ufw > /dev/null 2>&1; then
  sudo ufw allow ${PORT}/tcp > /dev/null 2>&1 || true
elif command -v firewall-cmd > /dev/null 2>&1; then
  sudo firewall-cmd --permanent --add-port=${PORT}/tcp > /dev/null 2>&1 || true
  sudo firewall-cmd --reload > /dev/null 2>&1 || true
fi

echo "=================================================================="
echo "  ¡DESPLIEGUE COMPLETADO CON ÉXITO!"
echo "  - Proceso PM2 activo : ${PM2_NAME} (Puerto ${PORT})"
echo "  - Acceso por Puerto  : http://200.29.191.72:${PORT}"
echo "  - Acceso por Dominio : http://licencias365.cmds.cl (una vez apuntado el DNS a 200.29.191.72)"
echo "  - Base de Datos PG   : ${PG_CENTRAL_HOST}:${PG_CENTRAL_PORT}/${PG_CENTRAL_DB}"
echo "=================================================================="
