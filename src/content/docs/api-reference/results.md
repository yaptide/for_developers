---
title: Results Endpoints
description: Simulation results, estimators, inputs, and log file retrieval.
---

## Get Results

Retrieve simulation results with optional filtering by estimator and page.

```http
GET /results?job_id=abc123-def456
Cookie: access_token=<jwt>
```

**Query parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `job_id` | string | Yes | Simulation job ID |
| `estimator_name` | string | No | Filter by specific estimator name |
| `page_number` | integer | No | Single page number |
| `page_numbers` | string | No | Page range, e.g. `"1-3,5"` |

### Get All Results

```http
GET /results?job_id=abc123-def456
```

**Response** `200 OK`

```json
{
    "message": "Results",
    "estimators": [
        {
            "name": "Detector0",
            "pages": [
                {
                    "page_number": 1,
                    "name": "Z (Dose)",
                    "data": {
                        "values": [0.0, 0.001, 0.015, ...],
                        "dimensions": [[0.0, 0.5, 1.0, ...]],
                        "unit": "Gy"
                    }
                }
            ]
        }
    ]
}
```

### Filter by Estimator

```http
GET /results?job_id=abc123-def456&estimator_name=Detector0
```

Returns only pages for the named estimator.

### Filter by Page

```http
GET /results?job_id=abc123-def456&page_numbers=1-3,5
```

Returns only the specified pages across all estimators.

> **Note:** Result data is stored compressed (zlib) in the database. The API decompresses transparently.

---

## Get Estimator Metadata

Lightweight endpoint that returns estimator names and page metadata **without** the full data arrays.

```http
GET /estimators?job_id=abc123-def456
Cookie: access_token=<jwt>
```

**Response** `200 OK`

```json
{
    "message": "Estimators",
    "estimators": [
        {
            "name": "Detector0",
            "pages": [
                {
                    "page_number": 1,
                    "name": "Z (Dose)",
                    "dimensions": [400]
                },
                {
                    "page_number": 2,
                    "name": "Z (Fluence)",
                    "dimensions": [400]
                }
            ]
        }
    ]
}
```

Use this endpoint to build a results selector UI before fetching the full data.

---

## Get Inputs

Retrieve the input configuration that was used for a simulation.

```http
GET /inputs?job_id=abc123-def456
Cookie: access_token=<jwt>
```

**Response** `200 OK`

The response format depends on the `input_type` used during submission:

### Editor Input

```json
{
    "message": "Inputs",
    "input_type": "editor",
    "input": {
        "project": { ... },
        "beam": { ... },
        "figureManager": { ... }
    }
}
```

### File Input

```json
{
    "message": "Inputs",
    "input_type": "files",
    "input": {
        "beam.dat": "...",
        "geo.dat": "...",
        "mat.dat": "...",
        "detect.dat": "..."
    }
}
```

---

## Get Log Files

Retrieve simulation log files (stdout/stderr from the simulator process).

```http
GET /logfiles?job_id=abc123-def456
Cookie: access_token=<jwt>
```

**Response** `200 OK`

```json
{
    "message": "Logfiles",
    "logfiles": {
        "task_1": "SHIELD-HIT12A version 1.0.0\nStarting simulation...\n...",
        "task_2": "..."
    }
}
```

Log files are useful for debugging failed simulations — they contain the simulator's own error messages.

---

## Internal: Upload Results

**Worker-facing only.** Simulation workers call this to save results to the database.

```http
POST /results
Content-Type: application/json

{
    "simulation_id": "abc123-def456",
    "update_key": "<shared-secret>",
    "estimators": [
        {
            "name": "Detector0",
            "pages": [
                {
                    "page_number": 1,
                    "name": "Z (Dose)",
                    "data": { ... }
                }
            ]
        }
    ]
}
```

---

## Internal: Upload Log Files

**Worker-facing only.**

```http
POST /logfiles
Content-Type: application/json

{
    "simulation_id": "abc123-def456",
    "update_key": "<shared-secret>",
    "logfiles": {
        "stdout": "...",
        "stderr": "..."
    }
}
```

---

## Internal: Update Task State

**Worker-facing only.** Updates the state of an individual simulation task.

```http
POST /tasks
Content-Type: application/json

{
    "simulation_id": "abc123-def456",
    "task_id": 1,
    "update_key": "<shared-secret>",
    "update_dict": {
        "task_state": "COMPLETED",
        "simulated_primaries": 1000,
        "requested_primaries": 1000
    }
}
```
