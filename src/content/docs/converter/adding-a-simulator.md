---
title: Adding a Simulator
description: How-to guide for implementing a new simulation engine backend.
---

This guide walks through adding support for a new Monte Carlo simulation engine to the YAPTIDE converter. You will create a parser that translates the editor JSON into your engine's input format.

## Prerequisites

- Familiarity with the [conversion flow](/docs/converter/conversion-flow/)
- Working dev setup (see [converter dev setup](/docs/get-started/dev-setup-converter/))
- Understanding of your target engine's input file format

## Step 1 — Create the Parser Directory

Add a new directory under `converter/converter/`:

```
converter/converter/
└── mynewengine/
    ├── __init__.py
    └── parser.py
```

## Step 2 — Implement the Parser Class

Create `parser.py` and extend the `Parser` base class:

```python
"""Parser for MyNewEngine input format."""

from pathlib import Path
from converter.common import Parser


class MyNewEngineParser(Parser):
    """Translates YAPTIDE editor JSON into MyNewEngine input files."""

    def __init__(self):
        self.beam_config = None
        self.geo_config = None
        # Add whatever internal state you need

    def parse_configs(self, json_data: dict) -> None:
        """Parse the editor JSON and populate internal state."""
        # Extract from json_data following the project JSON schema:
        # json_data["beam"] → beam parameters
        # json_data["figureManager"]["figures"] → geometry primitives
        # json_data["zoneManager"]["zones"] → CSG zone operations
        # json_data["materialManager"]["materials"] → material definitions
        # json_data["detectorManager"]["detectors"] → scoring detectors
        # json_data["scoringManager"]["outputs"] → scored quantities
        self.beam_config = self._parse_beam(json_data.get("beam", {}))
        self.geo_config = self._parse_geometry(json_data)

    def save_configs(self, output_dir: Path) -> None:
        """Write generated files to the output directory."""
        output_dir.mkdir(parents=True, exist_ok=True)

        beam_file = output_dir / "beam_config.inp"
        beam_file.write_text(self._render_beam())

        geo_file = output_dir / "geometry.inp"
        geo_file.write_text(self._render_geometry())

    def get_configs_json(self) -> dict:
        """Return {filename: content} dict without writing files."""
        return {
            "beam_config.inp": self._render_beam(),
            "geometry.inp": self._render_geometry(),
        }

    # --- Private helpers ---

    def _parse_beam(self, beam_data: dict):
        """Convert beam JSON to internal representation."""
        # Implement based on your engine's requirements
        pass

    def _parse_geometry(self, json_data: dict):
        """Convert figures + zones to internal representation."""
        pass

    def _render_beam(self) -> str:
        """Render beam config as a string in engine's format."""
        pass

    def _render_geometry(self) -> str:
        """Render geometry as a string in engine's format."""
        pass
```

### Key Points

- **`parse_configs`** receives the full project JSON. Extract what you need.
- **`save_configs`** writes files to a directory (used by the CLI and workers).
- **`get_configs_json`** returns a dictionary of filename → file content (used by the API and Pyodide preview).
- Both output methods must produce **identical** content.

## Step 3 — Register the Parser

Open `converter/api.py` and add your parser to the factory function:

```python
from converter.mynewengine.parser import MyNewEngineParser

def get_parser_from_str(parser_type: str) -> Parser:
    if parser_type == "shieldhit":
        return ShieldhitParser()
    elif parser_type == "fluka":
        return FlukaParser()
    elif parser_type == "geant4":
        return Geant4Parser()
    elif parser_type == "topas":
        return TopasParser()
    elif parser_type == "mynewengine":      # Add this
        return MyNewEngineParser()
    else:
        raise ValueError(f"Unknown parser type: {parser_type}")
```

## Step 4 — Add Golden-File Tests

Create test files and expected output in the test directory:

```
tests/mynewengine/
├── __init__.py
├── test_mynewengine.py
└── test_data/
    ├── sample_project.json         # Input project JSON
    ├── expected_beam_config.inp    # Expected beam output
    └── expected_geometry.inp       # Expected geometry output
```

Write the test:

```python
"""Golden-file tests for MyNewEngine parser."""

import json
from pathlib import Path

from converter.api import get_parser_from_str

TEST_DIR = Path(__file__).parent / "test_data"


def test_beam_output():
    """Verify beam config matches golden file."""
    with open(TEST_DIR / "sample_project.json") as f:
        project = json.load(f)

    parser = get_parser_from_str("mynewengine")
    parser.parse_configs(project)
    configs = parser.get_configs_json()

    expected = (TEST_DIR / "expected_beam_config.inp").read_text()
    assert configs["beam_config.inp"] == expected


def test_geometry_output():
    """Verify geometry matches golden file."""
    with open(TEST_DIR / "sample_project.json") as f:
        project = json.load(f)

    parser = get_parser_from_str("mynewengine")
    parser.parse_configs(project)
    configs = parser.get_configs_json()

    expected = (TEST_DIR / "expected_geometry.inp").read_text()
    assert configs["geometry.inp"] == expected
```

Run tests:

```bash
cd converter
poetry run pytest tests/mynewengine/ -v
```

## Step 5 — Handle Geometry Correctly

The trickiest part of any converter is geometry. YAPTIDE uses a CSG (Constructive Solid Geometry) model:

1. **Figures** define primitives (boxes, cylinders, spheres) with position and rotation.
2. **Zones** combine figures using boolean operations — a zone is defined as an intersection of included figures minus excluded figures.
3. Each zone is assigned a **material**.
4. A **black-hole boundary** surrounds the entire geometry. The converter must auto-generate this.

Use the existing `SolidFigure` classes from `converter/solid_figures.py`:

```python
from converter.solid_figures import parse_figure

# Parse a figure dict from the JSON
figure = parse_figure(figure_json)
# Returns a BoxFigure, CylinderFigure, or SphereFigure instance

# Expand for black-hole boundary
expanded = figure.expand(margin=10.0)
```

Study the SHIELD-HIT12A parser's geometry handling as the most complete reference implementation.

## Step 6 — Update Documentation

1. Add your engine to the supported engines table in the converter overview.
2. Create an engine-specific page under `converter/` following the pattern of existing engine docs.
3. Add the page to the sidebar in `astro.config.mjs`.

## Checklist

- [ ] Parser class extends `Parser` with all three abstract methods
- [ ] Registered in `get_parser_from_str()` factory
- [ ] Golden-file tests for all output files
- [ ] Black-hole boundary generation
- [ ] Material assignment to zones
- [ ] Beam configuration
- [ ] Detector/scoring handling (if the engine supports it)
- [ ] CLI tested: `converter -i test.json -o mynewengine -d out/`
- [ ] Documentation updated
