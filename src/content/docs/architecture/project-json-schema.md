---
title: Project JSON Schema
description: The canonical JSON format produced by the 3D editor and consumed by the converter.
---

The **editor JSON** is the central data format in YAPTIDE. The UI produces it, the converter consumes it, and the backend stores it. Understanding this schema is essential for working on any part of the system.

## Top-Level Structure

```json
{
  "project": { ... },
  "beam": { ... },
  "figureManager": { "figures": [ ... ] },
  "zoneManager": { "zones": [ ... ], "worldZone": { ... } },
  "materialManager": { "materials": [ ... ] },
  "detectorManager": { "detectors": [ ... ] },
  "scoringManager": { "outputs": [ ... ], "filters": [ ... ] },
  "physic": { ... },
  "specialComponentsManager": { ... }
}
```

## `project`

Metadata about the simulation.

```json
{
  "project": {
    "title": "My Simulation"
  }
}
```

## `beam`

Particle source configuration.

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Particle type ID (see SHIELD-HIT12A particle table) |
| `energy` | `number` | Kinetic energy |
| `energyUnit` | `string` | `"MeV"` or `"MeV/nucl"` |
| `energySpread` | `number` | Energy spread (standard deviation) |
| `numberOfParticles` | `number` | Total primaries to simulate |
| `position` | `{x, y, z}` | Source position in cm |
| `direction` | `{x, y, z}` | Beam direction unit vector |
| `sigma` | `{x, y}` | Gaussian beam profile sigma |
| `sad` | `{x, y}` | Source-to-axis distance (for divergent beams) |
| `sourceFile` | `object \| null` | External source definition file |

```json
{
  "beam": {
    "id": 2,
    "energy": 150.0,
    "energyUnit": "MeV",
    "energySpread": 1.5,
    "numberOfParticles": 10000,
    "position": { "x": 0, "y": 0, "z": 0 },
    "direction": { "x": 0, "y": 0, "z": 1 },
    "sigma": { "x": 0.1, "y": 0.1 },
    "sad": { "x": 0, "y": 0 }
  }
}
```

## `figureManager.figures[]`

3D geometric primitives. Each figure represents a solid shape in the scene.

| Field | Type | Description |
|---|---|---|
| `type` | `string` | `"BoxFigure"`, `"CylinderFigure"`, or `"SphereFigure"` |
| `name` | `string` | Display name |
| `uuid` | `string` | Unique identifier |
| `position` | `{x, y, z}` | Center position in cm |
| `rotation` | `{x, y, z}` | Tait-Bryan rotation angles in radians |
| `parameters` | `object` | Shape-specific dimensions |

**Box parameters**: `{ xLength, yLength, zLength }` (half-lengths in cm)

**Cylinder parameters**: `{ radius, height }` (in cm, along Z-axis)

**Sphere parameters**: `{ radius }` (in cm)

```json
{
  "type": "BoxFigure",
  "name": "WaterPhantom",
  "uuid": "abc-123",
  "position": { "x": 0, "y": 0, "z": 15 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "parameters": { "xLength": 10, "yLength": 10, "zLength": 20 }
}
```

## `zoneManager.zones[]`

CSG (Constructive Solid Geometry) zones define regions of space by combining figures through boolean operations. Each zone is assigned a material.

| Field | Type | Description |
|---|---|---|
| `uuid` | `string` | Unique identifier |
| `name` | `string` | Display name |
| `materialUuid` | `string` | Reference to a material in `materialManager` |
| `unionOperations` | `array` | List of figure UUIDs included (union) |
| `intersectionOperations` | `array` | List of figure UUIDs used for intersection |
| `subtractionOperations` | `array` | List of figure UUIDs subtracted |

### `zoneManager.worldZone`

The bounding world volume. Everything outside is treated as vacuum or a "black hole" (absorbing boundary).

```json
{
  "worldZone": {
    "uuid": "world-001",
    "figure": {
      "type": "BoxFigure",
      "parameters": { "xLength": 50, "yLength": 50, "zLength": 50 }
    },
    "materialUuid": "vacuum-uuid"
  }
}
```

## `materialManager.materials[]`

Material definitions based on ICRU identifiers.

| Field | Type | Description |
|---|---|---|
| `uuid` | `string` | Unique identifier |
| `name` | `string` | Display name (e.g., "Water", "Air", "Bone") |
| `icru` | `number` | ICRU material number |
| `density` | `number` | Override density (optional) |

```json
{
  "uuid": "mat-001",
  "name": "Water",
  "icru": 276,
  "density": 1.0
}
```

## `detectorManager.detectors[]`

Scoring detector geometries. Detectors define *where* quantities are scored.

| Field | Type | Description |
|---|---|---|
| `uuid` | `string` | Unique identifier |
| `type` | `string` | `"Cylinder"`, `"Mesh"`, `"Zone"`, or `"All"` |
| `name` | `string` | Display name |
| `geometryData` | `object` | Type-specific geometry definition |

**Cylinder detector** (cylindrical scoring mesh):
```json
{
  "type": "Cylinder",
  "geometryData": {
    "position": { "x": 0, "y": 0, "z": 15 },
    "radius": { "min": 0, "max": 5, "bins": 1 },
    "zAxis": { "min": 0, "max": 30, "bins": 300 }
  }
}
```

**Mesh detector** (rectangular scoring grid):
```json
{
  "type": "Mesh",
  "geometryData": {
    "position": { "x": 0, "y": 0, "z": 15 },
    "xAxis": { "min": -5, "max": 5, "bins": 100 },
    "yAxis": { "min": -5, "max": 5, "bins": 100 },
    "zAxis": { "min": 0, "max": 30, "bins": 1 }
  }
}
```

## `scoringManager`

Defines what quantities are scored and how results are filtered.

### `scoringManager.outputs[]`

Each output links a detector to a set of quantities.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Output filename |
| `detectorUuid` | `string` | Reference to a detector |
| `quantities` | `array` | List of scored quantities |

### `scoringManager.outputs[].quantities[]`

| Field | Type | Description |
|---|---|---|
| `type` | `string` | Quantity keyword (e.g., `"Dose"`, `"Fluence"`, `"LET"`, `"dLET"`) |
| `filterUuid` | `string \| null` | Optional reference to a particle filter |
| `rescale` | `number` | Rescaling factor |

### `scoringManager.filters[]`

Particle filters for conditional scoring.

| Field | Type | Description |
|---|---|---|
| `uuid` | `string` | Unique identifier |
| `name` | `string` | Display name |
| `particleId` | `number` | Particle type ID to filter for |
| `rules` | `array` | Filter rules (e.g., energy range, angular cuts) |

## `physic`

Physics model configuration.

| Field | Type | Description |
|---|---|---|
| `energyLoss` | `number` | Energy loss model selection |
| `nuclearReactions` | `number` | Nuclear reactions toggle (-1 = off, 1 = on) |
| `straggling` | `number` | Straggling model |
| `multipleScattering` | `number` | Multiple scattering model |
| `stoppingPowerFile` | `object \| null` | Custom stopping power file |
| `stepLength` | `number` | Maximum step length (cm) |

## `specialComponentsManager`

Optional special components such as beam modulators (SOBP wheel definitions) and CT data cubes.

```json
{
  "specialComponentsManager": {
    "modulatorConfig": {
      "enabled": true,
      "fileName": "modulator.dat",
      "zones": [ ... ]
    }
  }
}
```

## Version History

The editor JSON format is versioned. The `metadata.version` field tracks the schema version. The UI handles backward compatibility for older project files by migrating them on load.
