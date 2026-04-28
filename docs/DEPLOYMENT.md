# Deploying ecostride to a single GCP VM

Single-VM deployment. Everything (Postgres, Redis, Go API, Next.js, nginx) runs as Docker containers on one Compute Engine instance. Uploads persist on a local Docker volume on the VM. No domain — the app is served over HTTP on the VM's static external IP.

## What you get

- `nginx` on port 80 reverse-proxies:
  - `/api/*`, `/media/*`, `/healthz` → backend (Go) on `:8080`
  - everything else → frontend (Next.js) on `:3000`
- DB migrations run automatically on each `docker compose up` via the `migrate` service.
- `ecostride_uploads` Docker volume holds user-uploaded media.
- `ecostride_pg` Docker volume holds the database.

## Prerequisites

- A GCP project with billing enabled.
- `gcloud` CLI authenticated locally (`gcloud auth login`).
- This repo pushed to a Git URL the VM can clone (public, or set up a deploy key).

## One-time provision

```bash
export PROJECT_ID=your-gcp-project
export REPO_URL=https://github.com/you/ecostride.git
export REPO_BRANCH=dev          # optional, defaults to dev
export ZONE=us-central1-a       # optional
./deploy/provision-gcp.sh
```

This:
1. Reserves a static external IP `ecostride-ip`.
2. Adds firewall rule `allow-http` (port 80).
3. Creates VM `ecostride` (Debian 12, e2-small, 30 GB disk).
4. The VM's startup script installs Docker, clones the repo to `/opt/ecostride`, generates `.env` from `.env.example` with random secrets, and runs `docker compose up -d --build`.

First boot takes ~5–10 minutes (Docker install + image builds).

## After first boot

SSH in and edit `.env` for anything not auto-generated (Stripe / M-Pesa / SMTP keys, `BASE_URL`, etc.):

```bash
gcloud compute ssh ecostride --zone us-central1-a
sudo -i
cd /opt/ecostride
nano .env
docker compose up -d --build
docker compose logs -f
```

Open `http://<STATIC_IP>` in a browser.

## Updates

On the VM:

```bash
cd /opt/ecostride
sudo ./deploy/update.sh
```

## Backups (manual, no domain / no managed services)

```bash
# DB dump
docker compose exec -T db pg_dump -U ecostride ecostride | gzip > ecostride-$(date +%F).sql.gz

# Uploads
sudo tar czf uploads-$(date +%F).tgz -C /var/lib/docker/volumes/ecostride_ecostride_uploads/_data .
```

Copy off-VM with `gcloud compute scp`.

## Tearing down

```bash
gcloud compute instances delete ecostride --zone us-central1-a
gcloud compute addresses delete ecostride-ip --region us-central1
gcloud compute firewall-rules delete allow-http
```

## Local dev (same compose file)

```bash
cp .env.example .env
docker compose up --build
```

App on `http://localhost`.

## Notes / caveats

- HTTP only. Anyone sniffing the network sees traffic in cleartext. If you later add a domain, swap `nginx` for Caddy in `docker-compose.yml` for free auto-HTTPS.
- Single VM = no HA. A reboot or zone outage = downtime.
- `e2-small` is borderline for building Next.js on the VM. If `docker compose build` OOMs, bump to `e2-medium` or build the images locally and push to Artifact Registry.
