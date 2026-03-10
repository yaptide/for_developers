---
title: API Endpoints
description: Guide to all YAPTIDE REST API endpoints.
---

All endpoints are registered in `routes/main_routes.py`. This page explains when and why each endpoint is called, grouped by domain. For the raw OpenAPI specification, see the [API Reference](/docs/api-reference/overview/).

## Authentication

### `PUT /auth/register`

**Create a new Yaptide-native user account.**

```json
// Request body
{ "username": "alice", "password": "secure123" }
```

Returns `201 Created` on success. The password is hashed with Werkzeug's PBKDF2-based hasher.

### `POST /auth/login`

**Log in with username and password.**

```json
// Request body
{ "username": "alice", "password": "secure123" }
```

On success, sets two **httpOnly cookies** (`access_token`, `refresh_token`) and returns:
```json
{ "access_exp": 1709164800 }
```

The `access_exp` timestamp tells the frontend when to auto-refresh.

### `GET /auth/refresh`

**Refresh the access token.** Requires a valid `refresh_token` cookie.

Returns a new `access_token` cookie and updated `access_exp`.

### `GET /auth/status`

**Get the current user's info.** Requires authentication.

```json
{ "username": "alice" }
```

### `DELETE /auth/logout`

**Log out.** Clears both auth cookies.

### `POST /auth/keycloak`

**Exchange a Keycloak bearer token for a local JWT session.**

The frontend sends the Keycloak access token in the `Authorization` header. The backend:
1. Validates the token against the Keycloak JWKS endpoint
2. Checks the `PLG_YAPTIDE_ACCESS` claim
3. Fetches SSH certificates from the cert-auth service
4. Creates or updates a `KeycloakUserModel`
5. Issues local JWT cookies

### `DELETE /auth/keycloak`

**Log out a Keycloak user.** Clears auth cookies.

## Jobs

### `POST /jobs/direct`

**Submit a simulation to run on the backend server (Celery).**

```json
// Request body
{
  "sim_data": { ... },          // Editor JSON or raw input files
  "ntasks": 4,                   // Number of parallel tasks
  "sim_type": "shieldhit",      // "shieldhit", "fluka", "topas"
  "input_type": "editor"        // "editor" (JSON) or "files" (raw input)
}
```

The backend:
1. Creates `CelerySimulationModel` + N `CeleryTaskModel` rows
2. Converts input (if `input_type: "editor"`) using the converter
3. Dispatches a Celery chord: N `run_single_simulation` tasks → 1 merge task

Returns:
```json
{ "job_id": "abc-123-def" }
```

### `GET /jobs/direct`

**Check the status of a direct simulation.**

```
GET /jobs/direct?job_id=abc-123-def
```

Returns job state, task progress, and metadata:
```json
{
  "job_state": "RUNNING",
  "job_tasks_status": [
    {
      "task_id": 1,
      "task_state": "RUNNING",
      "simulated_primaries": 5000,
      "requested_primaries": 10000,
      "estimated_time": 45
    }
  ]
}
```

### `DELETE /jobs/direct`

**Cancel a running direct simulation.**

```
DELETE /jobs/direct?job_id=abc-123-def
```

Revokes all Celery tasks and sets the job state to `CANCELED`.

### `POST /jobs/batch`

**Submit a simulation to an HPC cluster (Slurm via SSH).**

```json
{
  "sim_data": { ... },
  "ntasks": 100,
  "sim_type": "shieldhit",
  "batch_options": {
    "cluster_name": "ares",
    "array_options": "--time=01:00:00",
    "collect_options": "--time=00:30:00"
  }
}
```

Requires Keycloak authentication (PLGrid SSH credentials stored in the user model).

### `GET /jobs/batch`

**Check the status of a batch simulation.** Queries the cluster via `sacct` over SSH.

### `DELETE /jobs/batch`

**Cancel a batch simulation.** Runs `scancel` on the cluster.

## Results

### `GET /results`

**Retrieve simulation results (estimators + pages).**

```
GET /results?job_id=abc-123-def
```

Returns paginated estimator data with compressed page contents.

> The UI fetches results only after the job reaches `COMPLETED` state.

### `POST /results`

**Store simulation results.** Called internally by the merge task or batch collect job. Not intended for external use.

### `GET /estimators`

**List estimator metadata for a job.**

```
GET /estimators?job_id=abc-123-def
```

Returns estimator names, filenames, and page counts — without the full data.

### `GET /inputs`

**Retrieve the simulation input files.**

```
GET /inputs?job_id=abc-123-def
```

Returns the converter-generated input files (or raw uploaded files) as a JSON dict.

### `GET /logfiles`

**Retrieve simulation log files.**

```
GET /logfiles?job_id=abc-123-def
```

## User Management

### `GET /user/simulations`

**List the current user's simulations.** Supports pagination.

```
GET /user/simulations?page_size=10&page_idx=0&order_by=start_time&order_type=desc
```

### `DELETE /user/simulations`

**Delete a simulation and all associated data.**

```
DELETE /user/simulations?job_id=abc-123-def
```

## Clusters

### `GET /clusters`

**List available HPC clusters.**

Returns cluster names and metadata for batch job submission.

## Internal Endpoints

### `POST /jobs`

**Used by workers to update job-level state.** Not called by the frontend.

### `POST /tasks`

**Used by simulation workers to report task progress.** Carries: task state, simulated primaries, estimated time remaining.

These internal endpoints use a **simulation update key** (7-day JWT) for authentication, not the user's session token.
