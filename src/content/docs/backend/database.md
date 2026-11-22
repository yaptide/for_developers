---
title: Database
description: Data model, schema, and migration workflow for the YAPTIDE backend.
---

The backend uses **PostgreSQL** via **SQLAlchemy** with **Flask-Migrate** (Alembic) for schema management. In tests, an in-memory SQLite database is used.

## Data Model

The database contains **12 tables** organized around users, simulations, tasks, and results.

### Entity Relationships

```
UserModel (polymorphic)
├── YaptideUserModel
└── KeycloakUserModel

UserModel ──< SimulationModel (polymorphic)
                ├── CelerySimulationModel
                └── BatchSimulationModel

SimulationModel ──< TaskModel (polymorphic)
                      ├── CeleryTaskModel
                      └── BatchTaskModel

SimulationModel ──< InputModel
SimulationModel ──< EstimatorModel ──< PageModel ──o PageObjectModel
SimulationModel ──< LogfilesModel

ClusterModel ──< BatchSimulationModel
```

## Tables

### User Tables

**`User`** — base user table with polymorphic inheritance on `auth_provider`.

| Column | Type | Description |
|---|---|---|
| `id` | Integer (PK) | Auto-incremented user ID |
| `username` | String | Unique username |
| `auth_provider` | String | `"yaptide"` or `"keycloak"` (discriminator) |

**`YaptideUser`** — native auth users.

| Column | Type | Description |
|---|---|---|
| `id` | Integer (FK → User) | |
| `password_hash` | String | Werkzeug PBKDF2 hash |

**`KeycloakUser`** — Keycloak/PLGrid users.

| Column | Type | Description |
|---|---|---|
| `id` | Integer (FK → User) | |
| `cert` | Text | SSH certificate (PEM) |
| `private_key` | Text | SSH private key (PEM) |

### Simulation Tables

**`Simulation`** — base simulation table with polymorphic inheritance on `platform`.

| Column | Type | Description |
|---|---|---|
| `id` | Integer (PK) | Auto-incremented |
| `job_id` | String | UUID, used as the external identifier |
| `user_id` | Integer (FK → User) | Owner |
| `title` | String | Simulation title |
| `platform` | String | `"DIRECT"` or `"BATCH"` (discriminator) |
| `input_type` | String | `"editor"` or `"files"` |
| `sim_type` | String | `"shieldhit"`, `"fluka"`, `"topas"` |
| `job_state` | String | Current state (see lifecycle) |
| `start_time` | DateTime | Job submission time |
| `end_time` | DateTime | Job completion time |
| `update_key_hash` | String | Hashed JWT for worker auth |

**`CelerySimulation`** — direct (Celery) simulations.

| Column | Type | Description |
|---|---|---|
| `id` | Integer (FK → Simulation) | |
| `merge_id` | String | Celery task ID for the merge step |

**`BatchSimulation`** — batch (Slurm) simulations.

| Column | Type | Description |
|---|---|---|
| `id` | Integer (FK → Simulation) | |
| `cluster_id` | Integer (FK → Cluster) | Target HPC cluster |
| `job_dir` | String | Remote working directory on cluster |
| `array_id` | String | Slurm array job ID |
| `collect_id` | String | Slurm collect job ID |

### Task Tables

**`Task`** — individual simulation tasks within a job.

| Column | Type | Description |
|---|---|---|
| `id` | Integer (PK) | |
| `task_id` | Integer | 0-based task index |
| `simulation_id` | Integer (FK → Simulation) | |
| `task_state` | String | Task state |
| `requested_primaries` | BigInteger | Target number of primaries |
| `simulated_primaries` | BigInteger | Completed primaries |
| `estimated_time` | Integer | Estimated remaining seconds |
| `start_time` | DateTime | |
| `end_time` | DateTime | |

**`CeleryTask`** — Celery-specific task data.

| Column | Type | Description |
|---|---|---|
| `id` | Integer (FK → Task) | |
| `celery_id` | String | Celery task UUID |

**`BatchTask`** — batch-specific task data (minimal, inherits from Task).

### Result Tables

**`Input`** — stores simulation input files.

| Column | Type | Description |
|---|---|---|
| `id` | Integer (PK) | |
| `simulation_id` | Integer (FK → Simulation) | |
| `compressed_data` | LargeBinary | gzip-compressed JSON (file dict) |

**`Estimator`** — named result containers.

| Column | Type | Description |
|---|---|---|
| `id` | Integer (PK) | |
| `simulation_id` | Integer (FK → Simulation) | |
| `name` | String | Estimator name |
| `file_name` | String | Original filename |
| `compressed_data` | LargeBinary | gzip-compressed metadata |

**`Page`** — individual scoring dimensions within an estimator.

| Column | Type | Description |
|---|---|---|
| `id` | Integer (PK) | |
| `estimator_id` | Integer (FK → Estimator) | |
| `page_number` | Integer | 0-based page index |
| `page_name` | String | Descriptive name |
| `page_dimension` | Integer | Number of dimensions |
| `compressed_data` | LargeBinary | Empty for pages in the results bucket. Pages stored before the bucket keep their gzip-compressed JSON (axes, values) here until `db_manage copy-pages-to-storage` and `clear-pages-in-postgres` move them |

