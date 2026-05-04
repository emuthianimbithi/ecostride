#!/usr/bin/env bash
# One-time setup for a fresh DigitalOcean Ubuntu/Debian droplet.
# Run as root on the droplet:
#   curl -fsSL https://raw.githubusercontent.com/<you>/ecostride/dev/deploy/bootstrap-droplet.sh | bash -s -- <repo-url> <branch>
# Or scp this file over and: bash bootstrap-droplet.sh <repo-url> <branch>
set -euxo pipefail

REPO_URL="${1:?repo URL required, e.g. https://github.com/you/ecostride.git}"
REPO_BRANCH="${2:-dev}"
APP_DIR=/opt/ecostride

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg git ufw

# Docker (official repo).
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  . /etc/os-release
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

# Firewall: allow SSH + HTTP.
ufw allow OpenSSH || true
ufw allow 80/tcp || true
yes | ufw enable || true

# Clone repo.
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# Generate .env with strong secrets if not present.
if [ ! -f .env ]; then
  cp .env.example .env
  PG_PW=$(openssl rand -hex 16)
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PW}|" .env
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgres://ecostride:${PG_PW}@db:5432/ecostride?sslmode=disable|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^REFRESH_SECRET=.*|REFRESH_SECRET=$(openssl rand -hex 32)|" .env
  PUBLIC_IP=$(curl -fsSL https://api.ipify.org || hostname -I | awk '{print $1}')
  sed -i "s|^BASE_URL=.*|BASE_URL=http://${PUBLIC_IP}|" .env
  echo "Generated .env at $APP_DIR/.env — review and edit Stripe/MPesa/SMTP keys as needed."
fi

# First boot.
docker compose up -d --build

echo
echo "Bootstrap complete. App on http://$(curl -fsSL https://api.ipify.org 2>/dev/null || echo '<droplet-ip>')"
echo "GitHub Actions will now redeploy on every push to ${REPO_BRANCH}."
