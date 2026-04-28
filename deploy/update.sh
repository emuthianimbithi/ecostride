#!/usr/bin/env bash
# Run on the VM to pull latest code and redeploy.
set -euo pipefail
cd /opt/ecostride
git pull --ff-only
docker compose up -d --build
docker image prune -f
