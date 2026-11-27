---
title: Data Flow
description: End-to-end flow of a simulation through the YAPTIDE system.
---

This page traces the lifecycle of a simulation from geometry creation to result visualization, covering all three execution paths.

## High-Level Flow

```
User creates geometry  →  Editor JSON  →  Converter  →  Simulator input files
                                                               │
                           ┌───────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         Direct        Batch         Local
         (Celery)      (Slurm/SSH)   (Geant4 Wasm)
              │            │            │
              ▼            ▼            ▼
         Simulator runs on their respective platforms
              │            │            │
              └────────────┼────────────┘
                           │
                           ▼
                    Results stored/returned
                           │
                           ▼
                    UI renders plots (JSRoot)
```

## Step 1: Scene Construction

The user works in the **3D Editor** (Three.js viewport) to build a simulation scene:

1. **Add figures** — boxes, cylinders, spheres with position, rotation, and dimensions.
2. **Define zones** — boolean operations (union, intersection, subtraction) on figures. Each zone is assigned a material.
3. **Configure beam** — particle type, energy, position, direction, sigma, divergence.
4. **Set up detectors** — scoring geometries (cylindrical, mesh, zone-based, or global).
5. **Define outputs** — which quantities to score (dose, fluence, LET), with optional particle filters.
6. **Physics settings** — energy loss model, nuclear reactions, multiple scattering.

The editor continuously serializes this scene into the **editor JSON** format. This JSON is auto-saved to `localStorage`.

## Step 2: Format Conversion

Before a simulation can run, the editor JSON must be converted to the target simulator's native input format.

**Server-side** (Direct and Batch paths):
```python
from converter.api import get_parser_from_str, run_parser

parser = get_parser_from_str("shieldhit")  # or "fluka", "geant4", "topas"
files_dict = run_parser(parser, json_data, output_dir=Path("./out"))
# files_dict = {"beam.dat": "...", "mat.dat": "...", "geo.dat": "...", "detect.dat": "..."}
```

**Client-side** (input file preview and Geant4 Wasm path):
The same converter runs in the browser via **Pyodide** (Python compiled to WebAssembly). The Pyodide Web Worker calls `converter.api.run_parser` and returns the generated files to the UI thread via `comlink`.

## Step 3a: Direct Execution (Celery)

Used for SHIELD-HIT12A and FLUKA when running on the backend server.

```
POST /jobs/direct
  body: { sim_data, ntasks, sim_type: "shieldhit" }
```

1. Flask creates a `CelerySimulationModel` row and N `CeleryTaskModel` rows.
2. A **Celery chord** is dispatched: N `run_single_simulation` tasks execute in parallel.
3. Each task:
   - Writes input files to a temp directory
   - Spawns the simulator binary as a subprocess
   - Monitors progress via a background thread reading stdout/logfiles
   - POSTs status updates to `POST /tasks` (primaries completed, estimated time)
4. When all N tasks complete, a **merge task** (`get_job_results`) runs:
   - Averages estimator results across all tasks
   - POSTs them to `POST /results`, which writes each page to the results bucket as a Zarr array and records it in
     the database (`EstimatorModel` → `PageModel` → `PageObjectModel`)
5. Job state transitions: `PENDING → RUNNING → MERGING_QUEUED → MERGING_RUNNING → COMPLETED`

**Polling**: The UI polls `GET /jobs/direct?job_id=<id>` at intervals to check status and fetch partial progress.

## Step 3b: Batch Execution (Slurm via SSH)

Used for SHIELD-HIT12A and FLUKA on HPC clusters (e.g., PLGrid).

```
POST /jobs/batch
  body: { sim_data, ntasks, sim_type: "shieldhit", batch_options: { cluster_name: "ares" } }
```

1. Flask creates a `BatchSimulationModel` row.
2. The **helper worker** picks up a `submit_job` Celery task and:
   - Connects to the cluster via SSH using the user's PLGrid certificate (stored in `KeycloakUserModel`)
   - Uploads input files as a compressed archive
   - Uploads watcher and data-sender scripts
   - Submits a **Slurm array job** (`sbatch`) + a collect job
3. The cluster's **watcher script** monitors each array task and POSTs progress back to the YAPTIDE backend.
4. When all array tasks finish, the **collect job** gathers results and POSTs them to `POST /results`, which stores
   them as for direct execution.

**Polling**: The UI polls `GET /jobs/batch?job_id=<id>`. The backend also checks cluster status via `sacct` over SSH.

## Step 3c: Local Execution (Geant4 Wasm)

Used for Geant4 simulations. Runs entirely in the browser — no backend required.

1. The Pyodide converter generates `geometry.gdml` and `run.mac`.
2. These files are passed to the **Geant4 Wasm Worker**.
3. Geant4 executes the simulation in WebAssembly.
4. Output files are parsed by `Geant4ResultsFileParser`.
5. Results are rendered directly — no server round-trip.

:::note
  This path works in **demo mode** (`REACT_APP_TARGET=demo`), making it possible to run Geant4 simulations without any backend or authentication.
:::

## Step 4: Result Visualization

Regardless of the execution path, results follow the same structure:

- **Estimators** — named result containers (e.g., `detector_dose`, `mesh_fluence`)
- **Pages** — individual scoring dimensions within an estimator (e.g., energy bins, spatial slices)

Each page is a Zarr v3 array in the results bucket: its values (float32) in one shard, and its axes, unit and
metadata as attributes of its `zarr.json`. The database keeps the page's `page_name`, `page_dimension` and where it is
stored (`PageObjectModel`).

`GET /results` answers with **signed links** to each page's objects, never with the values. The browser fetches them
from nginx (`/yaptide-results/`), which passes them to the bucket; result data does not go through Flask. See
[Result Storage](/for_developers/backend/result-storage/) and
[Results Loading](/for_developers/frontend/results-loading/).

The UI renders results using **JSRoot** (CERN ROOT's JavaScript library):
- 1D histograms (e.g., Bragg peak depth-dose curves)
- 2D color maps (e.g., spatial dose distributions)
- Interactive zoom, pan, and cursor readout
- CSV export

## Data Persistence

Simulation data is stored in PostgreSQL with gzip compression, except the result pages, which are kept in the S3
bucket.

| Data | Storage |
|---|---|
| Input files (JSON or raw) | `InputModel.compressed_data` |
| Estimator metadata | `EstimatorModel` (name, filename) |
| Result pages | Zarr arrays in the results bucket; `PageModel` + `PageObjectModel` (key, size, format) |
| Simulation logs | `LogfilesModel.compressed_data` |
| Job state and metadata | `SimulationModel` + `TaskModel` |

:::note
  The model names above refer to SQLAlchemy models defined in [`yaptide/persistence/models.py`](https://github.com/yaptide/yaptide/blob/master/yaptide/persistence/models.py).
:::
