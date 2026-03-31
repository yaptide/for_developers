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

#### Tooling

We use **Ruff** for both linting and formatting.

#### Example configuration (converter)

The converter repo uses Ruff via pre-commit:

```yaml
exclude: |
  (?x)^(
      tests/shieldhit/resources/expected_shieldhit_output/.*\.dat$|
      tests/shieldhit/resources/expected_shieldhit_output_with_sobp_dat/.*\.dat$|
      tests/shieldhit/test_shieldhit_config_mappings\.py$
  )

repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: end-of-file-fixer
      - id: trailing-whitespace
      - id: check-case-conflict
      - id: detect-private-key

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.15.7
    hooks:
      - id: ruff
        name: ruff check
        args: [ --fix ]
      - id: ruff-format
        name: ruff format

```

:::note
Some repositories may include additional checks (e.g. YAML validation, merge-conflict markers). Ruff remains the formatter/linter.
:::

#### Git blame after reformatting

Large automated refactors (like a formatter migration) can make `git blame` noisy. Repositories may include a `.git-blame-ignore-revs` file listing the reformat commits.

To enable it in your local clone:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

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
