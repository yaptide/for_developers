---
title: Docker Deployment
description: Running the YAPTIDE backend with Docker Compose.
---

The backend deployment uses **Docker Compose** with 6 services. This is the recommended way to run the full stack.

## Services

```yaml
# Simplified view of docker-compose.yml
services:
  redis:          # Celery broker + result backend
  postgresql:     # Primary database
  yaptide_flask:  # Flask API server
  yaptide_simulation_worker:  # Celery simulation worker
  yaptide_helper_worker:      # Celery helper worker
  nginx:          # Reverse proxy with TLS
```

### Service Details

| Service | Image | Port | Role |
|---|---|---|---|
| `redis` | `redis:8-alpine` | 6379 (internal) | Celery message broker and result backend |
| `postgresql` | `postgres:16-alpine` | 5432 (internal) | Primary database, persisted via named volume |
| `yaptide_flask` | `Dockerfile-flask` | 6000 (internal) | Flask API server |
| `yaptide_simulation_worker` | `Dockerfile-simulation-worker` | — | Runs simulator binaries via Celery |
| `yaptide_helper_worker` | `Dockerfile-helper-worker` | — | Batch job submission and cleanup via Celery |
| `nginx` | `Dockerfile-nginx` | 5000, 8443 | Reverse proxy with TLS termination |

### Exposed Ports

| Port | Protocol | Service |
|---|---|---|
| `5000` | HTTP | Nginx → Flask API |
| `8443` | HTTPS | Nginx → Flask API (TLS) |

## Quick Start

```bash
cd yaptide
docker compose up --build -d
```

Wait for all services to be healthy:

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
| `BACKEND_EXTERNAL_URL` | `https://localhost:8443` | Public-facing URL |
| `MAX_CORES` | (all) | CPU limit for simulation worker |
| `LOG_LEVEL_ROOT` | `INFO` | Logging verbosity |

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

The PostgreSQL data is stored in a **named Docker volume** (`postgres_data`). This survives `docker compose down` but is removed with `docker compose down -v`.

> To completely reset the database: `docker compose down -v && docker compose up --build -d`

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