**`PageObject`** — where a page is in the results bucket (one row per page at most).

| Column | Type | Description |
|---|---|---|
| `page_id` | Integer (PK, FK → Page, cascade) | |
| `key` | String | Prefix of the page's objects, `simulations/<sim>/<estimator file>/<page>/<revision>/` |
| `size` | Integer | Size of the page's objects in bytes |
| `format` | String | `zarr-v3` |

The page's values are only in the bucket, so the `PageObject` migration (`9e2b41c7d5a3`) refuses to downgrade while
the table has rows: `db_manage move-pages-to-postgres` brings the pages back first. See
[Result Storage](/for_developers/backend/result-storage/).

**`Logfiles`** — simulation log output.

| Column | Type | Description |
|---|---|---|
| `id` | Integer (PK) | |
| `simulation_id` | Integer (FK → Simulation) | |
| `compressed_data` | LargeBinary | gzip-compressed log text |

### Cluster Table

**`Cluster`** — registered HPC clusters.

| Column | Type | Description |
|---|---|---|
| `id` | Integer (PK) | |
| `cluster_name` | String | e.g., `"ares"`, `"prometheus"` |

## Data Compression

Result pages are not in the database: they are Zarr arrays in the results bucket, each chunk compressed with zstd
([Result Storage](/for_developers/backend/result-storage/)). The other large binary fields use gzip compression:

```python
from yaptide.persistence.models import compress, decompress

# Store
model.compressed_data = compress(json.dumps(data).encode())

# Retrieve
data = json.loads(decompress(model.compressed_data).decode())
```

This reduces storage for inputs, estimator metadata and logs.

## Migration Workflow

The project uses **Flask-Migrate** (Alembic) for schema changes. Migrations live in `migrations/versions/`.

### Migrations on Start

The database is brought to the current models when the Flask container starts, before gunicorn starts its workers
(`run_flask.sh` calls `prepare_database` from `yaptide/persistence/models.py`):

- A database with an `alembic_version` table is upgraded to the latest revision (`flask db upgrade`).
- A database without it (a new one, or one whose tables were only ever created from the models) gets the missing
  tables from the models and is stamped with the latest revision, so later migrations apply to it.

The application never creates tables on import. The same step can be run by hand, e.g. for local development:

```bash
poetry run flask --app yaptide.application prepare-db
```

### Writing Migrations

Every migration must be **reversible** and **independent of the current models**:

- `downgrade()` undoes `upgrade()`, so a deployment can go back to the previous revision.
- A migration never imports `yaptide.persistence.models`. The models follow the latest revision, and a migration runs
  against a database at its own revision. A data migration describes the tables it reads and writes as they are at
  its revision, with `sa.table(...)` / `sa.column(...)`, and works through `op.get_bind()` (see
  `migrations/versions/41149fa64bd2_.py` and `5003b9acb1f4_.py`).
- Use `op.batch_alter_table` for column changes, so they also run on SQLite. `migrations/env.py` turns SQLite's
  foreign keys off during migrations, as batch operations recreate tables there.

### Creating a New Migration

1. Modify `persistence/models.py`
2. Generate the migration against a database at the latest revision:
   `poetry run flask --app yaptide.application db migrate -m "description"`
3. Review the generated script in `migrations/versions/`, write its `downgrade()` and any data migration
4. Run `tests/test_migrations.py` against PostgreSQL (see [Testing → Migration Tests](/for_developers/backend/testing/#migration-tests))
5. Commit the migration file alongside the model changes

### Production Migration

> Always back up the database before deploying a version with new migrations.

```bash
# Backup
docker compose exec postgresql pg_dump -U yaptide yaptide > backup.sql
```

The new migrations are applied when the new `yaptide_flask` container starts. To go back one revision before
deploying the previous version:

```bash
docker compose exec yaptide_flask flask --app yaptide.application db downgrade
```

### Testing Migrations

`tests/test_migrations.py` runs every migration up and down on an empty PostgreSQL database and checks that the data
migrations carry existing rows over. To test a migration against a copy of the production database:

1. Dump production: `pg_dump -U yaptide yaptide > prod_backup.sql`
2. Load into a test database: `psql -U yaptide test_db < prod_backup.sql`
3. Point `FLASK_SQLALCHEMY_DATABASE_URI` at the test DB
4. Run `flask --app yaptide.application db upgrade`, then `db downgrade` back to the previous revision
5. Verify the application works correctly

## Database Access from Outside Docker

When running the database in Docker, access it with pgAdmin or `psql`:

```bash
# Direct psql access
docker compose exec postgresql psql -U yaptide yaptide

# Or with the develop compose file (includes pgAdmin on port 9999)
docker compose -f docker-compose.yml -f docker-compose-develop.yml up -d
# Open http://localhost:9999, login with admin@admin.com / admin
```
