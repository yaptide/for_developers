---
title: "SHIELD-HIT12A"
description: Converter internals for the SHIELD-HIT12A simulation engine.
---

SHIELD-HIT12A is the **primary** and most complete engine in the YAPTIDE converter. It produces four fixed-width text files that control particle transport simulation.

## Output Files

| File | Purpose | Config Class |
|---|---|---|
| `beam.dat` | Beam parameters | `BeamConfig` |
| `mat.dat` | Material definitions | `GeoMatConfig` (shared) |
| `geo.dat` | Geometry description | `GeoMatConfig` (shared) |
| `detect.dat` | Scoring detectors | `DetectConfig` |

## File Formats

### beam.dat

Defines the particle source:

```
RNDSEED         89736501       0
JPART0                 2
TMAX0          150.00000    0.00
NSTAT              10000       0
STRAGG                 2
MSCAT                  2
NUCRE                  1
```

**Key parameters:**

| Keyword | Description |
|---|---|
| `RNDSEED` | Random number seed |
| `JPART0` | Particle type (1=H, 2=He, 6=C, 25=proton, etc.) |
| `TMAX0` | Beam energy in MeV (or MeV/nucl for ions) |
| `NSTAT` | Number of primary particles |
| `STRAGG` | Energy straggling model |
| `MSCAT` | Multiple scattering model |
| `NUCRE` | Nuclear reactions toggle |

The converter handles the **energy unit conversion** between MeV (editor) and MeV/nucleon (SHIELD-HIT12A) automatically via `convert_beam_energy()`.

### geo.dat

Uses a zone-based CSG geometry format:

```
    0    0          Proton pencil beam in water
    0    1          geometry for simple simulations
  RCC    1       0.000      0.000      0.000      0.000      0.000     20.000
                 5.000
  RCC    2       0.000      0.000     -1.000      0.000      0.000     22.000
                 6.000
  END
  001          +1
  002          +2     -1
  END
    1    1    1
    2    1000
```

The file has **three sections**:

1. **Figures** — geometric primitives (`RCC` = cylinder, `RPP` = box, `SPH` = sphere)
2. **Zones** — boolean CSG expressions using figure IDs (`+N` = inside, `-N` = outside)
3. **Medium assignments** — zone-to-material mapping

The converter auto-generates a **black-hole boundary zone** that surrounds the entire geometry, filled with vacuum (material 1000).

### mat.dat

Defines materials using ICRU numbers or custom element compositions:

```
MEDIUM 1
ICRU 276
END
```

For custom materials, the converter writes element-by-element composition with density.

### detect.dat

Defines scoring meshes and quantities:

```
Geometry Cyl        0.000      0.000      0.000        CYL
                  200.000    200.000      0.000
                    1.000      1.000    400.000
                        1          1        400
    DOSE
    APTS    Detector0
```

**Detector types supported:**

| Type | Keyword | Description |
|---|---|---|
| Mesh | `MSH` | Cartesian grid |
| Cylinder | `CYL` | Cylindrical mesh (r, θ, z) |
| Zone | `ZONE` | Score in a named geometric zone |

**Scored quantities:**

| Keyword | Quantity |
|---|---|
| `DOSE` | Absorbed dose |
| `FLUENCE` | Particle fluence |
| `LETFLU` | Fluence-weighted LET |
| `DLETFLU` | Dose-weighted LET (via fluence) |
| `TLETFLU` | Track-averaged LET |
| `SPC` | Energy spectrum |
| `APTS` | Average point of the track scored |

## Parser Internals

### Module Structure

```
shieldhit/
├── __init__.py
├── parser.py        # ShieldhitParser orchestration
├── beam.py          # BeamConfig dataclass + rendering
├── geo.py           # GeoMatConfig — figures, zones, materials
├── detect.py        # DetectConfig — detectors + scoring
└── ...
```

### Parsing Flow

```python
class ShieldhitParser(Parser):
    def parse_configs(self, json_data):
        self.beam_config = BeamConfig()
        self.beam_config.parse(json_data)

        self.geo_mat_config = GeoMatConfig()
        self.geo_mat_config.parse(json_data)

        self.detect_config = DetectConfig()
        self.detect_config.parse(json_data)
```

Each config class follows the same pattern:
1. Extract relevant JSON keys
2. Validate required fields
3. Convert editor units to SHIELD-HIT12A units
4. Populate a fixed-width formatted string

### Fixed-Width Formatting

SHIELD-HIT12A input files use **Fortran-style fixed-width columns**. The converter uses `format_float()` from `converter/common.py`:

```python
from converter.common import format_float

format_float(5.0, 10)    # "   5.00000"  — 10 chars, right-aligned
format_float(0.001, 10)  # "   0.00100"
```

This ensures correct alignment expected by the SHIELD-HIT12A parser.

### Zone Construction

The converter transforms the editor's figure + zone model into SHIELD-HIT12A's CSG syntax:

1. Each figure becomes a named primitive (RCC, RPP, SPH)
2. Each zone becomes a boolean expression: `+N` (inside figure N), `-N` (outside figure N)
3. A surrounding black-hole zone is auto-generated using `SolidFigure.expand()`
4. Zone numbering and material assignment are serialized in the final section

## Common Issues

| Problem | Cause | Fix |
|---|---|---|
| Overlapping zones | Zone definitions in JSON share the same figure without subtraction | Ensure zones correctly subtract each other in the editor |
| Missing black-hole boundary | World zone not generated | Check that `expand()` covers all figures |
| Wrong energy units | MeV vs MeV/nucl mismatch | `convert_beam_energy()` handles this; verify `heavy_ion_a` field |
| Truncated numbers | Value too large for column width | Adjust precision in `format_float()` |
