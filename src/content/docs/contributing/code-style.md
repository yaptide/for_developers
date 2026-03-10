---
title: Code Style
description: Formatting and linting standards across YAPTIDE repositories.
---

Each repository enforces consistent code style through automated tools. CI will reject changes that don't conform.

## Python (Backend & Converter)

### Formatter — YAPF

Both the backend and converter use [YAPF](https://github.com/google/yapf) for Python formatting:

```bash
poetry run yapf --diff --recursive .    # Check formatting
poetry run yapf --in-place --recursive . # Auto-format
```

Configuration is in `pyproject.toml` or `.style.yapf` in the repo root.

### Import Sorting — isort

Imports are sorted with [isort](https://pycqa.github.io/isort/):

```bash
poetry run isort --check-only .
poetry run isort .
```

### Pre-Commit Hooks

Both Python repos use [pre-commit](https://pre-commit.com/) to run checks before every commit:

```bash
poetry run pre-commit install          # Install hooks (once)
poetry run pre-commit run --all-files  # Run manually
```

The `.pre-commit-config.yaml` typically includes:

| Hook | Purpose |
|---|---|
| `yapf` | Code formatting |
| `isort` | Import ordering |
| `trailing-whitespace` | Remove trailing spaces |
| `end-of-file-fixer` | Ensure newline at end of file |
| `check-yaml` | Validate YAML files |
| `check-merge-conflict` | Detect leftover merge markers |

### Type Hints

Use type hints on all public functions. The codebase supports Python 3.9+, so use `from __future__ import annotations` for modern syntax:

```python
from __future__ import annotations

def get_parser_from_str(parser_type: str) -> Parser:
    ...
```

## TypeScript (Frontend)

### Linter — ESLint

The frontend uses [ESLint](https://eslint.org/) with a configuration extending CRA defaults:

```bash
npm run lint          # Check for issues
npm run lint -- --fix # Auto-fix where possible
```

### Formatter — Prettier

[Prettier](https://prettier.io/) handles all formatting for TypeScript, JSON, CSS, and Markdown:

```bash
npx prettier --check "src/**/*.{ts,tsx}"
npx prettier --write "src/**/*.{ts,tsx}"
```

Key Prettier settings (from `package.json` or `.prettierrc`):

| Setting | Value |
|---|---|
| Print width | 100 |
| Tab width | 4 (tabs) |
| Single quotes | Yes |
| Trailing commas | `es5` |
| Semicolons | Yes |

### TypeScript Strict Mode

The frontend uses `"strict": true` in `tsconfig.json`. This enables:

- `strictNullChecks` — no implicit `null` / `undefined`
- `noImplicitAny` — all values must have explicit or inferred types
- `strictFunctionTypes` — stricter function subtyping

**Do not use `any`.** Use `unknown` with type guards instead:

```typescript
// Bad
function parse(data: any) { ... }

// Good
function parse(data: unknown): SimulationResult {
    if (!isSimulationResult(data)) throw new Error("Invalid data");
    return data;
}
```

### Import Conventions

Group imports in this order, separated by blank lines:

1. React and framework imports
2. Third-party libraries
3. Local modules (absolute paths from `src/`)
4. Relative imports
5. Type-only imports

```typescript
import { useEffect, useState } from 'react';

import { Box, Button } from '@mui/material';

import { YaptideEditor } from '../ThreeEditor/js/YaptideEditor';

import type { SimulationResult } from '../types/ResponseTypes';
```

## General Conventions

### Naming

| Element | Convention | Example |
|---|---|---|
| Python variables / functions | `snake_case` | `parse_configs` |
| Python classes | `PascalCase` | `ShieldhitParser` |
| Python constants | `UPPER_SNAKE_CASE` | `DEFAULT_ENERGY` |
| TypeScript variables / functions | `camelCase` | `parseConfigs` |
| TypeScript classes / components | `PascalCase` | `SimulationPanel` |
| TypeScript constants | `UPPER_SNAKE_CASE` | `DEFAULT_TIMEOUT` |
| CSS classes | `kebab-case` | `card-grid` |
| File names (Python) | `snake_case.py` | `beam_config.py` |
| File names (TypeScript) | `PascalCase.tsx` or `camelCase.ts` | `SimulationPanel.tsx` |

### Comments

- Write comments for **why**, not **what**. The code shows what; comments explain intent.
- Use docstrings for all public functions and classes (Python).
- Use JSDoc for complex exported functions (TypeScript).

### Error Messages

Include context in error messages:

```python
# Bad
raise ValueError("Invalid value")

# Good
raise ValueError(f"Unknown parser type: '{parser_type}'. Expected one of: shieldhit, fluka, geant4, topas")
```
