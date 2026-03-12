---
title: Pyodide Converter
description: How the Python converter runs in the browser via Pyodide WebAssembly.
---

The `yaptide-converter` Python package runs **in the browser** via Pyodide (Python compiled to WebAssembly). This enables real-time conversion of editor JSON to simulator input files without a server round-trip.

## Architecture

```
React UI Thread                    Web Worker Thread
┌────────────────────┐            ┌───────────────────────────┐
│ PythonConverterSvc │  comlink   │  PythonWorker.ts          │
│                    │ ◄────────► │                           │
│ convertJSON(       │            │  Pyodide runtime          │
│   editorJson,      │            │   └─ micropip             │
│   "shieldhit"      │            │       └─ yaptide_converter│
│ )                  │            │          .whl package     │
└────────────────────┘            └───────────────────────────┘
```

## Build Pipeline

### `buildPython.js`

Run via `npm run build-python`:

1. Creates a Python virtual environment
2. Installs Poetry in the venv
3. Builds the converter wheel:
   ```bash
   poetry build -f wheel
   ```
4. Copies the `.whl` file to `public/libs/converter/dist/`

The wheel is served as a static asset by the dev server / production build.

> Re-run `npm run build-python` whenever the converter code changes.

### Converter Source

The converter is included as a **Git submodule** at `src/libs/converter/` pointing to the converter repository. If the directory is empty:

```bash
git submodule update --init --recursive
```

## Runtime Initialization

### PythonWorker.ts

The Web Worker initializes Pyodide on first use:

```typescript
// Simplified initialization flow
async function initPyodide() {
  // 1. Load Pyodide from CDN
  // Note: version numbers in this example may differ from the current codebase
  const pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
  });

  // 2. Install micropip
  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip');

  // 3. Install the converter wheel from local static files
  await micropip.install('/libs/converter/dist/yaptide_converter-X.Y.Z-py3-none-any.whl');

  // 4. Import the converter API
  pyodide.runPython(`
    from converter.api import get_parser_from_str, run_parser
  `);

  return pyodide;
}
```

### PythonConverterService.tsx

The React context wraps the Web Worker with `comlink`:

```typescript
// Simplified service
const PythonConverterService = () => {
  const worker = useMemo(() => {
    const raw = new Worker(new URL('./PythonWorker.ts', import.meta.url));
    return Comlink.wrap(raw);
  }, []);

  const convertJSON = useCallback(async (editorJson, simType) => {
    return await worker.convertJSON(editorJson, simType);
  }, [worker]);

  return { convertJSON, isReady };
};
```

Usage in components:

```typescript
const { convertJSON } = usePythonConverter();

// Convert editor state to SHIELD-HIT12A input files
const files = await convertJSON(editor.toJSON(), 'shieldhit');
// files = { "beam.dat": "...", "mat.dat": "...", ... }
```

## Use Cases

### 1. Input File Preview

The **Input Files** tab shows the generated simulator input files in real-time as the user edits the scene:

```
User edits geometry → Editor JSON auto-updates → Pyodide converts → UI shows beam.dat, geo.dat, etc.
```

### 2. Geant4 Local Simulation

For in-browser Geant4 execution:

```
Editor JSON → Pyodide converter → geometry.gdml + run.mac → Geant4 Wasm Worker
```

### 3. Server-Side Fallback

When submitting to the backend (SHIELD-HIT12A, FLUKA), the backend runs the same converter server-side. The Pyodide version is primarily for preview and Geant4.

## Performance

- **First load**: ~5–10 seconds (downloading Pyodide + installing converter wheel)
- **Subsequent conversions**: ~100–500ms depending on scene complexity
- **Memory**: Pyodide typically uses 50–100 MB in the browser

The Web Worker thread prevents conversion from blocking the UI. The `comlink` library provides a clean async API.

## Troubleshooting

**Converter not loading:**
Check the browser console for Pyodide loading errors. Common causes:
- CDN blocked by network policy
- Wheel file not found at `/libs/converter/dist/`
- Run `npm run build-python` if the wheel is missing

**Stale conversion results:**
If you've updated the converter code, rebuild the wheel:
```bash
npm run build-python
```
Then hard-refresh the browser (Ctrl+Shift+R) to clear cached assets.
