---
title: Converter Overview
description: Architecture of the YAPTIDE format converter.
---

The converter is a standalone Python package that translates the editor's JSON project format into native input files for Monte Carlo particle transport simulators.

## Purpose

The YAPTIDE UI produces a JSON description of the simulation. Simulators like SHIELD-HIT12A, FLUKA, and Geant4 each expect their own specific input format. The converter bridges this gap.

```
Editor JSON  ──>  Converter  ──>  Simulator-specific input files
```

## Supported Engines

| Engine | Parser Class | Output Files | Maturity |
|---|---|---|---|
| **SHIELD-HIT12A** | `ShieldhitParser` | `beam.dat`, `mat.dat`, `geo.dat`, `detect.dat` | Most complete |
| **FLUKA** | `FlukaParser` | `fl_sim.inp` | Solid |
| **Geant4** | `Geant4Parser` | `geometry.gdml`, `run.mac` | Good |
| **TOPAS** | `TopasParser` | `topas_config.txt` | Minimal / experimental |

## Where the Converter Runs

The converter is used in **two contexts**:

| Context | How | When |
|---|---|---|
| **Backend** | Imported as a Python library by the Flask app | Server-side conversion before dispatching simulations to workers |
| **Frontend** | Compiled to WebAssembly via Pyodide, running in a Web Worker | Input file preview and Geant4 local simulations |

Both contexts use the exact same codebase.

## Core Abstractions

### `Parser` Base Class

All parsers inherit from the abstract `Parser` class in `converter/common.py`:

```python
class Parser(ABC):
    @abstractmethod
    def parse_configs(self, json_data: dict) -> None:
        """Parse the editor JSON and populate internal dataclasses."""
        pass

    @abstractmethod
    def save_configs(self, output_dir: Path) -> None:
        """Write generated files to disk."""
        pass

    @abstractmethod
    def get_configs_json(self) -> dict:
        """Return {filename: content} dict without writing to disk."""
        pass
```

### `SolidFigure` Hierarchy

`converter/solid_figures.py` defines the geometry primitives:

```
SolidFigure (ABC)
├── BoxFigure       (xLength, yLength, zLength)
├── CylinderFigure  (radius, height)
└── SphereFigure    (radius)
```

Each figure has position, rotation, and an `expand(margin)` method for generating the world-zone black-hole boundary.

### Utility Functions

`converter/common.py` provides:

| Function | Purpose |
|---|---|
| `format_float(number, n)` | Format float with n decimal places (for fixed-width file formats) |
| `rotate(vector, angles)` | 3D Tait-Bryan rotation |
| `convert_beam_energy()` | MeV ↔ MeV/nucl based on particle type |

## Directory Structure

```
converter/
├── converter/
│   ├── __init__.py
│   ├── api.py              # Public API
│   ├── common.py           # Parser base class, utilities
│   ├── main.py             # CLI entry point
│   ├── solid_figures.py    # Geometry primitives
│   ├── shieldhit/          # SHIELD-HIT12A parser
│   │   ├── __init__.py
│   │   ├── parser.py       # ShieldhitParser
│   │   ├── beam.py         # BeamConfig → beam.dat
│   │   ├── geo.py          # GeoMatConfig → geo.dat + mat.dat
│   │   ├── detect.py       # DetectConfig → detect.dat
│   │   └── ...
│   ├── fluka/              # FLUKA parser
│   │   ├── __init__.py
│   │   ├── parser.py       # FlukaParser
│   │   ├── input.py        # Input dataclass
│   │   ├── cards/          # Card generators (beam, figures, regions...)
│   │   └── helper_parsers/ # JSON → card parsing logic
│   ├── geant4/             # Geant4 parser
│   │   ├── __init__.py
│   │   ├── parser.py       # Geant4Parser (GDML + macro)
│   │   └── ...
│   └── topas/              # TOPAS parser
│       ├── __init__.py
│       └── parser.py       # TopasParser (minimal)
└── tests/
```

## Related Pages

- [Conversion Flow](/docs/converter/conversion-flow/) — step-by-step parsing pipeline
- [Adding a Simulator](/docs/converter/adding-a-simulator/) — how to add a new engine
- Engine-specific docs: [SHIELD-HIT12A](/docs/converter/shieldhit/), [FLUKA](/docs/converter/fluka/), [Geant4](/docs/converter/geant4/)
