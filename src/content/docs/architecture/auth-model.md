---
title: Authentication Model
description: How authentication and authorization work across the YAPTIDE system.
---

YAPTIDE supports two authentication methods: **native Yaptide auth** (username/password) and **Keycloak SSO** (PLGrid federation). Both issue JWT tokens stored in httpOnly cookies.

## Authentication Methods

| Method | When Used | Users |
|---|---|---|
| **Yaptide Native** | Development, standalone deployments | Any registered user |
| **Keycloak SSO** | Production, PLGrid-integrated deployments | PLGrid-federated users |

## Native Authentication Flow

Simple username/password registration and login. Passwords are hashed with Werkzeug's security module.

```
┌──────────┐                           ┌─────────┐
│    UI    │                           │ Backend │
└────┬─────┘                           └────┬────┘
     │                                      │
     │  PUT /auth/register                  │
     │  { username, password }              │
     │─────────────────────────────────────>│
     │                                      │ Hash password
     │                                      │ Create YaptideUserModel
     │  201 Created                         │
     │<─────────────────────────────────────│
     │                                      │
     │  POST /auth/login                    │
     │  { username, password }              │
     │─────────────────────────────────────>│
     │                                      │ Verify password hash
     │                                      │ Generate JWT access + refresh tokens
     │  200 OK                              │
     │  Set-Cookie: access_token (httpOnly) │
     │  Set-Cookie: refresh_token (httpOnly)│
     │  Body: { access_exp }                │
     │<─────────────────────────────────────│
     │                                      │
     │  GET /auth/refresh                   │
     │  Cookie: refresh_token               │
     │─────────────────────────────────────>│
     │                                      │ Validate refresh token
     │                                      │ Generate new access token
     │  200 OK                              │
     │  Set-Cookie: access_token (httpOnly) │
     │<─────────────────────────────────────│
```

### Token Lifecycle

| Token | Lifetime | Storage |
|---|---|---|
| Access token | 10 minutes | httpOnly cookie |
| Refresh token | 120 minutes | httpOnly cookie |
| Simulation update key | 7 days | Backend internal |

The UI auto-refreshes the access token at **1/3 of its lifetime** (approximately every 3 minutes) by hitting `GET /auth/refresh`.

## Keycloak SSO Flow

Used for PLGrid-integrated deployments. The UI manages the Keycloak session, then exchanges the Keycloak token with the backend for a local JWT.

```
┌──────────┐        ┌───────────┐        ┌──────────┐
│    UI    │        │ Keycloak  │        │ Backend  │
└────┬─────┘        └─────┬─────┘        └────┬─────┘
     │                    │                   │
     │  OIDC login (PKCE S256)                │
     │  Redirect to Keycloak                  │
     │───────────────────>│                   │
     │                    │                   │
     │  User authenticates│                   │
     │  (PLGrid credentials)                  │
     │<───────────────────│                   │
     │  Keycloak tokens   │                   │
     │  (access + refresh)│                   │
     │                    │                   │
     │  POST /auth/keycloak                   │
     │  Authorization: Bearer <keycloak_token>│
     │───────────────────────────────────────>│
     │                                        │
     │            Validate token against      │
     │            Keycloak JWKS endpoint      │
     │            Check PLG_YAPTIDE_ACCESS    │
     │            Fetch SSH certificates      │
     │            Create/update KeycloakUser  │
     │            Generate local JWT          │
     │                                        │
     │  200 OK                                │
     │  Set-Cookie: access_token (httpOnly)   │
     │  Set-Cookie: refresh_token (httpOnly)  │
     │<───────────────────────────────────────│
```

### Keycloak Configuration

The UI uses `keycloak-js` SDK with these settings:

| Setting | Value |
|---|---|
| Flow | Standard (Authorization Code) |
| PKCE challenge | S256 |
| Silent SSO check | Enabled (`silentCheckSsoRedirectUri`) |
| Token refresh | Auto-refresh when <5 min remaining |

Required environment variables:

```bash
REACT_APP_KEYCLOAK_BASE_URL=https://keycloak.example.com
REACT_APP_KEYCLOAK_REALM=yaptide
REACT_APP_KEYCLOAK_CLIENT_ID=my-client
REACT_APP_ALT_AUTH=plg
```

### PLGrid Service Verification

When a Keycloak token arrives, the backend checks the `PLG_YAPTIDE_ACCESS` claim in the token. This ensures the user has been granted access to the YAPTIDE service in the PLGrid infrastructure.

The backend also:
1. Fetches **SSH certificates** from a dedicated cert-auth service (`CERT_AUTH_URL`)
2. Stores the certificate and private key in `KeycloakUserModel`
3. Uses these credentials for SSH connections to HPC clusters when submitting batch jobs

## Demo Mode

When `REACT_APP_TARGET=demo`, authentication is bypassed entirely and only in-browser Geant4 simulations are available. See [Frontend Demo — Local](/for_developers/local-setup/local-frontend-demo/) for setup instructions.

## Backend Authorization

### The `@requires_auth` Decorator

All protected endpoints use the `@requires_auth()` decorator, which:

1. Extracts the JWT access token from the `access_token` cookie
2. Decodes and validates the token (signature, expiry)
3. Loads the `UserModel` from the database
4. Injects the `user` object into the Flask request context

```python
@requires_auth()
def post(self, user: UserModel):
    # user is automatically injected
    simulation = SimulationModel(user_id=user.id, ...)
```

### User Model Hierarchy

The user model uses **SQLAlchemy polymorphic inheritance** on the `auth_provider` discriminator:

```
UserModel (base)
├── YaptideUserModel (auth_provider="yaptide")
│   └── password_hash
└── KeycloakUserModel (auth_provider="keycloak")
    ├── cert (SSH certificate)
    └── private_key (SSH private key)
```

This allows the backend to transparently handle both auth methods while storing auth-specific fields only where needed.

## Security Notes

- All tokens are stored in **httpOnly cookies** — not accessible to JavaScript (`document.cookie`)
- CORS is configurable via `FLASK_USE_CORS` (enabled for local dev with `localhost:3000`)
- Nginx terminates TLS (self-signed cert for development, real cert for production)
- Passwords are hashed with Werkzeug's `generate_password_hash` (PBKDF2)
- Keycloak tokens are validated against the **JWKS endpoint** (asymmetric signature verification)
