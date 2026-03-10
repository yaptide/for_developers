---
title: Conversion Flow
description: End-to-end walkthrough of how editor JSON becomes simulator input.
---

The conversion pipeline is a four-stage process: **resolve a parser → parse JSON → extract files → write output**. Every simulator follows this exact pipeline.

## Pipeline Overview

```
JSON payload
     │
     ▼
get_parser_from_str("shieldhit")   ──>  ShieldhitParser instance
     │
     ▼
parser.parse_configs(json_data)    ──>  internal dataclasses populated
     │
     ▼
parser.get_configs_json()          ──>  { "beam.dat": "...", "geo.dat": "...", ... }
     │  OR
parser.save_configs(output_dir)    ──>  files written to disk
```

## Stage 1 — Resolve the Parser

`converter/api.py` exposes the factory function:

```python
from converter.api import get_parser_from_str

parser = get_parser_from_str("shieldhit")
# Returns a ShieldhitParser instance
```

The mapping is straightforward:

| String | Parser Class |
|---|---|
| `"shieldhit"` | `ShieldhitParser` |
| `"fluka"` | `FlukaParser` |
| `"geant4"` | `Geant4Parser` |
| `"topas"` | `TopasParser` |

An unrecognised string raises `ValueError`.

## Stage 2 — Parse the JSON

```python
parser.parse_configs(json_data)
```

This is where the real work happens. The parser walks through the JSON payload and populates internal data structures:

1. **Beam** — energy, particle type, shape, divergence
2. **Materials** — element composition, density, from a material library
3. **Figures** — 3D geometry primitives (box, cylinder, sphere) with position/rotation
4. **Zones** — boolean CSG operations on figures (union, subtraction, intersection)
5. **Detectors** — scoring meshes (mesh, cylinder, zone)
6. **Scoring** — quantities to score (dose, fluence, LET, etc.) tied to detectors
7. **Physics** — delta-ray production, energy thresholds, nuclear reactions

The JSON keys correspond to the top-level groups described in the [project JSON schema](/docs/architecture/project-json-schema/).

## Stage 3 — Extract Output

Two extraction modes exist:

### In-memory (for frontend / API)

```python
files: dict = parser.get_configs_json()
# Returns {"beam.dat": "file contents...", "geo.dat": "file contents...", ...}
```

This is used by:
- The backend API when returning files for preview
- The Pyodide converter running in the browser

### To disk (for CLI / workers)

```python
from pathlib import Path
parser.save_configs(Path("output/"))
```

This creates the files on the filesystem. The simulation worker uses this mode before handing the directory to the simulator binary.

## Stage 4 — What Gets Written

Each engine produces a different set of files. See the engine-specific pages for full format details.

### SHIELD-HIT12A

| File | Content |
|---|---|
| `beam.dat` | Beam parameters (energy, particle, shape, direction) |
| `mat.dat` | Material definitions (ICRU numbers, custom compositions) |
| `geo.dat` | Geometry (figures → zones → medium assignments, black-hole boundary) |
| `detect.dat` | Scoring definitions (detectors, quantities, filters, output units) |

### FLUKA

| File | Content |
|---|---|
| `fl_sim.inp` | Single monolithic input file containing all configuration as "cards" |

### Geant4

| File | Content |
|---|---|
| `geometry.gdml` | Geometry Description Markup Language file |
| `run.mac` | Geant4 macro file (beam, physics, scoring) |

## Entry Points

### CLI

Run the converter from the command line:

```bash
converter --help
converter -i project.json -o shieldhit -d output/
```

| Argument | Description |
|---|---|
| `-i`, `--input` | Path to a YAPTIDE project JSON file |
| `-o`, `--output_type` | Target simulator (`shieldhit`, `fluka`, `geant4`, `topas`) |
| `-d`, `--output_dir` | Output directory for generated files |

### Python API

Import and call directly:

```python
import json
from converter.api import get_parser_from_str

with open("project.json") as f:
    data = json.load(f)

parser = get_parser_from_str("shieldhit")
parser.parse_configs(data)
files = parser.get_configs_json()

for name, content in files.items():
    print(f"=== {name} ===")
    print(content)
```

### Backend Integration

The backend calls the converter before dispatching simulation tasks:

```python
# In the simulation job submission flow
parser = get_parser_from_str(simulator_type)
parser.parse_configs(payload_dict)
configs = parser.get_configs_json()
# configs sent to Celery worker alongside simulator binary
```

## Error Handling

Common conversion failures:

| Scenario | Error |
|---|---|
| Unknown simulator string | `ValueError` |
| Missing required JSON key | `KeyError` with descriptive message |
| Invalid geometry (e.g. zone references missing figure) | `ValueError` with zone/figure context |
| Unsupported feature for target engine | `NotImplementedError` |

The converter does **not** validate physics plausibility — it only checks structural correctness of the input JSON.
