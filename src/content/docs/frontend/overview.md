---
title: Frontend Overview
description: Architecture and structure of the YAPTIDE React + Three.js frontend.
---

The YAPTIDE frontend is a **React** single-page application that provides a 3D simulation editor, job management, and result visualization. It runs entirely in the browser, with optional in-browser Python and Geant4 runtimes.

## Tech Stack

| Component | Technology |
|---|---|
| Framework | React (TypeScript) |
| 3D engine | Three.js |
| UI kit | MUI + Emotion |
| HTTP client | `ky` (fetch wrapper) |
| Auth | Keycloak JS SDK (OIDC) |
| Python in browser | Pyodide + comlink (Web Worker) |
| Geant4 in browser | Geant4 WebAssembly (Web Worker) |
| Result rendering | JSRoot |
| Build system | Create React App + react-app-rewired |
| Testing | Jest + React Testing Library |

## Architecture

### No Redux, No Router

The frontend uses **neither Redux/Zustand nor React Router**:

- **State management**: React Context providers arranged in a deeply-nested `ServiceTree` (composition pattern). Each service exposes a custom hook.
- **Navigation**: A custom `TabPanel` system driven by string state. No URL-based routing.

### Service Tree

`App.tsx` composes the entire application:

```
ConfigProvider
  └─ ThemeProvider + SnackbarProvider
       └─ KeycloakAuth
            └─ Store (YaptideEditor instance)
                 └─ Geant4DatasetContextProvider
                      └─ DialogProvider
                           └─ Auth
                                └─ RemoteWorkerSimulationContextProvider
                                     └─ PythonConverterService
                                          └─ Geant4LocalWorkerSimulationContextProvider
                                               └─ Loader
                                                    └─ WrapperApp (the actual UI)
```

Each provider creates a React Context exposing a hook:

| Context | Hook | Purpose |
|---|---|---|
| `ConfigProvider` | `useConfig()` | Backend URL, demo mode, deployment flags |
| `Store` | `useStore()` | `YaptideEditor` instance, tracked jobs, results |
| `Auth` | `useAuth()` | Login/logout, `authKy` (authenticated HTTP client) |
| `KeycloakAuth` | `useKeycloakAuth()` | Keycloak SSO state |
| `PythonConverterService` | `usePythonConverter()` | In-browser JSON→input file conversion |
| `Loader` | `useLoader()` | Load projects from files/URLs/JSON |

### Tab Navigation

`WrapperApp.tsx` renders a tab bar with these panels:

| Tab | Component | Purpose |
|---|---|---|
| `login` | LoginPanel | Username/password or Keycloak SSO |
| `editor` | EditorPanel | 3D scene editor (main working area) |
| `examples` | ExamplesPanel | Load pre-built example simulations |
| `simulations` | SimulationsPanel | View/manage submitted jobs |
| `inputFiles` | InputFilesPanel | Inspect generated simulator input files |
| `results` | ResultsPanel | Visualize simulation results (JSRoot plots) |
| `about` | AboutPanel | Credits and version info |

## Directory Structure

```
src/
├── App.tsx                    # Service tree composition
├── config/
│   └── ConfigService.tsx      # Environment variable config
├── services/
│   ├── AuthService.tsx        # Auth context + hook
│   ├── StoreService.tsx       # Editor + job state
│   ├── LoaderService.tsx      # Project loading
│   ├── KeycloakAuthService.tsx
│   ├── RemoteWorkerSimulationContextProvider.tsx
│   └── Geant4LocalWorkerSimulationContextProvider.tsx
├── ThreeEditor/
│   ├── js/
│   │   ├── YaptideEditor.js   # Core editor class (~780 lines)
│   │   ├── EditorContext.ts   # Context switching (geometry/scoring/settings)
│   │   └── viewport/          # 4-way split viewport
│   ├── Simulation/
│   │   ├── Figures/           # BoxGeometry, SphereGeometry, etc.
│   │   ├── Zones/             # BooleanZone CSG operations
│   │   ├── Detectors/         # Scoring detector types
│   │   ├── Physics/           # Beam, physics settings
│   │   └── Materials/         # Material definitions
│   └── components/
│       └── Sidebar/           # EditorSidebar (Geometry/Scoring/Settings tabs)
├── PythonConverter/
│   ├── PythonWorker.ts        # Pyodide Web Worker
│   └── PythonConverterService.tsx  # React context wrapping the worker
├── Geant4Worker/              # Geant4 Wasm Web Worker
├── JsRoot/                    # JSRoot result visualization
├── WrapperApp/                # Tab navigation + panels
├── libs/
│   └── converter/             # Git submodule → converter repo
└── util/                      # Shared utilities
```

## Key Design Patterns

### Signals (Event System)

The 3D editor uses the `signals` library for internal event propagation. Over **40 signals** cover events like:
- `objectAdded`, `objectRemoved`, `objectChanged`
- `zoneGeometryChanged`, `scoringQuantityChanged`
- `editorCleared`, `sceneGraphChanged`

React bridges these signals via `useSignal` hooks to trigger re-renders.

### Command Pattern

All editor mutations (add figure, move object, change material) go through a Command pattern for **undo/redo** support. See [Adding Commands](/docs/frontend/adding-commands/).

### Serialization

The editor JSON format captures the full simulation state. It is:
- Auto-saved to `localStorage` on every change
- Exportable as `.json` files
- Sent to the backend for simulation submission
- Consumed by the Pyodide converter for input file generation

## Build System

The project uses **Create React App** with **react-app-rewired** for Webpack customization (`config-overrides.js`):

- `react-dnd` ESM compatibility fixes
- `.cjs`/`.mjs` module resolution
- Ignoring `geant4_wasm.wasm` from bundling
- Ignoring `node:worker_threads`

## Related Pages

- [3D Editor](/docs/frontend/3d-editor/) — editor internals and managers
- [Simulation Services](/docs/frontend/simulation-services/) — remote and local execution
- [Pyodide Converter](/docs/frontend/pyodide-converter/) — in-browser Python
- [Auth Flows](/docs/frontend/auth-flows/) — authentication implementation
