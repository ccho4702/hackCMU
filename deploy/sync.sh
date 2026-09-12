#!/usr/bin/env bash
# Sync local source to the demo VPS. Bind-mounted, so no image rebuild.
# Use --build only when Python/Node dependencies change.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="${LABEL:-hackcmu-optune}"
REMOTE_DIR="${REMOTE_DIR:-/opt/optune}"
SSH_USER="${SSH_USER:-root}"
BUILD=0
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=1 ;;
    --help|-h)
      echo "usage: deploy/sync.sh [--build]"
      exit 0
      ;;
  esac
done

cd "$ROOT"
IP="$(python3 deploy/provision.py wait --label "$LABEL" --timeout 30)"
SITE_HOST="$IP"
PUBLIC_ORIGIN="https://${IP},http://${IP},https://${IP}:443,http://${IP}:80,http://${IP}:3000"
CERT_DIR="$ROOT/deploy/certs"
mkdir -p "$CERT_DIR"
if [[ ! -f "$CERT_DIR/cert.pem" ]] || ! openssl x509 -in "$CERT_DIR/cert.pem" -noout -text 2>/dev/null | grep -q "$IP"; then
  openssl req -x509 -newkey rsa:2048 -sha256 -days 14 -nodes \
    -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
    -subj "/CN=${IP}" \
    -addext "subjectAltName=IP:${IP}"
fi

echo "syncing to ${SSH_USER}@${IP}:${REMOTE_DIR}"
SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8)
for i in $(seq 1 30); do
  if "${SSH[@]}" "${SSH_USER}@${IP}" 'mkdir -p "'"${REMOTE_DIR}"'"' 2>/dev/null; then
    break
  fi
  echo "waiting for ssh (try $i)..."
  sleep 5
  if [[ "$i" -eq 30 ]]; then
    echo "ssh never became ready" >&2
    exit 1
  fi
done
rsync -az --delete --exclude-from deploy/rsync-exclude \
  "$ROOT/" "${SSH_USER}@${IP}:${REMOTE_DIR}/"
"${SSH[@]}" "${SSH_USER}@${IP}" "rm -f '${REMOTE_DIR}/frontend/.env.local'"

if [[ "$BUILD" -eq 1 ]]; then
  UP_ARGS=(up -d --build)
else
  UP_ARGS=(up -d)
fi

ssh "${SSH_USER}@${IP}" bash -s <<EOF
set -euo pipefail
cd '${REMOTE_DIR}'
until docker info >/dev/null 2>&1; do
  echo 'waiting for docker...'
  sleep 5
done
PUBLIC_ORIGIN='${PUBLIC_ORIGIN}' SITE_HOST='${SITE_HOST}' docker compose -f docker-compose.yml -f docker-compose.prod.yml ${UP_ARGS[*]}
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart frontend
EOF

echo "updated https://${IP}"
