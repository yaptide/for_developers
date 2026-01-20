# Managing Simulators with S3 Storage

## Overview

Yaptide supports two simulation engines: **SHIELD-HIT12A** and **FLUKA**. This document explains the simulator management system, how binaries are stored and deployed, and how to manage different simulator versions.

## Architecture and Logic

Yaptide implements a deployment strategy for managing simulation engine binaries. In the demo mode, when S3 environment variables are not configured in the `.env` file (or are missing from the environment), the system automatically downloads a constrained demo version of SHIELD-HIT12A directly from [shieldhit.org](https://shieldhit.org). This demo build is intended for development and validation, uses a fixed random number generator seed, enforces a 10,000 primary particle limit, and remains unencrypted because it is public.

In production mode, when S3 credentials are configured in the `.env` file, the system retrieves full-featured simulator binaries from S3-compatible object storage. SHIELD-HIT12A and FLUKA binaries are stored in encrypted form; the decryption password and salt are supplied via the `.env` file and must match the values used during upload. This mode provides unrestricted functionality (custom random seeds, unlimited primaries) and retains a graceful fallback: if S3 download fails or credentials are unavailable, the system automatically falls back to the demo SHIELD-HIT12A build.

## Flow During Container Startup

The `yaptide-simulation-worker` container is built from [yaptide/Dockerfile-simulation-worker](https://github.com/yaptide/yaptide/blob/master/Dockerfile-simulation-worker) and invokes the startup script [yaptide/run_simulation_worker.sh](https://github.com/yaptide/yaptide/blob/master/run_simulation_worker.sh), which in turn calls the simulator manager [yaptide/yaptide/admin/simulators.py](https://github.com/yaptide/yaptide/blob/master/yaptide/admin/simulators.py). All required configuration is expected in the `.env` file; if a variable is absent there, the runtime environment is consulted, and if still missing a fallback path is taken.

SHIELD-HIT12A is always initialized: the script first attempts to fetch and decrypt the encrypted binary from S3 using `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_SHIELDHIT_BUCKET`, `S3_SHIELDHIT_KEY`, and the decryption parameters `S3_ENCRYPTION_PASSWORD` and `S3_ENCRYPTION_SALT` from `.env` or the environment. If any of these are unavailable or the download fails, the process falls back to downloading the public demo build from shieldhit.org and installs it into `/simulators/shieldhit12a/bin`.

FLUKA is initialized only when `S3_FLUKA_BUCKET` and `S3_FLUKA_KEY` are provided in `.env` or the environment; the payload is encrypted and decrypted with the same password and salt variables. If these variables are absent, FLUKA installation is skipped, allowing deployments that rely solely on SHIELD-HIT12A.

## Simulator Management Command Reference

**Note:** The simulation binaries are compiled for Linux. All commands should be executed on Linux or within Windows Subsystem for Linux (WSL). Running on native Windows will not work.

Use the project virtual environment managed by Poetry (see [Backend: For developers](for_developers.md) for installation and activation). The `simulators.py` CLI manages encrypted simulator binaries: it downloads SHIELD-HIT12A (with demo fallback), optionally downloads FLUKA, uploads encrypted artifacts to S3, and provides encrypt/decrypt helpers. Run `--help` to list commands:

```bash
poetry run ./yaptide/admin/simulators.py --help
```

For command-specific options, append `--help`, e.g.:

```bash
poetry run ./yaptide/admin/simulators.py download-shieldhit --help
```


### Available Commands

Most S3 parameters are read from environment variables (see [Environment Variables Configuration](#environment-variables-configuration) below). Run each command with `--help` for full options:

#### Download SHIELD-HIT12A from S3 (with demo fallback)

Retrieve the SHIELD-HIT12A binary from S3 storage and decrypt it locally. If S3 is unavailable, the system falls back to the public demo version:

```bash
poetry run ./yaptide/admin/simulators.py download-shieldhit --dir ./download --decrypt
```

Confirm successful download by listing the directory:

```bash
ls -lh ./download
```

Verify the binary version matches your expectations:
```bash
./download/shieldhit --version
```

Optionally validate the binary inside the simulation worker container (mounting read-only at a non-standard path to isolate from production simulators):
```bash
docker run --rm -it \
  -v "$(pwd)/download/shieldhit:/opt/test/shieldhit:ro" \
  --entrypoint /bin/bash yaptide_simulation_worker \
  -c "/opt/test/shieldhit --version"
```

For additional configuration options and parameters:

```bash
poetry run ./yaptide/admin/simulators.py download-shieldhit --help
```

#### Retrieve FLUKA from S3 (encrypted)

Download and decrypt the FLUKA binary from S3 storage. Requires valid S3 credentials configured in `.env`:

```bash
poetry run ./yaptide/admin/simulators.py download-fluka --dir ./download
```

For additional configuration options:

```bash
poetry run ./yaptide/admin/simulators.py download-fluka --help
```

#### Upload Simulator Binary to S3

Upload a compiled simulator binary to S3-compatible storage with optional encryption:

```bash
poetry run ./yaptide/admin/simulators.py upload --bucket my-bucket --file ./shieldhit --encrypt
```

For additional configuration options:

```bash
poetry run ./yaptide/admin/simulators.py upload --help
```

#### Encrypt File

Manually encrypt a binary:

```bash
poetry run ./yaptide/admin/simulators.py encrypt --infile ./shieldhit --outfile ./shieldhit.encrypted --password my-pass --salt my-salt
```

See options:

```bash
poetry run ./yaptide/admin/simulators.py encrypt --help
```

#### Decrypt File

Manually decrypt a binary:

```bash
poetry run ./yaptide/admin/simulators.py decrypt --infile ./shieldhit.encrypted --outfile ./shieldhit --password my-pass --salt my-salt
```

See options:

```bash
poetry run ./yaptide/admin/simulators.py decrypt --help
```

## Practical Examples

### Uploading a New SHIELD-HIT12A Version

Step-by-step example assuming SHIELD-HIT12A sources live in `$HOME/workspace/shieldhit`.

**1) Compile the binary (from the source dir)**

Enter the source tree:
```bash
cd "$HOME/workspace/shieldhit"
```

Compile with gfortran:
```bash
make gfortran -j
```

After build, the binary should be `./shieldhit`. Check its version:

Verify binary version:
```bash
./shieldhit --version
# Expected shape (example):
# SHIELD-HIT12A
# Version: v1.1.0-8-g4ea3f147
# Build date: Tue, 20 Jan 2026 11:28:34 +0100
# SHIELD-HIT12A is up to date.
```

Optionally rename to capture host/build metadata (recommended):

```bash
mv ./shieldhit ./shieldhit-lenovo-dev-g12fd3b8c-make-gfortran
```

**2) Upload to S3 with encryption (run from project root `yaptide/`)**

Switch to project root:
```bash
cd "$HOME/workspace/yaptide"
```

Upload with encryption to S3:
```bash
poetry run ./yaptide/admin/simulators.py upload \
  --bucket shieldhit \
  --file "$HOME/workspace/shieldhit/shieldhit-lenovo-dev-g12fd3b8c-make-gfortran" \
  --encrypt
```

**3) Verify download and execution**

Prepare temp download directory:
```bash
mkdir -p /tmp/sh-download
```

Download and decrypt from S3:
```bash
poetry run ./yaptide/admin/simulators.py download-shieldhit --dir /tmp/sh-download --decrypt
```

Run version check on downloaded binary:
```bash
/tmp/sh-download/shieldhit --version
```

If you want to validate inside the simulation worker container (without overwriting in-container simulators):

```bash
docker run --rm -it \
  -v "/tmp/sh-download/shieldhit:/opt/test/shieldhit:ro" \
  --entrypoint /bin/bash yaptide_simulation_worker \
  -c "/opt/test/shieldhit --version"
```

## Environment Variables Configuration

For S3-based deployment, configure these environment variables (`.env` file):

```bash
# S3 General Configuration
S3_ENDPOINT=s3.mycompany.com
S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# SHIELD-HIT12A Configuration
S3_SHIELDHIT_BUCKET=yaptide-simulators
S3_SHIELDHIT_KEY=shieldhit_latest

# FLUKA Configuration
S3_FLUKA_BUCKET=yaptide-simulators-fluka
S3_FLUKA_KEY=fluka_v2024.tar.gz.encrypted

# Encryption Configuration
S3_ENCRYPTION_PASSWORD=my-secure-password
S3_ENCRYPTION_SALT=my-salt-value
```