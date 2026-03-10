---
title: Simulation Lifecycle
description: Job and task state machines for YAPTIDE simulations.
---

Every simulation goes through a defined state machine. This page documents the states, transitions, and the differences between direct (Celery) and batch (Slurm) execution paths.

## Job States

```
UNKNOWN ─────> PENDING ─────> RUNNING ─────> MERGING_QUEUED ─────> MERGING_RUNNING ─────> COMPLETED
                  │              │                                                           │
                  │              │                                                           │
                  └──────────────┴───────────────────────────────────────────────────────> FAILED
                  │              │
                  └──────────────┴───────────────────────────────────────────────────────> CANCELED
```

| State | Description |
|---|---|
| `UNKNOWN` | Initial state, before any processing |
| `PENDING` | Job accepted, tasks being created |
| `RUNNING` | At least one task is actively simulating |
| `MERGING_QUEUED` | All tasks complete, merge task is waiting in the Celery queue |
| `MERGING_RUNNING` | Merge task is actively averaging results |
| `COMPLETED` | Results stored, job finished successfully |
| `FAILED` | One or more tasks failed, or the merge failed |
| `CANCELED` | User or system canceled the job |

These states are defined in `utils/enums.py` as the `EntityState` enum.

## Task States

Each job contains N tasks (one per parallel simulation run). Tasks have their own state:

| State | Description |
|---|---|
| `PENDING` | Task created, waiting for a worker |
| `RUNNING` | Simulator binary is executing |
| `COMPLETED` | Simulation finished, output available |
| `FAILED` | Simulator crashed or timed out |
| `CANCELED` | Task was revoked |

## Direct Execution (Celery)

### Submission

```python
POST /jobs/direct
  → Create CelerySimulationModel (state: PENDING)
  → Create N CeleryTaskModel rows (state: PENDING)
  → Convert editor JSON → simulator input files
  → Dispatch Celery chord:
      group(run_single_simulation × N) | get_job_results
```

### Task Execution

Each `run_single_simulation` task:

1. Receives input files and a task index
2. Creates a temporary directory
3. Writes input files
4. Spawns the simulator binary (`shieldhit`, `fluka_sim`) as a subprocess
5. Starts a **monitoring thread** that reads stdout/logfiles for progress
6. Periodically POSTs progress to `POST /tasks`:
   ```json
   {
     "task_id": 0,
     "simulated_primaries": 5000,
     "requested_primaries": 10000,
     "estimated_time": 42
   }
   ```
7. On completion, returns the output files (estimator data)

### Merge Step

When all N tasks complete, the `get_job_results` **callback task** runs:

1. Collects estimator data from all N tasks
2. **Averages** the results (weighted by primaries per task)
3. Compresses and stores: `EstimatorModel` → `PageModel`
4. Updates job state to `COMPLETED`

If any task fails, the merge is skipped and the job state is set to `FAILED`.

### Cancellation

```python
DELETE /jobs/direct?job_id=<id>
  → Revoke all Celery tasks (terminate=True)
  → Set job state to CANCELED
```

### Task Time Limit

Simulation tasks have a **10-hour hard time limit** (configured in the Celery worker). Tasks exceeding this are killed.

## Batch Execution (Slurm via SSH)

### Submission

```python
POST /jobs/batch
  → Create BatchSimulationModel (state: PENDING)
  → Dispatch helper_worker.submit_job task
```

The `submit_job` task on the helper worker:

1. Connects to the HPC cluster via **SSH** (using Fabric and the user's PLGrid SSH certificate from `KeycloakUserModel`)
2. Creates a remote working directory
3. Uploads:
   - Compressed simulation input files
   - A **watcher script** (monitors each array task)
   - A **data-sender script** (POSTs results back to YAPTIDE)
4. Submits a **Slurm array job**:
   ```bash
   sbatch --array=0-N-1 run_simulation.sh
   ```
5. Submits a **collect job** (depends on the array job):
   ```bash
   sbatch --dependency=afterok:<array_id> collect_results.sh
   ```
6. Stores the array and collect Slurm job IDs in `BatchSimulationModel`

### Progress Monitoring

The **watcher script** on the cluster:
- Runs alongside each array task
- Monitors simulator output (logfiles, stdout)
- POSTs progress updates to the YAPTIDE backend:
  ```
  POST /tasks
  Authorization: Bearer <simulation_update_key>
  ```

### Status Polling

When the frontend polls `GET /jobs/batch?job_id=<id>`, the backend:
1. Returns cached task states from the database
2. Optionally queries `sacct` on the cluster via SSH to update Slurm job status

### Result Collection

The **collect job** on the cluster:
1. Runs after all array tasks complete
2. Gathers output files from each task directory
3. Averages/merges results
4. POSTs the final results to `POST /results`
5. The backend stores them as `EstimatorModel` → `PageModel`

### Cancellation

```python
DELETE /jobs/batch?job_id=<id>
  → SSH to cluster
  → scancel <array_id> <collect_id>
  → Set job state to CANCELED
```

## Worker Communication

Both execution paths use **HTTP callbacks** for workers to report state back to Flask:

| Endpoint | Who Calls It | Purpose |
|---|---|---|
| `POST /tasks` | Simulation worker / cluster watcher | Update task progress (primaries, estimated time) |
| `POST /results` | Merge task / collect job | Store final results |
| `POST /jobs` | Helper worker | Update job-level state |

These internal endpoints are authenticated with a **simulation update key** — a 7-day JWT generated at job submission and stored (hashed) in the `SimulationModel`.

## Polling Pattern

The frontend polls for job status using this pattern:

```
1. POST /jobs/direct → { job_id }
2. Loop:
   GET /jobs/direct?job_id=<id>
   → If RUNNING: show progress bars (primaries/estimated_time per task)
   → If COMPLETED: GET /results?job_id=<id> → render plots
   → If FAILED: show error
   → If CANCELED: show cancellation notice
   Wait 2–5 seconds, repeat
```

The polling interval increases as the simulation runs longer to reduce server load.
