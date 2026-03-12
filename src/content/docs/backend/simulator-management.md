---
title: Simulator Management
description: How simulator binaries are stored, encrypted, and deployed in YAPTIDE.
---

YAPTIDE runs external simulator binaries (SHIELD-HIT12A, FLUKA, TOPAS) as subprocesses. These binaries are managed through an S3-based storage and encryption system.

## Architecture

```
S3 Bucket
├── shieldhit/
│   └── shieldhit-encrypted.tar.gz    ← AES-encrypted archive
├── fluka/
│   └── fluka-encrypted.tar.gz
└── topas/
    └── topas-encrypted.tar.gz

                    │
                    │ Download at container startup
                    ▼

Simulation Worker Container
├── /usr/local/bin/shieldhit
├── /usr/local/bin/fluka_sim
└── /usr/local/bin/topas
```

## Demo vs Production

| Mode | Source | Encryption |
|---|---|---|
| **Demo** | Downloaded from public SHIELD-HIT12A website | No encryption |
| **Production** | Downloaded from private S3 bucket | AES-encrypted with password + salt |

The simulation worker startup script (`run_simulation_worker.sh`) checks for S3 credentials:
- If S3 credentials are set → download from S3, decrypt, extract
- If no S3 credentials → fall back to the public demo download

## S3 Storage

Encrypted simulator archives are stored in S3-compatible storage (e.g., AWS S3, MinIO).

### Environment Variables

| Variable | Description |
|---|---|
| `S3_ENDPOINT` | S3 endpoint URL |
| `S3_ACCESS_KEY` | S3 access key |
| `S3_SECRET_KEY` | S3 secret key |
| `S3_ENCRYPTION_PASSWORD` | AES encryption password |
| `S3_ENCRYPTION_SALT` | AES encryption salt |
| `S3_SHIELDHIT_BUCKET` | Bucket name for SHIELD-HIT12A |
| `S3_SHIELDHIT_KEY` | Object key for SHIELD-HIT12A archive |
| `S3_FLUKA_BUCKET` | Bucket name for FLUKA |
| `S3_FLUKA_KEY` | Object key for FLUKA archive |
| `S3_TOPAS_BUCKET` | Bucket name for TOPAS |
| `S3_TOPAS_KEY` | Object key for TOPAS archive |

## CLI Commands

The `yaptide.admin.simulators` module provides CLI commands for managing simulator binaries.

### Download

```bash
# Download SHIELD-HIT12A from S3 (or demo fallback)
poetry run python -m yaptide.admin.simulators download-shieldhit

# Download FLUKA from S3
poetry run python -m yaptide.admin.simulators download-fluka

# Download TOPAS from S3
poetry run python -m yaptide.admin.simulators download-topas
```

### Encrypt

Encrypt a local simulator binary for S3 upload:

```bash
poetry run python -m yaptide.admin.simulators encrypt \
  --input /path/to/shieldhit \
  --output shieldhit-encrypted.tar.gz \
  --password "your-encryption-password" \
  --salt "your-encryption-salt"
```

### Decrypt

Decrypt an archived binary (for testing):

```bash
poetry run python -m yaptide.admin.simulators decrypt \
  --input shieldhit-encrypted.tar.gz \
  --output /path/to/shieldhit \
  --password "your-encryption-password" \
  --salt "your-encryption-salt"
```

## Uploading a New Simulator Version

Step-by-step example for uploading a new SHIELD-HIT12A release:

### 1. Obtain the Binary

Get the new simulator binary (e.g., `shieldhit` Linux x86_64 ELF).

### 2. Encrypt

```bash
poetry run python -m yaptide.admin.simulators encrypt \
  --input ./shieldhit \
  --output shieldhit-v1.2.0-encrypted.tar.gz \
  --password "$S3_ENCRYPTION_PASSWORD" \
  --salt "$S3_ENCRYPTION_SALT"
```

### 3. Upload to S3

Use the AWS CLI, MinIO client, or any S3-compatible tool:

```bash
aws s3 cp shieldhit-v1.2.0-encrypted.tar.gz \
  s3://$S3_SHIELDHIT_BUCKET/$S3_SHIELDHIT_KEY \
  --endpoint-url $S3_ENDPOINT
```

### 4. Verify

Restart the simulation worker (or trigger a new container deployment). The worker downloads and decrypts the binary at startup:

```bash
docker compose restart yaptide_simulation_worker
```

Check the worker logs:

```bash
docker compose logs yaptide_simulation_worker | grep -i "shieldhit"
```

### 5. Test

Submit a simulation and verify it runs successfully with the new binary version.

## Container Startup Flow

When the simulation worker container starts (`run_simulation_worker.sh`):

```
1. Check for S3 environment variables
   ├── If set:
   │   ├── Download encrypted archive from S3
   │   ├── Decrypt with password + salt
   │   ├── Extract binary to /usr/local/bin/
   │   └── Set executable permissions
   └── If not set:
       ├── Download demo SHIELD-HIT12A from public URL
       └── Extract to /usr/local/bin/

2. Verify binary is executable
3. Start Celery simulation worker
```

## Security

- Binaries are **AES-encrypted** at rest in S3
- Encryption credentials are passed as environment variables (not committed to code)
- The container never stores unencrypted binaries on persistent volumes — they exist only in the container's ephemeral filesystem
- S3 bucket policies should restrict access to the deployment pipeline only
