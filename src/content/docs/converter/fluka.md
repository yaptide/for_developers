---
title: FLUKA
description: Converter internals for the FLUKA simulation engine.
---

The FLUKA converter produces a single monolithic input file (`fl_sim.inp`) containing all simulation parameters encoded as **cards** — FLUKA's fixed-format configuration units.

## Output Files

| File | Purpose |
|---|---|
| `fl_sim.inp` | Complete FLUKA input file with all cards |

## FLUKA Card System

FLUKA uses a card-based input format. Each card is an 80-character line specifying a configuration directive:

```
BEAM         -0.150       0.0       0.0       0.0       0.0       0.0PROTON
BEAMPOS        0.0       0.0     -50.0       0.0       0.0
GEOBEGIN                                                              COMBNAME
    0    0
RPP BH       -600.0 600.0 -600.0 600.0 -600.0 600.0
RPP water     -50.0  50.0  -50.0  50.0    0.0 100.0
END
BH           5 +BH -water
target       5 +water
END
GEOEND
ASSIGNMA     BLCKHOLE       BH
ASSIGNMA        WATER   target
USRBIN           10. DOSE       -21.  50.0  50.0 100.0bin1
USRBIN         -50.0 -50.0    0.0    1    1  400 &
RANDOMIZ          1.      1.
START       10000.0
STOP
```

## Card Types

The converter generates these card groups:

| Card | Purpose |
|---|---|
| `BEAM` / `BEAMPOS` | Particle type, energy, beam position and direction |
| `GEOBEGIN` / `GEOEND` | Geometry block containing figures and zones |
| `RPP`, `RCC`, `SPH` | Geometry primitives (box, cylinder, sphere) |
| `ASSIGNMA` | Material-to-zone assignments |
| `USRBIN` | Scoring detectors (mesh binnings) |
| `RANDOMIZ` | Random number seed |
| `START` | Number of primary particles |
| `STOP` | End-of-input marker |

## Parser Internals

### Module Structure

```
fluka/
├── __init__.py
├── parser.py           # FlukaParser orchestration
├── input.py            # FlukaInput dataclass—holds all parsed data
├── cards/              # Individual card generators
│   ├── __init__.py
│   ├── beam_card.py
│   ├── figure_card.py
│   ├── material_card.py
│   ├── region_card.py
│   ├── scoring_card.py
│   └── ...
└── helper_parsers/     # JSON → internal representation
    ├── __init__.py
    ├── beam_parser.py
    ├── figure_parser.py
    ├── material_parser.py
    ├── region_parser.py
    └── scoring_parser.py
```

### Architecture

The FLUKA converter has a clean two-phase design:

**Phase 1 — Parse** (helper_parsers)

```
Editor JSON  →  helper_parsers  →  FlukaInput dataclass
```

Each helper parser extracts its domain from the JSON and populates the shared `FlukaInput` object.

**Phase 2 — Render** (cards)

```
FlukaInput  →  card generators  →  formatted card strings  →  fl_sim.inp
```

Each card generator takes the parsed data and produces correctly formatted 80-character card lines.

### FlukaInput Dataclass

Central data container holding all parsed configuration:

```python
@dataclass
class FlukaInput:
    beam: BeamData
    figures: list[FlukaFigure]
    regions: list[FlukaRegion]
    materials: list[FlukaMaterial]
    scorings: list[FlukaScoring]
    settings: SimulationSettings
```

### Parsing Flow

```python
class FlukaParser(Parser):
    def parse_configs(self, json_data):
        self.input = FlukaInput()

        # Phase 1: parse JSON into internal representation
        parse_beam(json_data, self.input)
        parse_figures(json_data, self.input)
        parse_regions(json_data, self.input)
        parse_materials(json_data, self.input)
        parse_scorings(json_data, self.input)

    def get_configs_json(self):
        # Phase 2: render to card format
        lines = []
        lines += render_beam_cards(self.input)
        lines += render_geometry_block(self.input)
        lines += render_material_cards(self.input)
        lines += render_scoring_cards(self.input)
        lines += render_control_cards(self.input)

        return {"fl_sim.inp": "\n".join(lines)}
```

## Geometry Mapping

FLUKA uses the same CSG approach as SHIELD-HIT12A but with FLUKA-specific keywords:

| Editor Figure | FLUKA Primitive | Parameters |
|---|---|---|
| Box | `RPP` | xmin, xmax, ymin, ymax, zmin, zmax |
| Cylinder | `RCC` | center, axis vector, radius |
| Sphere | `SPH` | center, radius |

### Zone → Region

FLUKA calls zones "regions." The CSG syntax is similar:

```
target       5 +water
wrapper      5 +BH -water
```

- `+name` — inside the named body
- `-name` — outside the named body
- The `5` is the number of operators in the expression

The converter maps YAPTIDE zone operations to FLUKA region expressions.

### Black-Hole Boundary

A `BLCKHOLE` region wraps the entire geometry. The converter expands the bounding box of all figures and creates an `RPP` enclosure, assigned the `BLCKHOLE` material.

## Material Mapping

FLUKA uses predefined material names. The converter maps YAPTIDE materials to FLUKA's built-in material library:

| YAPTIDE Material | FLUKA Material |
|---|---|
| Water | `WATER` |
| Air | `AIR` |
| Aluminum | `ALUMINUM` |
| Custom | Defined via `MATERIAL` + `COMPOUND` cards |

## Scoring

The converter maps YAPTIDE detector types to FLUKA's `USRBIN` cards:

| YAPTIDE Quantity | FLUKA Scoring |
|---|---|
| Dose | `DOSE` |
| Fluence | `FLUENCE` |
| LET | Requires post-processing |

> **Note:** FLUKA's scoring capabilities differ from SHIELD-HIT12A. Not all YAPTIDE scoring options have direct FLUKA equivalents.

## Common Issues

| Problem | Cause | Fix |
|---|---|---|
| Card alignment errors | Lines not padded to 80 characters | Check card generators' formatting |
| Unknown material | YAPTIDE material has no FLUKA mapping | Add mapping or use `MATERIAL` + `COMPOUND` cards |
| Region expression too long | Complex CSG zone exceeds single-line limit | Check parenthesization and line continuation |
