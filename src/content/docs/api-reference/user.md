---
title: User Endpoints
description: User profile management and cluster access API.
---

## List Simulations

Get a paginated list of the authenticated user's simulations.

```http
GET /user/simulations?page_size=10&page_idx=1
Cookie: access_token=<jwt>
```

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page_size` | integer | 6 | Number of simulations per page |
| `page_idx` | integer | 1 | Page number (1-indexed) |
| `order_by` | string | `start_time` | Sort field: `start_time` or `end_time` |
| `order_type` | string | `descend` | Sort order: `ascend` or `descend` |
| `job_state` | string | — | Filter by state(s), comma-separated: `COMPLETED,FAILED` |

**Response** `200 OK`

```json
{
    "message": "User simulations",
    "simulations": [
        {
            "job_id": "abc123-def456",
            "title": "Water phantom dose",
            "start_time": "2024-01-15T10:00:00Z",
            "end_time": "2024-01-15T10:05:23Z",
            "job_state": "COMPLETED",
            "sim_type": "shieldhit",
            "input_type": "editor",
            "platform": "direct",
            "ntasks": 10
        },
        {
            "job_id": "batch-789xyz",
            "title": "Carbon beam spread",
            "start_time": "2024-01-14T14:00:00Z",
            "end_time": "2024-01-14T15:30:00Z",
            "job_state": "COMPLETED",
            "sim_type": "shieldhit",
            "input_type": "editor",
            "platform": "batch",
            "ntasks": 100
        }
    ],
    "page_count": 5,
    "simulations_count": 47
}
```

**Filtering by state:**

```http
GET /user/simulations?job_state=COMPLETED,FAILED
```

Returns only simulations in the specified states.

---

## Delete Simulation

Remove a simulation and all its associated data (results, logfiles, inputs) from the database. The simulation must be in a terminal state (`COMPLETED`, `FAILED`, or `CANCELED`).

```http
DELETE /user/simulations?job_id=abc123-def456
Cookie: access_token=<jwt>
```

**Response** `200 OK`

```json
{
    "message": "Simulation deleted"
}
```

**Errors:**
- `400` — Missing `job_id`
- `403` — Simulation belongs to another user
- `404` — Simulation not found
- `409` — Simulation is still running (cannot delete)

---

## Update User

Update the authenticated user's profile information.

```http
POST /user/update
Cookie: access_token=<jwt>
Content-Type: application/json

{
    "field": "value"
}
```

**Response** `200 OK`

```json
{
    "message": "User updated"
}
```

---

## List Clusters

List available HPC clusters for batch job submission. **Requires Keycloak authentication** (PLGrid access).

```http
GET /clusters
Cookie: access_token=<jwt>
```

**Response** `200 OK`

```json
{
    "message": "Available clusters",
    "clusters": [
        {
            "cluster_name": "prometheus",
            "display_name": "Prometheus (Cyfronet)",
            "available": true
        }
    ]
}
```

**Errors:**
- `403` — Not a Keycloak-authenticated user (local users cannot access HPC clusters)
