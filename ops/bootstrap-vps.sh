#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${DOMAIN:-locaio.petertecnet.com.br}"
APP_DIR="${APP_DIR:-/var/www/locaio.petertecnet.com.br}"
REPOSITORY="${REPOSITORY:-https://github.com/petertecnetdev/locaio.petertecnet.com.br.git}"
BRANCH="${BRANCH:-main}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
LOCK_FILE="${LOCK_FILE:-/run/lock/locaio-vps-bootstrap.lock}"

log() { printf '\n[Locaio bootstrap] %s\n' "$*"; }
fail() { printf '\n[Locaio bootstrap] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || fail "execute este script como root."
[[ "$APP_DIR" == /var/www/* ]] || fail "APP_DIR precisa ficar abaixo de /var/www."
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || fail "domínio inválido."
command -v git >/dev/null || fail "git não está instalado."
command -v npm >/dev/null || fail "npm/node não estão instalados."
command -v nginx >/dev/null || fail "nginx não está instalado."
command -v flock >/dev/null || fail "flock não está instalado."

mkdir -p "$(dirname "$LOCK_FILE")"
touch "$LOCK_FILE"
chmod 600 "$LOCK_FILE"
exec 9>"$LOCK_FILE"
flock -w 1800 9 || fail "não foi possível adquirir a fila do bootstrap do Locaio."

DEPLOY_OWNER="$(stat -c '%U' /var/www/petertecnet.com.br 2>/dev/null || true)"
if [[ -z "$DEPLOY_OWNER" || "$DEPLOY_OWNER" == "root" || "$DEPLOY_OWNER" == "UNKNOWN" ]]; then
  DEPLOY_OWNER="$(find /var/www -mindepth 1 -maxdepth 1 -type d -printf '%u\n' 2>/dev/null | grep -vE '^(root|www-data)$' | head -n 1 || true)"
fi
DEPLOY_OWNER="${DEPLOY_OWNER:-www-data}"
DEPLOY_GROUP="www-data"

log "Preparando diretório de aplicação em $APP_DIR"
if [[ -e "$APP_DIR" && ! -d "$APP_DIR/.git" ]]; then
  if [[ -n "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
    backup="${APP_DIR}.backup-$(date +%Y%m%d%H%M%S)"
    mv "$APP_DIR" "$backup"
    log "Diretório antigo movido com segurança para $backup"
  else
    rmdir "$APP_DIR" || true
  fi
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --branch "$BRANCH" --single-branch "$REPOSITORY" "$APP_DIR"
else
  current_remote="$(git -C "$APP_DIR" remote get-url origin 2>/dev/null || true)"
  case "$current_remote" in
    "$REPOSITORY"|git@github.com:petertecnetdev/locaio.petertecnet.com.br.git) ;;
    *) fail "$APP_DIR aponta para um repositório diferente: $current_remote" ;;
  esac
fi

git -C "$APP_DIR" fetch --prune origin "$BRANCH"
git -C "$APP_DIR" checkout "$BRANCH"
git -C "$APP_DIR" reset --hard "origin/$BRANCH"
chown -R "$DEPLOY_OWNER:$DEPLOY_GROUP" "$APP_DIR"
chmod -R g+rwX "$APP_DIR"

log "Instalando dependências e gerando build Vite"
run_as_owner() {
  if [[ "$DEPLOY_OWNER" != "root" && "$DEPLOY_OWNER" != "www-data" ]] && command -v runuser >/dev/null 2>&1; then
    runuser -u "$DEPLOY_OWNER" -- "$@"
  else
    "$@"
  fi
}

cd "$APP_DIR"
export CI=true
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
if [[ -f package-lock.json ]]; then
  run_as_owner npm ci --no-audit --no-fund || run_as_owner npm install --no-audit --no-fund --package-lock=false
else
  run_as_owner npm install --no-audit --no-fund --package-lock=false
fi
run_as_owner npm run build
[[ -f "$APP_DIR/dist/index.html" ]] || fail "dist/index.html não foi gerado."
grep -Fq "Locaio" "$APP_DIR/dist/index.html" || fail "o build gerado não parece ser do Locaio."

log "Configurando virtual host Nginx exclusivo"
cat > "$NGINX_SITE" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    root $APP_DIR/dist;
    index index.html;
    client_max_body_size 20M;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \\.(?:js|css|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2)$ {
        try_files \$uri =404;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
    }

    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Frame-Options SAMEORIGIN always;
}
NGINX

ln -sfn "$NGINX_SITE" "$NGINX_ENABLED"
nginx -t
systemctl reload nginx

log "Validando HTTP antes do certificado"
http_body="$(curl --fail --silent --show-error --max-time 15 -H "Host: $DOMAIN" http://127.0.0.1/)"
grep -Fq "Locaio" <<<"$http_body" || fail "o vhost HTTP ainda não está entregando o Locaio."

if command -v certbot >/dev/null 2>&1; then
  log "Emitindo/atualizando certificado HTTPS com Certbot"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
  nginx -t
  systemctl reload nginx
else
  fail "certbot não está instalado; HTTP foi configurado, mas HTTPS ainda não."
fi

log "Validando HTTPS local por SNI"
https_body="$(curl --fail --silent --show-error --location --max-time 20 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/")"
grep -Fq "Locaio" <<<"$https_body" || fail "o HTTPS local não está entregando o Locaio."

cert_subject="$(echo | openssl s_client -connect 127.0.0.1:443 -servername "$DOMAIN" 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName 2>/dev/null || true)"
grep -Fq "$DOMAIN" <<<"$cert_subject" || fail "o certificado apresentado não contém $DOMAIN."

log "Validando endpoint público da API do Locaio"
api_status="$(curl --silent --show-error --output /tmp/locaio-api-config.json --write-out '%{http_code}' --max-time 20 https://api.petertecnet.com.br/api/v1/apps/locaio/config)"
[[ "$api_status" == "200" ]] || { cat /tmp/locaio-api-config.json >&2 || true; fail "contexto da API respondeu HTTP $api_status."; }

log "Concluído. $DOMAIN agora serve o frontend do Locaio com HTTPS."
printf 'Commit publicado: %s\n' "$(git -C "$APP_DIR" rev-parse HEAD)"
