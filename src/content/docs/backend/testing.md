---
title: Backend Testing
description: Test structure, fixtures, and how to write tests for the YAPTIDE backend.
---

The backend uses **pytest** with an in-memory SQLite database and an in-memory Celery broker. No external services are required to run tests.

## Running Tests

```bash
cd yaptide
poetry run pytest
```

With verbose output:

```bash
poetry run pytest -v
```

Run a specific test file:

```bash
poetry run pytest tests/test_database.py
```

Run a specific test:

```bash
poetry run pytest tests/test_database.py::test_create_user -v
```

## Test Configuration

Test settings are defined in `pytest.ini`:

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_functions = test_*
```

Key differences from production:
- **Database**: in-memory SQLite (no PostgreSQL required)
- **Celery broker**: `memory://` (no Redis required)
- **Celery backend**: `cache+memory://` (no Redis required)

## Fixtures

Fixtures are defined in `tests/conftest.py` and provide the test infrastructure.

### `app`

Creates a Flask application configured for testing:

```python
@pytest.fixture
def app():
    # Creates app with SQLite in-memory DB
    # Applies all migrations
    # Returns the configured Flask app
```

### `client`

A Flask test client for making HTTP requests:

```python
@pytest.fixture
def client(app):
    return app.test_client()
```

### Sample Data Fixtures

Pre-built JSON payloads for simulation submission:

| Fixture | Description |
|---|---|
| `shieldhit_editor_payload` | SHIELD-HIT12A simulation from editor JSON |
| `shieldhit_files_payload` | SHIELD-HIT12A simulation from raw input files |
| `fluka_editor_payload` | FLUKA simulation from editor JSON |
| `fluka_files_payload` | FLUKA simulation from raw input files |

These fixtures load JSON from `tests/res/` resource files.

## Test Categories

### Unit Tests

| File | What it Tests |
|---|---|
| `test_main.py` | App creation, health check endpoint (`GET /`) |
| `test_database.py` | SQLAlchemy model CRUD (create, read, update, delete) |
| `test_keycloak_tokens.py` | Keycloak token validation and parsing |
| `test_encrypt_decrypt.py` | AES encryption/decryption for simulator binaries |
| `test_prepare_simulation.py` | Input conversion logic (editor JSON → simulator files) |
| `test_download_shieldhit.py` | SHIELD-HIT12A binary download from S3 |
| `test_download_fluka.py` | FLUKA binary download from S3 |
| `test_download_topas.py` | TOPAS binary download from S3 |

### Integration Tests

Located in `tests/integration/`:

| File | What it Tests |
|---|---|
| `test_run_simulation.py` | Full simulation lifecycle: submit → run → merge → retrieve results |
| `test_cancel_simulation.py` | Simulation cancellation flow |
| `test_user_management.py` | User registration, login, session management |
| `test_celery_tasks.py` | Celery task dispatch and completion |
| `test_simulation_deletion.py` | Simulation and result cleanup |
| `test_environment.py` | Environment variable handling |

## Writing New Tests

### Basic Pattern

```python
def test_health_check(client):
    """Test that the health check endpoint returns 200."""
    response = client.get("/")
    assert response.status_code == 200
```

### Authenticated Tests

Most endpoints require authentication. Use the login fixture:

```python
def test_submit_simulation(client):
    # Register and log in
    client.put("/auth/register", json={
        "username": "testuser",
        "password": "testpass"
    })
    client.post("/auth/login", json={
        "username": "testuser",
        "password": "testpass"
    })

    # Now authenticated via cookies
    response = client.post("/jobs/direct", json={
        "sim_data": { ... },
        "ntasks": 1,
        "sim_type": "shieldhit"
    })
    assert response.status_code == 202
```

### Database Tests

```python
def test_create_simulation(app):
    with app.app_context():
        from yaptide.persistence.models import SimulationModel, UserModel

        user = UserModel(username="test")
        db.session.add(user)
        db.session.commit()

        sim = SimulationModel(
            job_id="test-123",
            user_id=user.id,
            sim_type="shieldhit"
        )
        db.session.add(sim)
        db.session.commit()

        assert SimulationModel.query.count() == 1
```

## Pre-Commit Hooks

The project uses pre-commit for code quality:

```bash
poetry run pre-commit install
poetry run pre-commit run --all-files
```

Hooks include:
- **YAPF** — Python formatter (120-char line length)
- **pycodestyle** — PEP 8 style checking
- Standard pre-commit hooks (trailing whitespace, end of file, etc.)
