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

!!! warning "Linux/WSL Required"
    The simulation binaries are compiled for Linux. All commands should be executed on Linux or within Windows Subsystem for Linux (WSL). Running on native Windows will not work.

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

#### Download SHIELD-HIT12A

Download SHIELD-HIT12A to the `./download` directory from S3 or fall back to demo version:

```bash
poetry run ./yaptide/admin/simulators.py download-shieldhit --dir ./download --decrypt
```

Verify the download:

```bash
ls -lh ./download
```

Check version:
```bash
./download/shieldhit --version
```

See options:

```bash
poetry run ./yaptide/admin/simulators.py download-shieldhit --help
```

#### Download FLUKA

Download FLUKA simulator (encrypted, requires S3 credentials):

```bash
poetry run ./yaptide/admin/simulators.py download-fluka --dir ./download
```

See options:

```bash
poetry run ./yaptide/admin/simulators.py download-fluka --help
```

#### Upload Simulator to S3

Upload a compiled binary (optionally encrypted):

```bash
poetry run ./yaptide/admin/simulators.py upload --bucket my-bucket --file ./shieldhit --encrypt
```

See options:

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

Assume you have compiled a new SHIELD-HIT12A binary and want to upload it to S3 for production use.

**Step 1: Compile the binary**

```bash
./compile_shieldhit.sh
# Result: ./build/shieldhit (or shieldhit.exe on Windows)
```

**Step 2: Encrypt the binary**

```bash
poetry run ./yaptide/admin/simulators.py encrypt \
  --infile ./build/shieldhit \
  --outfile ./build/shieldhit.encrypted \
  --password my-secure-password \
  --salt my-salt-value
```

**Step 3: Upload encrypted binary to S3**

```bash
poetry run ./yaptide/admin/simulators.py upload \
  --bucket yaptide-simulators \
  --file ./build/shieldhit.encrypted \
  --endpoint s3.mycompany.com \
  --access-key AKIAIOSFODNN7EXAMPLE \
  --secret-key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

### Uploading a New FLUKA Version

**Step 1: Compile FLUKA and create archive**

```bash
tar -czf fluka_v2024.tar.gz fluka/
```

**Step 2: Encrypt the archive**

```bash
poetry run ./yaptide/admin/simulators.py encrypt \
  --infile fluka_v2024.tar.gz \
  --outfile fluka_v2024.tar.gz.encrypted \
  --password my-secure-password \
  --salt my-salt-value
```

**Step 3: Upload to S3**

```bash
poetry run ./yaptide/admin/simulators.py upload \
  --bucket yaptide-simulators-fluka \
  --file fluka_v2024.tar.gz.encrypted \
  --endpoint s3.mycompany.com \
  --access-key AKIAIOSFODNN7EXAMPLE \
  --secret-key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
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

!!! note "Empty .env in Development"
    During local development, you can leave these variables unset. The system will automatically use demo SHIELD-HIT12A version from shieldhit.org.

## Troubleshooting

### Demo Version Download Fails

If you see "SHIELD-HIT12A download failed", the demo version download from shieldhit.org failed:

1. Check internet connectivity
2. Verify that [shieldhit.org](https://shieldhit.org) is accessible
3. The demo version URL might have changed - check the code in `simulator_storage.py`

### S3 Connection Error

```
No credentials found. Check your access key and secret key.
```

**Solution**: Verify `.env` file contains correct S3 credentials.

### Decryption Failed

```
Decryption failed - invalid token (password+salt)
```

**Solutions**:
- Verify password and salt are correct
- Ensure the file was encrypted with the same password/salt
- Ensure the file is not corrupted

### S3 Bucket Not Found

```
Problem accessing bucket named: my-bucket
```

**Solutions**:
- Verify bucket exists on S3
- Verify S3_ENDPOINT is correct
- Verify credentials have permissions to access the bucket

## See Also

- [Using Docker](using_docker.md) - Deployment instructions
- [For Developers](for_developers.md) - Local development setup
- YAPTIDE GitHub: [yaptide/yaptide](https://github.com/yaptide/yaptide)
