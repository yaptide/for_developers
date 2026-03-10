---
title: Geant4
description: Converter internals for the Geant4 simulation engine.
---

The Geant4 converter produces two files: a **GDML** geometry file and a **macro** file that configures the beam, physics, and scoring.

## Output Files

| File | Purpose | Format |
|---|---|---|
| `geometry.gdml` | Geometry definition | XML (Geometry Description Markup Language) |
| `run.mac` | Simulation parameters | Geant4 macro commands |

## GDML Output

GDML (Geometry Description Markup Language) is an XML schema for describing detector geometries. The converter generates a valid GDML file that Geant4 loads at runtime.

### Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gdml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="http://service-spi.web.cern.ch/...">

  <define>
    <!-- Positions and rotations -->
    <position name="pos_water" x="0" y="0" z="10" unit="cm"/>
    <rotation name="rot_water" x="0" y="0" z="0" unit="deg"/>
  </define>

  <materials>
    <!-- Material definitions -->
    <material name="G4_WATER"/>
  </materials>

  <solids>
    <!-- Geometry primitives -->
    <box name="world_solid" x="200" y="200" z="200" lunit="cm"/>
    <tube name="water_solid" rmin="0" rmax="5" z="20"
          startphi="0" deltaphi="360" aunit="deg" lunit="cm"/>
  </solids>

  <structure>
    <!-- Logical and physical volumes -->
    <volume name="water_log">
      <materialref ref="G4_WATER"/>
      <solidref ref="water_solid"/>
    </volume>
    <volume name="world_log">
      <materialref ref="G4_Galactic"/>
      <solidref ref="world_solid"/>
      <physvol>
        <volumeref ref="water_log"/>
        <positionref ref="pos_water"/>
        <rotationref ref="rot_water"/>
      </physvol>
    </volume>
  </structure>

  <setup name="Default" version="1.0">
    <world ref="world_log"/>
  </setup>
</gdml>
```

### Figure Mapping

| Editor Figure | GDML Solid | Element |
|---|---|---|
| Box | `<box>` | `x`, `y`, `z` (half-lengths) |
| Cylinder | `<tube>` | `rmin`, `rmax`, `z`, `startphi`, `deltaphi` |
| Sphere | `<orb>` | `r` |

> **Important:** GDML uses **half-lengths** for box dimensions. The converter divides the editor's full dimensions by 2.

### Volume Hierarchy

GDML organizes geometry as a tree of volumes:

1. **World volume** — outermost bounding box (auto-generated)
2. **Physical volumes** — placed inside the world with position and rotation
3. **Logical volumes** — link a solid shape to a material

The converter flattens the editor's zone-based CSG into GDML's volume hierarchy. Each zone becomes a physical volume placed in the world.

> **Note:** Geant4's GDML supports boolean solids (`<subtraction>`, `<union>`, `<intersection>`) for CSG. The converter may use these for complex zone definitions, but simple zones map directly to placed volumes.

## Macro Output

The macro file configures everything that isn't geometry:

```
/run/initialize
/gun/particle proton
/gun/energy 150 MeV
/gun/position 0 0 -50 cm
/gun/direction 0 0 1
/run/beamOn 10000
```

### Macro Sections

| Section | Commands | Purpose |
|---|---|---|
| Initialization | `/run/initialize` | Initialize the Geant4 kernel |
| Beam | `/gun/particle`, `/gun/energy`, `/gun/position`, `/gun/direction` | Primary particle source |
| Physics | Physics list configuration | Energy thresholds, models |
| Scoring | `/score/create/...`, `/score/quantity/...` | Detector meshes and quantities |
| Execution | `/run/beamOn N` | Start simulation with N primaries |

## Parser Internals

### Module Structure

```
geant4/
├── __init__.py
├── parser.py       # Geant4Parser orchestration
└── ...
```

### Parsing Flow

```python
class Geant4Parser(Parser):
    def parse_configs(self, json_data):
        # Parse beam, geometry, materials, scoring from JSON
        self._parse_beam(json_data)
        self._parse_geometry(json_data)
        self._parse_materials(json_data)
        self._parse_scoring(json_data)

    def get_configs_json(self):
        return {
            "geometry.gdml": self._render_gdml(),
            "run.mac": self._render_macro(),
        }
```

The Geant4 parser is more compact than SHIELD-HIT12A or FLUKA because:
- GDML is XML (structured, not fixed-width)
- The macro format is line-oriented commands (no column alignment needed)

### GDML Rendering

The converter builds the GDML XML using string templates (not an XML library). Sections are rendered in order:

1. **`<define>`** — positions and rotations for each figure
2. **`<materials>`** — material references (Geant4 built-in names like `G4_WATER`)
3. **`<solids>`** — one solid element per figure, plus the world solid
4. **`<structure>`** — logical volumes (solid + material) and physical volumes (placement)
5. **`<setup>`** — points to the world volume

### Material Mapping

Geant4 uses the NIST material database. The converter maps YAPTIDE materials to Geant4 names:

| YAPTIDE Material | Geant4 Name |
|---|---|
| Water | `G4_WATER` |
| Air | `G4_AIR` |
| Aluminum | `G4_Al` |
| Vacuum | `G4_Galactic` |
| Custom | Defined inline with element composition |

## WebAssembly Context

When running via the Geant4 WebAssembly build in the browser, the converter's output is **consumed directly** by the in-browser Geant4 instance. The files are passed as in-memory strings — never written to disk.

See [Geant4 WebAssembly](/docs/frontend/geant4-wasm/) for the browser execution flow.

## Limitations

| Limitation | Detail |
|---|---|
| **CSG complexity** | Complex boolean zone operations may not translate cleanly to GDML volume hierarchy |
| **Scoring** | Not all YAPTIDE scoring quantities have Geant4 equivalents |
| **Physics lists** | Limited physics list configuration compared to native Geant4 macros |
| **Rotation** | Nested rotations require careful coordinate transformation |

## Common Issues

| Problem | Cause | Fix |
|---|---|---|
| Invalid GDML schema | Malformed XML output | Check GDML rendering for unclosed tags |
| Volume overlap | Placed volumes intersect without boolean subtraction | Verify zone-to-volume mapping |
| Wrong units | GDML defaults may differ from editor conventions | Ensure `lunit="cm"` and `aunit="deg"` are set |
| Missing material | Material name not in Geant4 NIST database | Map to correct `G4_*` name or define custom |
