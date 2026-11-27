---
title: Simulation Services
description: How the frontend submits and tracks simulations.
---

The UI communicates with two types of simulation backends — a **remote Flask server** (for SHIELD-HIT12A and FLUKA) and a **local Geant4 Wasm runtime** (in-browser). Both implement the same `SimulationService` interface.

## SimulationService Interface

Both services expose the same contract to the UI:

```typescript
interface SimulationService {
  submitSimulation(config: SimulationConfig): Promise<string>;  // returns job_id
  getStatus(jobId: string): Promise<JobStatus>;
  getResults(jobId: string): Promise<SimulationResults>;
  cancelSimulation(jobId: string): Promise<void>;
}
```

This abstraction lets the UI treat remote and local simulations identically.

## Remote Simulation Service

`services/RemoteWorkerSimulationService.ts` (~745 lines) handles SHIELD-HIT12A and FLUKA simulations on the backend server.

### HTTP Client

Uses `ky` (a fetch wrapper) with:
- **Base URL**: `backendUrl` from `ConfigProvider` (default: `http://localhost:5000`)
- **Credentials**: `include` (sends httpOnly cookies)
- **Response transform**: automatic `snake_case` → `camelCase` conversion

### Submission Flow

```
1. User clicks "Run Simulation" in the editor
2. UI serializes the editor state to JSON
3. POST /jobs/direct:
   {
     sim_data: <editor JSON>,
     ntasks: <user-configured>,
     sim_type: "shieldhit",
     input_type: "editor"
   }
4. Backend returns { job_id }
5. UI starts polling
```

### Polling Loop

The Simulations tab polls the status of every simulation on the current page (`SimulationsGridHelpers.ts`):

- Every **1.5 s** while any simulation is unfinished, every **10 s** once all have settled.
- A hidden browser tab does not poll. The next tick after the tab is shown again catches up.
- A status is requested with `GET /jobs/direct?job_id=…` or `GET /jobs/batch?job_id=…`.

Progress and the "primaries" and "ntask" chips on the simulation card come from `taskTotals(status)` (`src/util/taskTotals.ts`). It reads the server's `jobTasksSummary` (number of tasks, tasks per state, requested and simulated primaries) when the status has one, and otherwise sums the task list `jobTasksStatus`. Simulations run in the browser (Geant4) only have the task list. Read task progress through `taskTotals()`, never from `jobTasksStatus` directly, because a status may carry only the summary.

When the simulation the user just started completes, its results open once. A finished run is remembered, so reopening the Simulations tab does not jump back to its results.

When the editor is connected to the backend, `useUpdateCurrentSimulationEffect` looks for the completed simulation whose input hash equals the editor's, or the hash of the input the editor was loaded from (kept until the first edit, because serializing a loaded editor again can give another hash). It attaches that simulation's results to the editor, where the Save dialog can include them. A failed request skips that simulation, and an older search that ends late does not overwrite a newer one.

### Matching results to editor outputs

The results of each estimator are linked to the scoring output in the editor that produced them (`recreateRefsInResults` in `RemoteWorkerSimulationService.ts`). The backend sends each estimator's `output_uuid` with the results, and the UI matches it to `scoringManager.outputs[].uuid`. Results without it, such as simulations stored before the backend sent it, are matched by output name. An estimator that matches no output gets no reference and is logged as an error.

### Result Caching

The service caches results for completed and failed jobs. If a user revisits a completed simulation, results are served from the cache without hitting the backend.

### Batch Submissions

For HPC cluster simulations (PLGrid), the service uses `POST /jobs/batch` with additional options:

```typescript
{
  sim_data: <editor JSON>,
  ntasks: 100,
  sim_type: "shieldhit",
  batch_options: {
    cluster_name: "ares",
    array_options: "--time=01:00:00 --mem=4G",
    collect_options: "--time=00:30:00"
  }
}
```

Batch submissions require Keycloak authentication (PLGrid credentials).

## Local Simulation Service (Geant4 Wasm)

`services/Geant4LocalWorkerSimulationService.ts` runs Geant4 simulations entirely in the browser.

### Execution Flow

```
1. Editor JSON
      │
      ▼
2. Pyodide Converter (Web Worker)
   → geometry.gdml + run.mac
      │
      ▼
3. Geant4 Wasm Worker
   → Executes simulation
   → Produces output files
      │
      ▼
4. Geant4ResultsFileParser
   → Parses output into estimators/pages
      │
      ▼
5. UI renders results (JSRoot)
```

No server communication occurs. This path works in **demo mode**.

### Progress Tracking

The Geant4 Wasm worker reports progress via `postMessage`:

```typescript
// In the Wasm worker
self.postMessage({
  type: 'progress',
  data: {
    simulatedPrimaries: 5000,
    requestedPrimaries: 10000
  }
});
```

The service updates the UI's progress bars using the same interface as the remote service.

## Result Format

Both services produce results in the same format:

```typescript
interface SimulationResults {
  estimators: Estimator[];
}

interface Estimator {
  name: string;
  pages: Page[];
}

interface Page {
  pageName: string;
  pageDimension: number;
  data: {
    axes: Axis[];
    values: number[];
    errors?: number[];
  };
}
```

The remote service gets pages from the backend either inline as JSON or as signed links to Zarr arrays in object storage, and fetches 2D and 3D pages only when they are shown. See [Results Loading](/for_developers/frontend/results-loading/).

This is rendered by the JSRoot integration in `JsRoot/`:
- **1D data** (e.g., depth-dose): line plots / histograms
- **2D data** (e.g., spatial dose maps): color map / contour plots
- Interactive zoom, pan, cursor readout
- CSV export

## Simulation Panel

`WrapperApp/SimulationsPanel.tsx` shows a paginated table of all the current user's simulations:

| Column | Source |
|---|---|
| Title | Simulation title from editor |
| Status | Job state (color-coded badge) |
| Engine | `shieldhit`, `fluka`, `geant4` |
| Platform | `direct` or `batch` |
| Started | Submission timestamp |
| Actions | View results, re-run, delete |

The panel fetches data from `GET /user/simulations` with pagination.
