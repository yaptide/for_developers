---
title: Results Loading
description: How the frontend fetches result pages, reads pages stored as Zarr, and loads 2D and 3D pages when they come into view.
---

A simulation's results are split into **estimators**, and each estimator into **pages**. A page holds one quantity on a grid of 0, 1, 2 or 3 dimensions. The remote simulation service (`RemoteWorkerSimulationService.ts`) fetches pages from the backend's `GET /results` endpoint, either all at once or a list of pages of one estimator.

## Inline and Stored Pages

The backend sends each page in one of two forms:

| Form | What the response holds | How the UI reads it |
|---|---|---|
| **Inline** | The page itself as JSON | Used as it is |
| **Stored** | `{pageNumber, url, format: "zarr-v3", files: {"zarr.json": <url>, "c/0": <url>}}`: signed links to a Zarr array in object storage | Fetched and decoded by `storedPages.ts` |

Both forms can be mixed, even within one estimator. A stored page in a format other than `zarr-v3` is rejected with an error.

### Reading a Zarr Page

`resolveStoredPages(pages, signal)` replaces every stored page with the page itself, fetching them in parallel:

1. `zarr.json` and the shard `c/0` are fetched from their signed links with plain `ky`, not the logged-in client, so no credentials are sent to storage.
2. The page metadata (name, axes, unit and so on) comes from `zarr.json`'s `attributes.yaptide_page`, converted from snake_case to camelCase like the API responses.
3. The values come from the shard: `float32`, split into chunks, each compressed with **zstd** (decoded with `fzstd`), **gzip** (the browser's `DecompressionStream`) or stored **raw**. The shard ends with an index of `(offset, size)` per chunk.
4. A chunk left out of the shard (index entry `0xffffffffffffffff`) holds zeros. A page without values has no shard: its link answers 404, and the page reads as zeros.

The values are stored as `float32`, while inline JSON pages hold `float64`, so values differ from the inline ones only within `float32` precision.

The backend writer is `yaptide/batch/result_format.py`. The test fixture `src/services/__fixtures__/zarrPages.json` holds pages written by it.

### Requests

- Signed links and `/results` requests have **no timeout**: a 3D group can be several MB and take long on a slow link. The abort signal still stops them.
- Signed links are retried twice. An expired signature answers 403, and the load fails with an error.

## Loading 2D and 3D Pages When Shown

An estimator's pages are grouped by dimension (`util/lazyPages.ts`):

- **0D and 1D pages** (values and lines) load together with the estimator, when its tab is opened.
- **2D and 3D pages** (maps and volumes) load only when their place in the results scrolls into view. Opening a depth-dose line does not download the heatmap below it.

`ResultsPanel.tsx` renders a `LazyPageGroup` placeholder for each group not loaded yet. The placeholder uses an `IntersectionObserver` and asks for its group once, when it comes into view. An estimator made only of maps loads at once, because its placeholder is in view from the start.

Each group has one of these states, per simulation, estimator and dimension:

| State | Placeholder shows | Loads by itself |
|---|---|---|
| Not loaded | "2D results: names" and a **Load** button | Yes, when in view |
| Loading | A spinner | No |
| Loaded | The plots | — |
| Failed | "Could not load the 2D results: names" and the **Load** button | No: only the button tries again |

Pages that arrive after another simulation was opened are dropped, so a slow load never shows in the wrong simulation.

Geant4 simulations run in the browser are shown whole, without placeholders. "Save to file" fetches every page of the simulation, so the saved file always holds all of them, 2D and 3D included.
