---
title: Docker Deployment
description: Running the YAPTIDE backend with Docker Compose.
---

The backend deployment uses **Docker Compose** with 7 services. This is the recommended way to run the full stack.

## Services

```yaml
# Simplified view of docker-compose.yml
services:
  garage:         # S3 bucket for the result pages
  redis:          # Celery broker + result backend
  postgresql:     # Primary database
  yaptide_flask:  # Flask API server (gunicorn)
  yaptide_simulation_worker:  # Celery simulation worker
  yaptide_helper_worker:      # Celery helper worker
  nginx:          # Reverse proxy with TLS
```

### Service Details

| Service | Image | Port | Role |
|---|---|---|---|
| `garage` | `dxflrs/garage:v2.4.1` | 3900 (internal) | S3 object storage for result pages, bucket `yaptide-results`, persisted via named volumes |
| `redis` | `redis:8-alpine` | 6379 (internal) | Celery message broker and result backend |
| `postgresql` | `postgres:16-alpine` | 5432 (internal) | Primary database, persisted via named volume |
| `yaptide_flask` | `Dockerfile-flask` | 6000 (internal) | Flask API server under gunicorn, migrates the database on start |
| `yaptide_simulation_worker` | `Dockerfile-simulation-worker` | — | Runs simulator binaries via Celery |
| `yaptide_helper_worker` | `Dockerfile-helper-worker` | — | Batch job submission and cleanup via Celery |
| `nginx` | `Dockerfile-nginx` | 5000, 8443 | Reverse proxy with TLS termination |

### Flask Server

The `yaptide_flask` container starts `run_flask.sh`, which:

1. Prepares the database once, before any worker starts (`prepare_database` in `yaptide/persistence/models.py`):
   a database under migrations is upgraded to the latest revision; a new database is created from the models and
   stamped with the latest revision. See [Database → Migration Workflow](/for_developers/backend/database/#migration-workflow).
2. Starts **gunicorn** with the settings in `gunicorn.conf.py`: sync workers, `2 × CPUs + 1` by default, limited by
   the container's memory (about 300 MB per worker) and capped at 32, each holding one PostgreSQL connection.

All gunicorn workers sign and verify tokens with the same secrets, `YAPTIDE_TOKEN_SECRET` and
`YAPTIDE_REFRESH_TOKEN_SECRET`. When they are not set, `run_flask.sh` generates them at start and logs a warning:
every restart then invalidates logged-in sessions and the update keys of running HPC jobs, so set both in
production.

The service has a `stop_grace_period` of 40 s, longer than gunicorn's 30 s graceful shutdown, so requests in
progress finish during a redeploy.

Nginx resolves `yaptide_flask` through Docker's DNS on each request (cached for 10 s), so a restarted Flask
container is reached at its new address without reloading nginx.

### Result Storage

Result pages live in the `yaptide-results` bucket of the `garage` service (single node, configured by `garage.toml`),
see [Result Storage](/for_developers/backend/result-storage/). Garage creates the bucket and its key on the first
start from three values that must be in `.env` (compose refuses to start without them):

```bash
echo "RESULTS_S3_ACCESS_KEY=GK$(openssl rand -hex 12)" >> .env
echo "RESULTS_S3_SECRET_KEY=$(openssl rand -hex 32)" >> .env
echo "GARAGE_RPC_SECRET=$(openssl rand -hex 32)" >> .env
```

Keep them: the key pair is fixed after the first start, and a new secret for the same key id stops Garage from
starting. Garage publishes no port. Flask reaches it inside the compose network (`http://garage:3900`), and the
browser reaches it through nginx at `/yaptide-results/` (GET only) with links that Flask signs for
`BACKEND_EXTERNAL_URL`. That variable must therefore be the address the browser reaches nginx at.

### Exposed Ports

| Port | Protocol | Service |
|---|---|---|
| `5000` | HTTP | Nginx → Flask API |
| `8443` | HTTPS | Nginx → Flask API (TLS) |

Both ports also serve `/yaptide-results/`, the result pages in Garage.

## Quick Start

```bash
cd yaptide
# once: the keys of the results bucket, see Result Storage above
echo "RESULTS_S3_ACCESS_KEY=GK$(openssl rand -hex 12)" >> .env
echo "RESULTS_S3_SECRET_KEY=$(openssl rand -hex 32)" >> .env
echo "GARAGE_RPC_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up --build -d
```

The database is created or migrated when `yaptide_flask` starts. Wait for all services to be healthy:

```bash
docker compose ps
```

Create a user:

```bash
docker compose exec yaptide_flask python -m yaptide.admin.db_manage add-user \
  --username admin --password admin123
```

## Compose Variants

### Standard (Production-like)

```bash
docker compose up --build -d
```

### Fast Development

Faster healthcheck intervals for quicker startup feedback:

```bash
docker compose -f docker-compose.yml -f docker-compose.fast.yml up --build -d
```

> Requires Docker Engine v25+ for the fast healthcheck `start_interval` option.

### Development with pgAdmin

Adds a pgAdmin instance on port 9999:

```bash
docker compose -f docker-compose.yml -f docker-compose-develop.yml up --build -d
```

Access pgAdmin at **http://localhost:9999** with:
- Email: `admin@admin.com`
- Password: `admin`

Connect to PostgreSQL using:
- Host: `postgresql`
- Port: `5432`
- Database: `yaptide`
- Username/Password: from `POSTGRES_USER`/`POSTGRES_PASSWORD` env vars

## Environment Variables

Set these in a `.env` file in the `yaptide/` root or pass them via Docker:

### Database

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_DB` | `yaptide` | Database name |
| `POSTGRES_USER` | `yaptide` | Database username |
| `POSTGRES_PASSWORD` | `yaptide` | Database password |

### Application

| Variable | Default | Description |
|---|---|---|
| `FLASK_SQLALCHEMY_DATABASE_URI` | (derived) | Full PostgreSQL connection string |
| `CELERY_BROKER_URL` | `redis://redis:6379/0` | Redis broker URL |
| `CELERY_RESULT_BACKEND` | `redis://redis:6379/0` | Redis result backend |
| `BACKEND_INTERNAL_URL` | `http://yaptide_flask:6000` | Internal URL for worker → Flask |
| `BACKEND_EXTERNAL_URL` | `https://localhost:8443` | Public-facing URL; signed links to result pages point here |
| `MAX_CORES` | (all) | CPU limit for simulation worker |
| `LOG_LEVEL_ROOT` | `INFO` | Logging verbosity |
| `YAPTIDE_TOKEN_SECRET` | (generated at start) | Secret for access tokens and simulation update keys, shared by all gunicorn workers |
| `YAPTIDE_REFRESH_TOKEN_SECRET` | (generated at start) | Secret for refresh tokens, shared by all gunicorn workers |
| `GUNICORN_WORKERS` | (sized to the container) | Number of gunicorn workers; above 32, raise PostgreSQL's `max_connections` to match |
| `GUNICORN_TIMEOUT` | `300` | Seconds a worker may spend on one request (large `/results` uploads) |

### Results Bucket

| Variable | Default | Description |
|---|---|---|
| `RESULTS_S3_ACCESS_KEY` | (required) | Key id of the bucket, `GK` + 24 hex characters; Garage creates it on the first start |
| `RESULTS_S3_SECRET_KEY` | (required) | Its secret, 64 hex characters |
| `GARAGE_RPC_SECRET` | (required) | Garage's internal secret, 64 hex characters |
| `RESULTS_S3_BUCKET` | `yaptide-results` | Set by `docker-compose.yml` |
| `RESULTS_S3_ENDPOINT` | `http://garage:3900` | Set by `docker-compose.yml`; where Flask writes the pages |
| `RESULTS_S3_PUBLIC_ENDPOINT` | `BACKEND_EXTERNAL_URL` | Optional: another address for the browser's signed links |
| `RESULTS_S3_REGION` | `garage` | Optional: the region of another S3 server |

Flask does not start without the bucket settings.

### Authentication

| Variable | Description |
|---|---|
| `KEYCLOAK_BASE_URL` | Keycloak server URL |
| `KEYCLOAK_REALM` | Keycloak realm |
| `CERT_AUTH_URL` | PLGrid cert-auth service URL |

### Simulator Storage (S3)

| Variable | Description |
|---|---|
| `S3_ENDPOINT` | S3-compatible endpoint |
| `S3_ACCESS_KEY` | S3 access key |
| `S3_SECRET_KEY` | S3 secret key |
| `S3_ENCRYPTION_PASSWORD` | Binary encryption password |
| `S3_ENCRYPTION_SALT` | Binary encryption salt |
| `S3_SHIELDHIT_BUCKET` / `S3_SHIELDHIT_KEY` | SHIELD-HIT12A binary location |
| `S3_FLUKA_BUCKET` / `S3_FLUKA_KEY` | FLUKA binary location |
| `S3_TOPAS_BUCKET` / `S3_TOPAS_KEY` | TOPAS binary location |

## TLS Configuration

Nginx is configured with self-signed TLS certificates for development. The `Dockerfile-nginx` generates certificates at build time.

```
nginx.conf excerpt:
  listen 8443 ssl;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_certificate     /etc/nginx/ssl/cert.pem;
  ssl_certificate_key /etc/nginx/ssl/key.pem;
```

For production, replace the self-signed certificates with real ones:
- Mount certificates via Docker volumes
- Or use a reverse proxy like Traefik or Caddy in front of Nginx

## Volume Persistence

The PostgreSQL data is stored in a **named Docker volume** (`postgres_data`), and the result pages in two
(`garage_meta`, `garage_data`). They survive `docker compose down` but are removed with `docker compose down -v`.

> To completely reset the database and the results: `docker compose down -v && docker compose up --build -d`

`scripts/backup.sh` (see the backend's `README.md`) sends a `pg_dump` and a mirror of the bucket to a second S3
server, and restores them.

## Container Images on GHCR

Pre-built images are published to **GitHub Container Registry** (GHCR).

### Automated Publishing

- **On push to main**: images are tagged with the Git SHA and `latest`
- **On tag push** (`v*`): images are tagged with the version number

### Manual Pull

```bash
docker pull ghcr.io/yaptide/yaptide-flask:latest
docker pull ghcr.io/yaptide/yaptide-simulation-worker:latest
docker pull ghcr.io/yaptide/yaptide-helper-worker:latest
docker pull ghcr.io/yaptide/yaptide-nginx:latest
```

### Retention Policy

- `latest` and versioned tags: kept indefinitely
- SHA-tagged images: cleaned up after 30 days
- Untagged images: cleaned up weekly
