---
title: API Reference
description: Overview of the YAPTIDE REST API.
---

The YAPTIDE backend exposes a RESTful JSON API built with Flask-RESTful. All endpoints are registered in a single `initialize_routes()` function.

## Base URL

```
https://<your-host>/
```

In a local Docker Compose setup: `http://localhost/`

## Authentication

Most endpoints require a valid JWT access token. The token is sent as an HTTP-only cookie named `access_token`, set automatically on login.

Two authentication modes:

| Mode | Login Endpoint | Token Source |
|---|---|---|
| **Native** | `POST /auth/login` | Backend-issued JWT |
| **Keycloak SSO** | `POST /auth/keycloak` | Keycloak JWT exchanged for backend JWT |

Protected endpoints return `401 Unauthorized` if no valid token is present.

## Endpoint Groups

| Group | Prefix | Description |
|---|---|---|
| [Auth](/docs/api-reference/auth/) | `/auth/*` | Registration, login, logout, token refresh |
| [Jobs](/docs/api-reference/jobs/) | `/jobs/*` | Submit, monitor, and cancel simulations |
| [Results](/docs/api-reference/results/) | `/results`, `/estimators`, `/inputs`, `/logfiles` | Retrieve simulation output |
| [User](/docs/api-reference/user/) | `/user/*`, `/clusters` | User profile and cluster management |

## Common Patterns

### Response Format

All responses return JSON. Successful responses include a `message` field:

```json
{
    "message": "...",
    ...
}
```

Error responses include `message` and often `status_code`:

```json
{
    "message": "Description of what went wrong",
    "status_code": 400
}
```

### Query Parameters vs Body

- **GET** and **DELETE** endpoints use query parameters.
- **POST** and **PUT** endpoints accept a JSON request body.

### Internal Endpoints

Some endpoints are **worker-facing only** — called by Celery simulation workers or batch polling helpers to report progress back to the backend:

| Endpoint | Purpose |
|---|---|
| `POST /jobs` | Update job state |
| `POST /results` | Upload simulation results |
| `POST /logfiles` | Upload log files |
| `POST /tasks` | Update individual task state |

These require an `update_key` (shared secret) rather than user authentication.

## Quick Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | No | Health check |
| PUT | `/auth/register` | No | Register user |
| POST | `/auth/login` | No | Log in |
| GET | `/auth/refresh` | Yes | Refresh token |
| GET | `/auth/status` | Yes | Current user info |
| DELETE | `/auth/logout` | Yes | Log out |
| POST | `/auth/keycloak` | No* | Keycloak login |
| DELETE | `/auth/keycloak` | Yes | Keycloak logout |
| POST | `/jobs/direct` | Yes | Submit direct job |
| GET | `/jobs/direct` | Yes | Get direct job status |
| DELETE | `/jobs/direct` | Yes | Cancel direct job |
| POST | `/jobs/batch` | Yes† | Submit batch job |
| GET | `/jobs/batch` | Yes† | Get batch job status |
| DELETE | `/jobs/batch` | Yes† | Cancel batch job |
| GET | `/jobs` | Yes | Get job status (DB) |
| GET | `/results` | Yes | Get results |
| GET | `/estimators` | Yes | Get estimator metadata |
| GET | `/inputs` | Yes | Get input config |
| GET | `/logfiles` | Yes | Get log files |
| GET | `/user/simulations` | Yes | List user's simulations |
| DELETE | `/user/simulations` | Yes | Delete a simulation |
| POST | `/user/update` | Yes | Update profile |
| GET | `/clusters` | Yes† | List HPC clusters |

\* Requires a valid Keycloak token in the request body.
† Requires Keycloak authentication (PLGrid access).
