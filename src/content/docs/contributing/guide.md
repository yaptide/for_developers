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

### 3. Push and Open PR

```bash
git push origin feature/my-change
```

Open a pull request on GitHub against `master`. Include:

- **What** the change does (one sentence)
- **Why** it's needed
- **How** to test it
- Link to any related issues

### 4. Code Review

- At least one approval is required before merge.
- CI must pass: tests, linting, type checks.

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
| Build | Docker image | `npm run build` | — |
