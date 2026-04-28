#!/usr/bin/env bash
# GCE startup script — runs as root on first boot.
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg git

# Install Docker (official repo).
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

APP_DIR=/opt/ecostride
if [ ! -d "$APP_DIR" ]; then
  git clone --branch "${REPO_BRANCH}" "${REPO_URL}" "$APP_DIR"
fi

cd "$APP_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
  # Generate strong secrets so the stack can boot once edited.
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^REFRESH_SECRET=.*|REFRESH_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" .env
  PG_PW=$(grep ^POSTGRES_PASSWORD= .env | cut -d= -f2)
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgres://ecostride:${PG_PW}@db:5432/ecostride?sslmode=disable|" .env
fi

# First-boot bring-up. Subsequent updates are manual: ssh in, git pull, docker compose up -d --build.
docker compose pull || true
docker compose up -d --build
