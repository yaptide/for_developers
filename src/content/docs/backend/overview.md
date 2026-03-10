---
title: Backend Overview
description: Architecture and structure of the YAPTIDE Flask backend.
---

The backend is a **Flask** API server that handles authentication, simulation job orchestration, and result persistence. It uses **Celery** for async task execution and **PostgreSQL** for storage.

## Tech Stack

| Component | Technology |
|---|---|
| Web framework | Flask + Flask-RESTful |
| Task queue | Celery (Redis broker, eventlet pool) |
| Database | PostgreSQL via SQLAlchemy + Flask-SQLAlchemy |
| Migrations | Flask-Migrate (Alembic) |
| Auth | JWT (PyJWT), Keycloak OIDC |
| Reverse proxy | Nginx (TLS) |
| Packaging | Poetry |

## Directory Structure

```
yaptide/
├── yaptide/
│   ├── __init__.py
│   ├── application.py          # Flask app factory
│   ├── routes/
│   │   ├── main_routes.py      # Route registration
│   │   ├── auth_routes.py      # Native auth (register/login/refresh)
│   │   ├── keycloak_routes.py  # Keycloak SSO auth
│   │   ├── simulation_routes.py # Jobs (direct + batch)
│   │   ├── result_routes.py    # Results, estimators, logfiles
│   │   ├── user_routes.py      # User simulation management
│   │   └── utils/
│   │       └── decorators.py   # @requires_auth decorator
│   ├── persistence/
│   │   ├── models.py           # SQLAlchemy models (12 tables)
│   │   └── db_methods.py       # Database access layer
│   ├── celery/
│   │   ├── simulation_worker.py # Celery app + run_single_simulation task
│   │   └── helper_worker.py     # Batch submission + cleanup tasks
│   ├── batch/
│   │   ├── batch_methods.py    # SSH connection + Slurm job management
│   │   └── watcher_scripts/    # Scripts deployed to HPC clusters
│   ├── utils/
│   │   ├── enums.py            # PlatformType, EntityState, InputType
│   │   └── sim_utils.py        # Simulation preparation utilities
│   └── admin/
│       ├── db_manage.py        # CLI: user management
│       └── simulators.py       # CLI: simulator binary management
├── migrations/
│   └── versions/               # Alembic migration scripts
├── tests/
│   ├── conftest.py             # Fixtures (Flask app, test client, sample data)
│   ├── integration/            # Full-stack tests
│   └── ...                     # Unit tests
├── pyproject.toml
├── pytest.ini
└── docker-compose.yml
```

## Core Concepts

### Flask App Factory

The app is created via `yaptide.application` using the Flask factory pattern. It initializes:
- SQLAlchemy database connection
- Flask-Migrate for schema migrations
- Flask-RESTful for REST endpoint routing
- CORS (when `FLASK_USE_CORS=true`)
- JWT secret key for token signing

### Route Registration

All routes are registered in `routes/main_routes.py`. Each route is a Flask-RESTful `Resource` class with `get()`, `post()`, `put()`, `delete()` methods.

### Celery Workers

Two Celery workers with separate queues:

| Worker | Queue(s) | Responsibility |
|---|---|---|
| **simulation_worker** | `celery` | Run simulator binaries, monitor progress, merge results |
| **helper_worker** | `helper`, `helper-short` | Submit batch jobs to HPC, handle cleanup |

Workers communicate back to Flask via HTTP callbacks (`POST /tasks`, `POST /results`).

### Data Compression

All large data (input files, simulation results, logs) is **gzip-compressed** before storage in PostgreSQL. The `compress()` and `decompress()` helpers handle this transparently.

## Key Environment Variables

| Variable | Description |
|---|---|
| `FLASK_SQLALCHEMY_DATABASE_URI` | PostgreSQL connection string |
| `CELERY_BROKER_URL` | Redis broker URL |
| `CELERY_RESULT_BACKEND` | Redis result backend URL |
| `BACKEND_INTERNAL_URL` | Flask URL for worker callbacks |
| `BACKEND_EXTERNAL_URL` | Public-facing URL |
| `FLASK_USE_CORS` | Enable CORS for local dev |
| `KEYCLOAK_BASE_URL` | Keycloak server URL |
| `KEYCLOAK_REALM` | Keycloak realm |
| `CERT_AUTH_URL` | PLGrid SSH cert service URL |
| `MAX_CORES` | CPU limit for simulation worker |
| `LOG_LEVEL_ROOT` | Logging verbosity |

## Related Pages

- [API Endpoints](/for_developers/backend/api-endpoints/) — walkthrough of all REST routes
- [Database](/for_developers/backend/database/) — data model and migrations
- [Simulation Lifecycle](/for_developers/backend/simulation-lifecycle/) — job state machine
- [Docker Deployment](/for_developers/backend/docker-deployment/) — containerized setup
