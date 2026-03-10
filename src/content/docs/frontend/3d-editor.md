---
title: 3D Editor
description: Architecture of the Three.js-based 3D simulation editor.
---

The 3D editor is the core of the YAPTIDE frontend. It provides a visual environment for building particle transport simulation geometries, defining beams, and configuring scoring.

## YaptideEditor

The editor is implemented in `ThreeEditor/js/YaptideEditor.js` — a ~780-line imperative class using the prototype pattern (forked from the Three.js editor project). It is exposed globally as `window.YAPTIDE_EDITOR` for debugging.

The `Store` context holds the singleton `YaptideEditor` instance, accessible via `useStore()`.

## Object Managers

The editor uses a manager pattern to organize different simulation components:

| Manager | What it Manages | Location |
|---|---|---|
| `FigureManager` | Geometric primitives | `Simulation/Figures/` |
| `ZoneManager` | Boolean CSG zones | `Simulation/Zones/` |
| `MaterialManager` | Material definitions | `Simulation/Materials/` |
| `DetectorManager` | Scoring detectors | `Simulation/Detectors/` |
| `ScoringManager` | Outputs, quantities, filters | `Simulation/Scoring/` |
| `SpecialComponentManager` | CT cubes, beam modulators | `Simulation/Special/` |
| `Beam` | Particle source | `Simulation/Physics/Beam.ts` |
| `Physics` | Physics model settings | `Simulation/Physics/` |

### FigureManager

Manages 3D solid primitives:

| Figure Type | Three.js Geometry | Parameters |
|---|---|---|
| `BoxFigure` | `BoxGeometry` | `xLength`, `yLength`, `zLength` |
| `CylinderFigure` | `HollowCylinderGeometry` | `radius`, `height` (+ optional inner radius) |
| `SphereFigure` | `SphereGeometry` | `radius` |

Each figure has position, rotation, and a unique UUID. Figures are rendered in the 3D viewport and referenced by zones.

### ZoneManager

Zones define regions via **Constructive Solid Geometry** (CSG):

- **Union** — combine figures to form a larger region
- **Intersection** — take the overlap of figures
- **Subtraction** — remove one figure's volume from another

Each zone is assigned a material. The `worldZone` is a special bounding zone that defines the simulation boundary.

### DetectorManager

Four detector types for scoring:

| Type | Geometry | Use Case |
|---|---|---|
| `Cylinder` | Cylindrical mesh | Depth-dose curves, radial profiles |
| `Mesh` | Rectangular grid | 2D/3D dose maps |
| `Zone` | Matches a zone's geometry | Score within a specific region |
| `All` | Entire simulation volume | Global scoring |

## Viewport

`ThreeEditor/js/viewport/ViewportManager.js` manages the 3D rendering:

### 4-Way Split View

The viewport supports a **quad-split** layout:

```
┌──────────────┬──────────────┐
│   Top (XY)   │   Top (XZ)   │
│              │              │
├──────────────┼──────────────┤
│  Side (YZ)   │ Perspective  │
│              │   (3D)       │
└──────────────┴──────────────┘
```

Each pane can be individually resized. The split is implemented using `split-grid`.

### Controls

- **Orbit controls** — rotate, pan, zoom the perspective view
- **Transform gizmos** — translate, rotate, and scale selected objects
- **Selection box** — click-to-select objects in any view
- **Grid helpers** — reference grid for spatial orientation
- **Camera helpers** — beam direction indicator

### CSG Clipping

The viewport supports **CSG clipped views** for cross-section visualization. This lets users see inside complex zone configurations.

## Sidebar

`ThreeEditor/components/Sidebar/EditorSidebar.tsx` provides a 3-tab sidebar:

### Geometry Tab

- **Figures** — tree view of all primitives, with add/remove/edit
- **Zones** — tree view of boolean zone definitions
- **Detectors** — tree view of scoring detectors
- **Special components** — modulators, CT cubes

### Scoring Tab

- **Outputs** — each output links a detector to scored quantities
- **Quantities** — dose, fluence, LET, etc.
- **Filters** — particle filters for conditional scoring

### Settings Tab

- **Beam** — particle type, energy, position, direction, divergence
- **Physics** — energy loss, nuclear reactions, scattering models

## Context Switching

`EditorContext.ts` manages which sidebar context is active:

| Context | Sidebar Content | Viewport Behavior |
|---|---|---|
| `geometry` | Figures, zones, detectors | Full 3D editing with gizmos |
| `scoring` | Outputs, quantities, filters | Detector geometry visualization |
| `settings` | Beam, physics | Beam direction visualization |

## Signals

The editor uses the `signals` library for event-driven communication between the imperative editor core and the React UI layer.

### Key Signals

| Signal | Triggered When |
|---|---|
| `objectAdded` | A new object is added to the scene |
| `objectRemoved` | An object is removed |
| `objectChanged` | An object's properties change |
| `objectSelected` | An object is clicked/selected |
| `zoneGeometryChanged` | A zone's CSG definition changes |
| `scoringQuantityChanged` | A scoring quantity is added/modified |
| `editorCleared` | The scene is completely cleared |
| `sceneGraphChanged` | The scene hierarchy changes |
| `historyChanged` | The undo/redo stack changes |

### React Bridge

Use the `useSignal` hook to subscribe to signals in React components:

```typescript
import { useSignal } from '../hooks/useSignal';

function MyComponent() {
  const [selectedObject, setSelectedObject] = useState(null);

  useSignal('objectSelected', (object) => {
    setSelectedObject(object);
  });

  return <div>{selectedObject?.name}</div>;
}
```

## Serialization

The editor serializes its entire state to a JSON format. This JSON:

- Is the input to the converter (JSON → simulator input files)
- Is auto-saved to `localStorage` on every change
- Can be exported/imported as `.json` files
- Is sent to the backend when submitting a simulation

The serialization captures:
- All figures with geometry, position, rotation
- Zone definitions (boolean operations + material assignments)
- Beam configuration
- Detector geometries
- Scoring outputs, quantities, and filters
- Physics settings
- Special components
