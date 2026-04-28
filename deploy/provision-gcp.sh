#!/usr/bin/env bash
# Provisions a single GCE VM that runs the whole stack via Docker Compose.
# Usage: edit the vars below, then: ./deploy/provision-gcp.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-us-central1-a}"
INSTANCE="${INSTANCE:-ecostride}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-small}"     # 2 vCPU shared, 2GB RAM. Bump to e2-medium if tight.
DISK_SIZE="${DISK_SIZE:-30GB}"
IMAGE_FAMILY="${IMAGE_FAMILY:-debian-12}"
IMAGE_PROJECT="${IMAGE_PROJECT:-debian-cloud}"
NETWORK_TAG="ecostride-http"
REPO_URL="${REPO_URL:?set REPO_URL (e.g. https://github.com/you/ecostride.git)}"
REPO_BRANCH="${REPO_BRANCH:-dev}"

gcloud config set project "$PROJECT_ID"

# Reserve a static external IP (idempotent).
if ! gcloud compute addresses describe "${INSTANCE}-ip" --region "$REGION" >/dev/null 2>&1; then
  gcloud compute addresses create "${INSTANCE}-ip" --region "$REGION"
fi
STATIC_IP=$(gcloud compute addresses describe "${INSTANCE}-ip" --region "$REGION" --format='value(address)')
echo "Static IP: $STATIC_IP"

# Firewall: allow HTTP + SSH (SSH already allowed by default usually).
if ! gcloud compute firewall-rules describe allow-http >/dev/null 2>&1; then
  gcloud compute firewall-rules create allow-http \
    --allow=tcp:80 --target-tags="$NETWORK_TAG" --description="ecostride http"
fi

# Render startup script with repo info baked in.
STARTUP=$(REPO_URL="$REPO_URL" REPO_BRANCH="$REPO_BRANCH" envsubst < "$(dirname "$0")/startup.sh.tpl")

gcloud compute instances create "$INSTANCE" \
  --zone "$ZONE" \
  --machine-type "$MACHINE_TYPE" \
  --image-family "$IMAGE_FAMILY" \
  --image-project "$IMAGE_PROJECT" \
  --boot-disk-size "$DISK_SIZE" \
  --tags "$NETWORK_TAG" \
  --address "$STATIC_IP" \
  --metadata enable-oslogin=TRUE \
  --metadata-from-file startup-script=<(echo "$STARTUP")

echo
echo "VM created. SSH in once it boots:"
echo "  gcloud compute ssh $INSTANCE --zone $ZONE"
echo
echo "On first boot the VM clones the repo to /opt/ecostride and runs docker compose."
echo "You MUST then edit /opt/ecostride/.env on the VM and run: sudo docker compose up -d --build"
echo
echo "App will be reachable at: http://$STATIC_IP"
