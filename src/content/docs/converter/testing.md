---
title: Converter Testing
description: Test strategy and patterns for the YAPTIDE converter.
---

The converter uses a **golden-file** testing strategy: parser output is compared character-by-character against known-good reference files. This catches any unintended formatting or content changes.

## Running Tests

```bash
cd converter
poetry install
poetry run pytest -v
```

Run tests for a specific engine:

```bash
poetry run pytest tests/shieldhit/ -v
poetry run pytest tests/fluka/ -v
poetry run pytest tests/geant4/ -v
```

## Test Structure

```
tests/
├── conftest.py              # Shared fixtures
├── test_solid_figures.py    # Unit tests for geometry primitives
├── test_test.py             # Smoke test
├── shieldhit/
│   ├── __init__.py
│   ├── test_shieldhit.py    # ShieldhitParser golden-file tests
│   └── test_data/
│       ├── project.json     # Input project JSON
│       ├── beam.dat         # Expected beam.dat output
│       ├── geo.dat          # Expected geo.dat output
│       ├── mat.dat          # Expected mat.dat output
│       └── detect.dat       # Expected detect.dat output
├── fluka/
│   ├── __init__.py
│   ├── test_fluka.py
│   └── test_data/
│       ├── project.json
│       └── fl_sim.inp
├── geant4/
│   ├── __init__.py
│   ├── test_geant4.py
│   └── test_data/
│       ├── project.json
│       ├── geometry.gdml
│       └── run.mac
└── topas/
    └── ...
```

## Golden-File Pattern

The core testing approach:

```python
import json
from pathlib import Path
from converter.api import get_parser_from_str

TEST_DIR = Path(__file__).parent / "test_data"


def test_beam_dat():
    """Parsed beam.dat matches the golden reference."""
    with open(TEST_DIR / "project.json") as f:
        project = json.load(f)

    parser = get_parser_from_str("shieldhit")
    parser.parse_configs(project)
    configs = parser.get_configs_json()

    expected = (TEST_DIR / "beam.dat").read_text()
    assert configs["beam.dat"] == expected
```

### How It Works

1. A `project.json` file captures a real editor project export.
2. The test runs the parser on that JSON.
3. The parser's output is compared **exactly** against pre-saved reference files.
4. Any character-level difference fails the test.

### Updating Golden Files

When you **intentionally** change the converter output format:

1. Run the parser manually to generate new output.
2. Inspect the diff carefully — every change should be intentional.
3. Replace the reference files in `test_data/`.
4. Commit the updated golden files alongside the code change.

```bash
# Generate new output for inspection
cd converter
poetry run python -c "
import json
from converter.api import get_parser_from_str

with open('tests/shieldhit/test_data/project.json') as f:
    data = json.load(f)

parser = get_parser_from_str('shieldhit')
parser.parse_configs(data)
for name, content in parser.get_configs_json().items():
    print(f'=== {name} ===')
    print(content)
"
```

## Unit Tests

### Solid Figures

`test_solid_figures.py` tests geometry primitives independently:

```python
from converter.solid_figures import BoxFigure, CylinderFigure, SphereFigure


def test_box_expand():
    """Box expand() increases dimensions by margin."""
    box = BoxFigure(position=[0, 0, 0], rotation=[0, 0, 0],
                    x_edge_length=10, y_edge_length=10, z_edge_length=20)
    expanded = box.expand(margin=5.0)
    assert expanded.x_edge_length == 20.0
    assert expanded.z_edge_length == 30.0


def test_cylinder_expand():
    """Cylinder expand() increases radius and height."""
    cyl = CylinderFigure(position=[0, 0, 0], rotation=[0, 0, 0],
                         radius=5, height=20)
    expanded = cyl.expand(margin=3.0)
    assert expanded.radius == 8.0
    assert expanded.height == 26.0
```

These tests verify that `expand()` correctly generates figures for the black-hole boundary.

### Utility Functions

```python
from converter.common import format_float, rotate


def test_format_float():
    """format_float produces correctly padded output."""
    assert format_float(5.0, 10) == "   5.00000"


def test_rotate():
    """3D rotation applies Tait-Bryan angles correctly."""
    result = rotate([1, 0, 0], [0, 0, 90])
    assert abs(result[0]) < 1e-10
    assert abs(result[1] - 1.0) < 1e-10
```

## Fixtures

`conftest.py` provides shared test utilities:

```python
import json
import pytest
from pathlib import Path


@pytest.fixture
def sample_project():
    """Load the standard test project JSON."""
    path = Path(__file__).parent / "test_data" / "project.json"
    with open(path) as f:
        return json.load(f)
```

## Writing New Tests

### For a New Scoring Quantity

1. Add the scoring quantity to an existing `project.json` or create a new test project.
2. Run the parser and inspect the output.
3. Save the correct output as a new golden file.
4. Write a test comparing parser output against the golden file.

### For a Bug Fix

1. Create a minimal `project.json` that reproduces the bug.
2. Run the parser — verify it produces wrong output.
3. Fix the bug.
4. Save the now-correct output as the golden file.
5. Write the test. The test documents the bug and prevents regression.

## Pre-Commit Hooks

The converter uses pre-commit for code quality:

```bash
cd converter
poetry run pre-commit install
poetry run pre-commit run --all-files
```

Hooks include:
- **YAPF** — Python code formatting
- **isort** — import ordering
- Standard file checks (trailing whitespace, end-of-file newline)
