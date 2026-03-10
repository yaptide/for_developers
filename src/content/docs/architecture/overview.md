---
title: System Overview
description: High-level architecture of the YAPTIDE platform.
---

YAPTIDE is composed of **three repositories** that work together to provide a complete simulation workflow — from geometry creation to result visualization.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │               React + Three.js UI                │   │
│  │                                                  │   │
│  │  ┌──────────────┐   ┌──────────────────────────┐ │   │
│  │  │  3D Editor   │   │  Pyodide Web Worker      │ │   │
│  │  │  (Three.js)  │   │  (Python Converter)      │ │   │
│  │  └──────────────┘   └──────────────────────────┘ │   │
│  │                      ┌─────────────────────────┐ │   │
│  │                      │  Geant4 Wasm Worker     │ │   │
│  │                      │  (local simulations)    │ │   │
│  │                      └─────────────────────────┘ │   │
│  └──────────────────────┬───────────────────────────┘   │
└─────────────────────────┼───────────────────────────────┘
                          │ HTTPS (REST API)
┌─────────────────────────┼───────────────────────────────┐
│                    Nginx │ :8443                        │
│                  ┌───────┴───────┐                      │
│                  │  Flask API    │ :6000                │
│                  └───┬───────┬──┘                       │
│                      │       │                          │
│           ┌──────────┤       ├──────────┐               │
│           ▼          ▼       ▼          ▼               │
│     ┌──────────┐ ┌───────┐ ┌─────────────────────┐      │
│     │  Redis   │ │ PgSQL │ │   Celery Workers    │      │
│     │ (broker) │ │  (DB) │ │                     │      │
│     └──────────┘ └───────┘ │  simulation_worker  │      │
│                            │  helper_worker      │      │
│                            └────────┬────────────┘      │
│                                     │                   │
│                            ┌────────┴────────────┐      │
│                            │  Simulator Binaries │      │
│                            │  SHIELD-HIT12A      │      │
│                            │  FLUKA              │      │
│                            │  TOPAS              │      │
│                            └─────────────────────┘      │
│                                                         │
│                   Backend Server                        │
└─────────────────────────────────────────────────────────┘
                          │
                          │ SSH (Fabric)
                          ▼
                 ┌─────────────────┐
                 │  HPC Cluster    │
                 │  (PLGrid/Slurm) │
                 └─────────────────┘
```

## Component Responsibilities

### Backend (`yaptide` repository)

The backend is a **Flask 3.1** API server with **Celery 5.5** for async task execution and **PostgreSQL 16** for persistence.

- **REST API** — Handles authentication, job submission, status polling, and result retrieval.
- **Simulation Worker** — Celery worker that runs simulator binaries (SHIELD-HIT12A, FLUKA) in temporary directories, monitors progress, and posts updates back to Flask.
- **Helper Worker** — Celery worker for HPC batch job submission via SSH (PLGrid/Slurm) and cleanup tasks.
- **Nginx** — Reverse proxy with TLS termination.

### UI (`ui` repository)

The frontend is a **React 19** single-page application built with **Three.js** for 3D visualization and **MUI** for the interface. It runs entirely in the browser.

- **3D Editor** — CSG-based geometry builder with a 4-way split viewport (XY, XZ, YZ, perspective). Users place figures (boxes, cylinders, spheres), define boolean zones, assign materials, and configure detectors.
- **Pyodide Converter** — The `yaptide-converter` Python package compiled to WebAssembly via Pyodide, running in a Web Worker. Converts editor JSON to simulator input files without a server round-trip.
- **Geant4 Wasm Worker** — A full Geant4 runtime compiled to WebAssembly. Enables running Geant4 simulations entirely in the browser.
- **Result Visualization** — JSRoot (CERN ROOT) renders interactive histograms and 2D profiles.

### Converter (`converter` repository)

A standalone **Python package** that translates the editor's JSON project format into native simulator input files.

- **Input**: JSON from the 3D editor (geometry, beam, materials, scoring, physics)
- **Output**: Engine-specific files (`beam.dat`, `.inp`, `.gdml`, `.mac`)
- **Used in two contexts**: imported by the Flask backend for server-side conversion, and compiled to Wasm for in-browser use via Pyodide.

## Execution Paths

YAPTIDE supports three ways to run a simulation:

| Path | Engine | Where it Runs | How it Works |
|---|---|---|---|
| **Direct (Celery)** | SHIELD-HIT12A, FLUKA | Backend server | Celery chord: N parallel tasks → merge results |
| **Batch (Slurm)** | SHIELD-HIT12A, FLUKA | HPC cluster (PLGrid) | SSH → Slurm array job → watcher script → callbacks |
| **Local (Wasm)** | Geant4 | User's browser | Geant4 compiled to WebAssembly, no server needed |

:::tip
  Want to understand how data moves through these paths end-to-end? See [Data Flow](/docs/architecture/data-flow/).
:::

## The JSON Contract

The **editor JSON** is the canonical data format that ties all three repositories together. The UI produces it, the converter consumes it, and the backend stores it.

Top-level keys:
- `project` — title and metadata
- `beam` — particle type, energy, position, direction
- `figureManager.figures[]` — 3D solid primitives
- `zoneManager.zones[]` — boolean CSG operations on figures
- `materialManager.materials[]` — material definitions (ICRU)
- `detectorManager.detectors[]` — scoring detector geometries
- `scoringManager` — outputs, quantities, filters
- `physic` — physics model configuration

:::tip
See [Project JSON Schema](/docs/architecture/project-json-schema/) for the full specification.
:::

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend framework | React, TypeScript |
| 3D rendering | Three.js |
| UI components | MUI |
| Backend framework | Flask |
| Task queue | Celery, Redis |
| Database | PostgreSQL, SQLAlchemy |
| Auth | JWT, Keycloak OIDC |
| Converter | Python |
| In-browser Python | Pyodide |
| In-browser simulation | Geant4 WebAssembly |
| Result rendering | JSRoot |
| Containerization | Docker Compose |
| Reverse proxy | Nginx |
