#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${DOMAIN:-locaio.petertecnet.com.br}"
APP_DIR="${APP_DIR:-/var/www/locaio.petertecnet.com.br}"
REPOSITORY="${REPOSITORY:-https://github.com/petertecnetdev/locaio.petertecnet.com.br.git}"
BRANCH="${BRANCH:-main}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
NGINX_FALLBACK="/etc/nginx/conf.d/${DOMAIN}.conf"
LOCK_FILE="${LOCK_FILE:-/run/lock/locaio-vps-bootstrap.lock}"
MARKER="# Managed by Locaio bootstrap: ${DOMAIN}"

log() { printf '\n[Locaio bootstrap] %s\n' "$*"; }
fail() { printf '\n[Locaio bootstrap] ERROR: %s\n' "$*" >&2; exit 1; }

git_app() {
  git -c safe.directory="$APP_DIR" -C "$APP_DIR" "$@"
}

[[ "$(id -u)" -eq 0 ]] || fail "execute este script como root."
[[ "$APP_DIR" == /var/www/* ]] || fail "APP_DIR precisa ficar abaixo de /var/www."
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || fail "domínio inválido."
command -v git >/dev/null || fail "git não está instalado."
command -v npm >/dev/null || fail "npm/node não estão instalados."
command -v nginx >/dev/null || fail "nginx não está instalado."
command -v flock >/dev/null || fail "flock não está instalado."
command -v curl >/dev/null || fail "curl não está instalado."

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
  current_remote="$(git_app remote get-url origin 2>/dev/null || true)"
  case "$current_remote" in
    "$REPOSITORY"|git@github.com:petertecnetdev/locaio.petertecnet.com.br.git) ;;
    *) fail "$APP_DIR aponta para um repositório diferente: $current_remote" ;;
  esac
fi

git_app fetch --prune origin "$BRANCH"
git_app checkout "$BRANCH"
git_app reset --hard "origin/$BRANCH"
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

log "Removendo conflitos antigos de server_name do Locaio"
target_real="$(readlink -f "$NGINX_SITE" 2>/dev/null || printf '%s' "$NGINX_SITE")"
fallback_real="$(readlink -f "$NGINX_FALLBACK" 2>/dev/null || printf '%s' "$NGINX_FALLBACK")"
declare -A seen_conf=()
while IFS= read -r candidate; do
  [[ -n "$candidate" ]] || continue
  candidate_real="$(readlink -f "$candidate" 2>/dev/null || printf '%s' "$candidate")"
  [[ -n "${seen_conf[$candidate_real]:-}" ]] && continue
  seen_conf[$candidate_real]=1
  [[ "$candidate_real" == "$target_real" || "$candidate_real" == "$fallback_real" ]] && continue
  if grep -Eq "^[[:space:]]*server_name[[:space:]].*${DOMAIN//./\\.}" "$candidate_real" 2>/dev/null; then
    backup="${candidate_real}.pre-locaio-$(date +%Y%m%d%H%M%S)"
    cp -a "$candidate_real" "$backup"
    DOMAIN_FOR_PERL="$DOMAIN" perl -pi -e 'if (/^\s*server_name\s+/) { my $d=$ENV{"DOMAIN_FOR_PERL"}; s/(^|\s)\Q$d\E(?=\s|;)/$1/g; s/^\s*server_name\s*;\s*$/# server_name removed by Locaio bootstrap;/; }' "$candidate_real"
    log "Conflito removido de $candidate_real (backup: $backup)"
  fi
done < <(grep -RIl --exclude='*.pre-locaio-*' -- "$DOMAIN" /etc/nginx 2>/dev/null || true)

log "Configurando virtual host Nginx exclusivo"
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d
rm -f "$NGINX_FALLBACK"
cat > "$NGINX_SITE" <<NGINX
$MARKER
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

log "Confirmando que o Nginx realmente inclui o vhost"
effective_config="$(nginx -T 2>&1)"
if ! grep -Fq "$MARKER" <<<"$effective_config"; then
  log "sites-enabled não está sendo incluído; ativando fallback em conf.d"
  cp "$NGINX_SITE" "$NGINX_FALLBACK"
  nginx -t
  effective_config="$(nginx -T 2>&1)"
fi
grep -Fq "$MARKER" <<<"$effective_config" || fail "nginx.conf não inclui sites-enabled nem conf.d; revise os includes do nginx.conf."

systemctl reload nginx

log "Validando HTTP antes do certificado"
http_headers="$(mktemp)"
http_body_file="$(mktemp)"
http_code="$(curl --silent --show-error --max-time 15 -D "$http_headers" -o "$http_body_file" -w '%{http_code}' -H "Host: $DOMAIN" http://127.0.0.1/ || true)"
if [[ "$http_code" != "200" ]] || ! grep -Fq "Locaio" "$http_body_file"; then
  printf '\n--- Diagnóstico HTTP ---\n' >&2
  printf 'HTTP status: %s\n' "$http_code" >&2
  sed -n '1,20p' "$http_headers" >&2 || true
  head -c 1200 "$http_body_file" >&2 || true
  printf '\n--- Configurações efetivas contendo o domínio ---\n' >&2
  nginx -T 2>&1 | grep -n -B3 -A10 -F "$DOMAIN" >&2 || true
  fail "o vhost HTTP ainda não está entregando o Locaio."
fi
rm -f "$http_headers" "$http_body_file"

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
printf 'Commit publicado: %s\n' "$(git_app rev-parse HEAD)"
