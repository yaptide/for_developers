---
title: Results Endpoints
description: Simulation results, estimators, inputs, and log file retrieval.
---

## Get Results

Retrieve simulation results with optional filtering by estimator and page. Each page comes as **signed links** to
its objects in the results bucket, not as its values: the browser fetches them through nginx
(`/yaptide-results/...`), see [Result Storage](/for_developers/backend/result-storage/).

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
                    "dimensions": 1,
                    "format": "zarr-v3",
                    "url": "https://<backend>/yaptide-results/simulations/17/z_profile_/1/3f2a9c0d1e4b5a67/zarr.json?X-Amz-...",
                    "files": {
                        "zarr.json": "https://<backend>/yaptide-results/simulations/17/z_profile_/1/3f2a9c0d1e4b5a67/zarr.json?X-Amz-...",
                        "c/0": "https://<backend>/yaptide-results/simulations/17/z_profile_/1/3f2a9c0d1e4b5a67/c/0?X-Amz-..."
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

**A stored page:**

| Field | Description |
|---|---|
| `page_number`, `name`, `dimensions` | The page, as kept in the database |
| `format` | `zarr-v3`: a Zarr v3 array of float32 values in one shard |
| `files` | Signed link for each object: `zarr.json` (metadata; its `attributes.yaptide_page` is the page as the JSON pages had it, without the values) and `c/0` (the shard) |
| `url` | The link of `zarr.json` |

The links last 15 minutes; ask `/results` again for new ones. A page without values has no shard, and its `c/0` link
answers 404, which a Zarr reader takes as the fill value. A page stored before the results bucket and not yet moved
there (`db_manage copy-pages-to-storage`) still comes as the page itself, with `data.values`.

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

**Worker-facing only.** The merge of a direct simulation and the collect job of a batch simulation call this with
the merged results. Each page comes with its values; the backend writes it to the results bucket as a Zarr array and
keeps where it is in the database. Pages stored before for the same estimator and page are replaced, and their objects
removed. Answers `202` when stored, `500` when the bucket did not take the pages (nothing is kept then).

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
