---
title: Code Style
description: Formatting and linting standards across YAPTIDE repositories.
---

Each repository enforces consistent code style through automated tools. CI will reject changes that don't conform.

## General Conventions

### Naming

Use standard naming conventions for Python and TypeScript. Use a `_unit` suffix in time-related variables e.g. `max_idle_seconds`. 

### Type Hints

Use type hints on all public functions both in Python and in TypeScript e.g.:

```py
def get_user(id: int) -> User:
```

```ts
export const getUser = (id: number): User => { ... }
```

### Comments

Use **docstrings** or **JSDocs** for all complex functions and classes. Each docstring must include an `Args:` section that explicitly defines the purpose of every parameter e.g.:

```py
def log_generator(thefile: TextIOWrapper,
                  event: threading.Event = None,
                  max_idle_seconds: float = 3600,
                  polling_interval_seconds: float = 1) -> Iterator[str]:
    """
    Generator equivalent to `tail -f` Linux command.
    Yields new lines appended to the end of the file.
    Main purpose is monitoring of the log files.

    Args:
        thefile: File object to read from.
        event: Threading event to signal when to stop the generator.
        max_idle_seconds: Maximum time to wait for new data before raising TimeoutError.
        polling_interval_seconds: Interval between successive file polls while no new data is available.
    """
```

:::note
While older segments of the codebase may lack this detail, we are enforcing this format moving forward to improve readability and developer onboarding.
:::

## Python (Backend & Converter)

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

## TypeScript (Frontend)

### Linter — ESLint

The frontend uses [ESLint](https://eslint.org/) with a configuration extending CRA defaults:

```bash
npm run lint          # Check for issues
npm run lint -- --fix # Auto-fix where possible
```

### Formatter — Prettier

[Prettier](https://prettier.io/) handles all formatting for TypeScript, JSON, CSS, and Markdown. To apply formatting use:

```bash
npm run format
```
