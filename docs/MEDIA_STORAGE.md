# Media storage (backend)

EcoStride supports 3 runtime-selectable storage providers behind a single `StorageProvider` interface:

- `local`: writes to disk under `MEDIA_DIR` and serves via `GET /media/*key`
- `spaces`: uploads to DigitalOcean Spaces (S3-compatible)
- `gcs`: uploads to Google Cloud Storage

## Selecting a provider

Set `STORAGE_PROVIDER` to one of: `local`, `spaces`, `gcs`.

If `STORAGE_PROVIDER` is not set:
- Development: defaults to `local`
- Production: the backend fails fast

Production detection:
- `APP_ENV=production` (or `prod`) OR `GIN_MODE=release`

## Common env vars

- `BASE_URL` (local public URL generation, e.g. `http://localhost:8080`)
- `MEDIA_DIR` (local storage directory, e.g. `./uploads`)
- `MAX_UPLOAD_MB` (max upload size, default `10`)

## Local (development)

```bash
STORAGE_PROVIDER=local
MEDIA_DIR=./uploads
BASE_URL=http://localhost:8080
MAX_UPLOAD_MB=10
```

Uploaded files are stored with keys like `YYYY/MM/DD/<uuid>.<ext>` and are publicly available at `BASE_URL/media/<key>`.

## DigitalOcean Spaces

```bash
STORAGE_PROVIDER=spaces
SPACES_ENDPOINT=nyc3.digitaloceanspaces.com
SPACES_REGION=nyc3
SPACES_BUCKET=ecostride
SPACES_ACCESS_KEY=...
SPACES_SECRET_KEY=...
SPACES_PUBLIC_BASE_URL=https://ecostride.nyc3.digitaloceanspaces.com   # optional
SPACES_PUBLIC_READ=true                                                # default true
```

If `SPACES_PUBLIC_BASE_URL` is not provided, the backend derives it as `https://<bucket>.<endpoint>`.

## Google Cloud Storage (public objects by default)

```bash
STORAGE_PROVIDER=gcs
GCS_BUCKET=ecostride-media
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json           # or workload identity
GCS_PUBLIC_BASE_URL=https://storage.googleapis.com/ecostride-media     # optional
GCS_USE_SIGNED_URLS=false
```

When `GCS_USE_SIGNED_URLS=true`, `Media.URL` is stored empty and the backend redirects `GET /media/*key` to a signed URL.
Signed URL generation currently requires a service account JSON file via `GOOGLE_APPLICATION_CREDENTIALS`.

