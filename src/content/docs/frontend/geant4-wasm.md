---
title: Geant4 WebAssembly
description: Running Geant4 simulations in the browser via WebAssembly.
---

YAPTIDE supports running **Geant4 simulations entirely in the browser** using a WebAssembly build of the Geant4 toolkit. This enables simulation execution without any backend infrastructure.

## Architecture

```
┌───────────────────────────────────────────────────┐
│                    Browser                        │
│                                                   │
│  ┌──────────┐    ┌────────────┐    ┌────────────┐ │
│  │ Editor   │ →  │ Pyodide    │ →  │ Geant4     │ │
│  │ JSON     │    │ Converter  │    │ Wasm Worker│ │
│  │          │    │            │    │            │ │
│  │          │    │ .gdml +    │    │ Executes   │ │
│  │          │    │ .mac files │    │ simulation │ │
│  └──────────┘    └────────────┘    └─────┬──────┘ │
│                                          │        │
│                                    ┌─────▼──────┐ │
│                                    │ Results    │ │
│                                    │ Parser     │ │
│                                    │            │ │
│                                    │ JSRoot     │ │
│                                    │ Plots      │ │
│                                    └────────────┘ │
└───────────────────────────────────────────────────┘
```

## Execution Flow

### 1. Input Generation

The Pyodide converter generates Geant4-native input files from the editor JSON:

- **`geometry.gdml`** — GDML XML describing the simulation geometry (solids, volumes, placements)
- **`run.mac`** — Geant4 macro with particle source commands (`/gps/...`), scoring mesh definitions (`/score/...`), and run commands (`/run/beamOn`)

### 2. Geant4 Wasm Worker

`Geant4Worker/` contains the Web Worker that loads and runs the Geant4 Wasm binary:

```typescript
// Simplified worker flow
self.onmessage = async (event) => {
  const { gdml, macro } = event.data;

  // Load Geant4 Wasm
  const geant4 = await loadGeant4Wasm();

  // Write input files to the virtual filesystem
  geant4.FS.writeFile('/geometry.gdml', gdml);
  geant4.FS.writeFile('/run.mac', macro);

  // Execute
  geant4.run(['/run.mac']);

  // Read output files from the virtual filesystem
  const outputFiles = readOutputFiles(geant4.FS);

  // Post results back to main thread
  self.postMessage({ type: 'results', data: outputFiles });
};
```

### 3. Dataset Download

Geant4 requires physics **datasets** (cross-section tables, etc.) to run simulations. These are downloaded on first use:

1. The UI detects that Geant4 datasets are needed
2. `Geant4DatasetContextProvider` triggers the download
3. Datasets are downloaded from a CDN and cached in the browser's IndexedDB
4. Subsequent runs skip the download

:::caution
The dataset download can be several hundred MB. Users are informed of the progress and can cancel.
:::

### 4. Progress Reporting

The Wasm worker reports progress back to the main thread:

```typescript
// In the worker
geant4.onProgress = (simulated, total) => {
  self.postMessage({
    type: 'progress',
    data: { simulatedPrimaries: simulated, requestedPrimaries: total }
  });
};
```

The `Geant4LocalWorkerSimulationService` translates these into the same status format as the remote service, so the UI renders progress bars identically.

### 5. Result Parsing

Output files from the Geant4 run are parsed by `Geant4ResultsFileParser`:

- Reads scorer output files from the Wasm virtual filesystem
- Converts them into the standard `Estimator` → `Page` structure
- Results are passed directly to JSRoot for rendering

## Demo Mode

When `REACT_APP_TARGET=demo`, the UI runs in demo mode:

- Authentication is disabled
- Backend communication is disabled
- **Only Geant4 Wasm simulations are available**
- No job persistence (results exist only in the browser session)

This is the default mode for `npm run dev` and for the public demo deployment.

## Supported Features

### Geometry

The converter generates GDML with:
- Standard solids: `box`, `tube` (cylinder), `sphere`
- Nested volume hierarchy (recursive placement)
- Material assignments from the ICRU material database

### Scoring

The macro generator creates:
- `/score/create/` mesh scorers
- Dose, fluence, and other quantity scoring
- Beam definition via `/gps/` commands

### Limitations

- **Performance**: WebAssembly runs single-threaded and is slower than native Geant4. Complex simulations with many primaries may take several minutes.
- **Memory**: Large geometries or high-resolution scoring meshes may exhaust browser memory (typically ~2–4 GB limit).
- **Physics models**: The Wasm build may not include all Geant4 physics lists. Check the specific build for available models.

## Webpack Configuration

The Webpack overrides in `config-overrides.js` handle Geant4 Wasm files:

```javascript
// Ignore the .wasm file from normal bundling
config.module.rules.push({
  test: /geant4_wasm\.wasm$/,
  type: 'asset/resource'
});

// Ignore node:worker_threads (not available in browser)
config.resolve.fallback = {
  ...config.resolve.fallback,
  'worker_threads': false
};
```

## Troubleshooting

**Geant4 datasets not downloading:**
Check the browser console for network errors. The CDN URL must be accessible. Verify IndexedDB storage quota isn't exhausted.

**Simulation crashes:**
Check the browser console for Wasm memory errors. Reduce the number of primaries or simplify the geometry. The Wasm runtime has a hard memory limit.

**Slow performance:**
Geant4 Wasm is single-threaded. For large simulations, use the remote backend with SHIELD-HIT12A or FLUKA instead.
