---
title: Contributing
description: How to contribute to the YAPTIDE project.
---

YAPTIDE is spread across multiple repositories. This guide covers the shared workflow for contributing to any of them.

## Repositories

| Repository | Description |
|---|---|
| [`yaptide`](https://github.com/yaptide/yaptide) | Backend — Flask API, Celery workers, database |
| [`ui`](https://github.com/yaptide/ui) | Frontend — React editor, Three.js viewport |
| [`converter`](https://github.com/yaptide/converter) | Python converter — JSON to simulator input |

## Branching Strategy

All repositories follow a **feature-branch** workflow:

1. **`master`** (or `main`) — stable, deployable code. Protected branch.
2. **Feature branches** — branch off `master` for each change.
3. **Pull requests** — all changes go through PR review before merge.

### Branch Naming

Use descriptive names with a category prefix:

```
feature/add-topas-scoring
fix/beam-energy-unit-conversion
docs/update-api-endpoints
refactor/split-detect-config
```

## Pull Request Workflow

### 1. Fork and Branch

```bash
git clone https://github.com/yaptide/<repo>.git
cd <repo>
git checkout -b feature/my-change
```

### 2. Make Changes

- Write code following the [code style guide](/docs/contributing/code-style/).
- Add or update tests.
- Update documentation if behaviour changes.

### 3. Commit

Write clear, descriptive commit messages:

```
Add cylindrical detector support to FLUKA converter

- Parse cylinder detector type from JSON
- Generate USRBIN card with cylindrical binning
- Add golden-file test with expected output
```

### 4. Push and Open PR

```bash
git push origin feature/my-change
```

Open a pull request on GitHub against `master`. Include:

- **What** the change does (one sentence)
- **Why** it's needed
- **How** to test it
- Link to any related issues

### 5. Code Review

- At least one approval is required before merge.
- Address review comments by pushing new commits (don't force-push during review).
- CI must pass: tests, linting, type checks.

### 6. Merge

Use **squash merge** for feature branches to keep the main branch history clean.

## Development Setup

See the setup guides for each component:

- [Backend setup](/docs/get-started/dev-setup-backend/)
- [Frontend setup](/docs/get-started/dev-setup-frontend/)
- [Converter setup](/docs/get-started/dev-setup-converter/)

## Issue Tracking

Issues are tracked in the respective GitHub repositories. When opening an issue:

- Use a descriptive title.
- Include steps to reproduce (for bugs).
- Include the expected vs actual behaviour.
- Tag with appropriate labels (`bug`, `enhancement`, `docs`).

## CI / CD

Each repository has GitHub Actions workflows that run on pull requests:

| Check | Backend | Frontend | Converter |
|---|---|---|---|
| Unit tests | `pytest` | `jest` | `pytest` |
| Linting | `pre-commit` | `eslint` | `pre-commit` |
| Type checking | — | TypeScript | — |
| Build | Docker image | `npm run build` | — |
