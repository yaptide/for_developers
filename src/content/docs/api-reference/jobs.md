---
title: Jobs Endpoints
description: Simulation submission, monitoring, and cancellation API.
---

YAPTIDE supports two execution backends: **direct** (Celery workers on the server) and **batch** (SLURM on HPC clusters). Both share the same request format.

## Submit Direct Job

Run a simulation using local Celery workers.

```http
POST /jobs/direct
Cookie: access_token=<jwt>
Content-Type: application/json

{
    "sim_type": "shieldhit",
    "ntasks": 10,
    "input_type": "editor",
    "sim_data": { ... }
}
```

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `sim_type` | string | Yes | Simulator: `shieldhit`, `fluka`, `geant4`, `topas` |
| `ntasks` | integer | Yes | Number of parallel tasks (splits primaries) |
| `input_type` | string | Yes | `"editor"` (project JSON) or `"files"` (raw input files) |
| `sim_data` | object | Yes | Project JSON (when `input_type` is `"editor"`) |

**Response** `202 Accepted`

```json
{
    "message": "Job submitted",
    "job_id": "abc123-def456"
}
```

**Errors:**
- `400` — Missing required fields or invalid sim_type
- `500` — Conversion or task dispatch failed

---

## Get Direct Job Status

```http
GET /jobs/direct?job_id=abc123-def456
Cookie: access_token=<jwt>
```

**Response** `200 OK`

```json
{
    "message": "Job status",
    "job_state": "RUNNING",
    "job_tasks_status": [
        {"task_id": 1, "task_state": "COMPLETED", "simulated_primaries": 1000, "requested_primaries": 1000},
        {"task_id": 2, "task_state": "RUNNING", "simulated_primaries": 500, "requested_primaries": 1000}
    ]
}
```

**Job states:**

| State | Description |
|---|---|
| `UNKNOWN` | Job not found or not yet initialized |
| `PENDING` | Submitted, waiting for a worker |
| `RUNNING` | At least one task is executing |
| `MERGING_QUEUED` | All tasks done, waiting for result merge |
| `MERGING_RUNNING` | Results being merged |
| `COMPLETED` | All tasks finished successfully |
| `FAILED` | One or more tasks failed |
| `CANCELED` | Job was manually cancelled |

---

## Cancel Direct Job

```http
DELETE /jobs/direct?job_id=abc123-def456
Cookie: access_token=<jwt>
```

**Response** `200 OK`

```json
{
    "message": "Job cancelled"
}
```

Revokes all pending Celery tasks and terminates running ones.

---

## Submit Batch Job

Submit a simulation to an HPC cluster via SLURM. **Requires Keycloak authentication.**

```http
POST /jobs/batch
Cookie: access_token=<jwt>
Content-Type: application/json

{
    "sim_type": "shieldhit",
    "ntasks": 100,
    "input_type": "editor",
    "sim_data": { ... },
    "batch_options": {
        "cluster_name": "prometheus",
        "slurm_options": {
            "time": "01:00:00",
            "partition": "plgrid"
        }
    }
}
```

**Additional parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `batch_options` | object | No | SLURM cluster selection and resource options |
| `batch_options.cluster_name` | string | No | Target cluster name |
| `batch_options.slurm_options` | object | No | Custom SLURM headers (time, partition, etc.) |

**Response** `202 Accepted`

```json
{
    "message": "Batch job submitted",
    "job_id": "batch-789xyz"
}
```

**Errors:**
- `403` — Not a Keycloak-authenticated user
- `500` — SSH connection or SLURM submission failed

---

## Get Batch Job Status

```http
GET /jobs/batch?job_id=batch-789xyz
Cookie: access_token=<jwt>
```

Response format is identical to direct job status.

---

## Cancel Batch Job

```http
DELETE /jobs/batch?job_id=batch-789xyz
Cookie: access_token=<jwt>
```

Sends a SLURM `scancel` command to the cluster.

---

## Get Job Status (Database)

Platform-agnostic endpoint that reads job status from the database (works for both direct and batch).

```http
GET /jobs?job_id=abc123-def456
Cookie: access_token=<jwt>
```

**Response** `200 OK`

```json
{
    "message": "Job status",
    "job_state": "COMPLETED",
    "job_tasks_status": [
        {"task_id": 1, "task_state": "COMPLETED"},
        {"task_id": 2, "task_state": "COMPLETED"}
    ]
}
```

> **Tip:** Use `GET /jobs/direct` or `GET /jobs/batch` during active simulation for real-time status. Use `GET /jobs` for historical lookups from the database.

---

## Internal: Update Job State

**Worker-facing only.** Called by Celery workers and batch helpers to report status changes.

```http
POST /jobs
Content-Type: application/json

{
    "sim_id": "abc123-def456",
    "update_key": "<shared-secret>",
    "job_state": "RUNNING"
}
```

This endpoint is not user-facing — it uses `update_key` authentication instead of JWT cookies.
