---
title: Auth Endpoints
description: Authentication and session management API.
---

## Register

Create a new local user account.

```http
PUT /auth/register
Content-Type: application/json

{
    "username": "researcher",
    "password": "secure-password"
}
```

**Response** `201 Created`

```json
{
    "message": "User created",
    "status_code": 201
}
```

**Errors:**
- `400` — Missing username or password
- `403` — Registration is disabled on this instance

---

## Login

Authenticate with username and password. Sets HTTP-only cookies for `access_token` and `refresh_token`.

```http
POST /auth/login
Content-Type: application/json

{
    "username": "researcher",
    "password": "secure-password"
}
```

**Response** `202 Accepted`

```json
{
    "message": "Login successful",
    "access_exp": "2024-01-15T12:30:00Z",
    "refresh_exp": "2024-01-16T12:00:00Z"
}
```

**Response headers set:**
- `Set-Cookie: access_token=<jwt>; HttpOnly; SameSite=None; Secure`
- `Set-Cookie: refresh_token=<jwt>; HttpOnly; SameSite=None; Secure`

**Errors:**
- `401` — Invalid credentials
- `400` — Missing fields

---

## Refresh Token

Exchange a valid refresh token for a new access token.

```http
GET /auth/refresh
Cookie: refresh_token=<jwt>
```

**Response** `200 OK`

```json
{
    "message": "Token refreshed",
    "access_exp": "2024-01-15T12:45:00Z"
}
```

**Response headers set:**
- `Set-Cookie: access_token=<new-jwt>; HttpOnly; SameSite=None; Secure`

**Errors:**
- `401` — Invalid or expired refresh token

---

## Status

Get information about the currently authenticated user.

```http
GET /auth/status
Cookie: access_token=<jwt>
```

**Response** `200 OK`

```json
{
    "message": "User status",
    "username": "researcher",
    "source": "local"
}
```

The `source` field indicates the authentication provider: `"local"` or `"keycloak"`.

---

## Logout

Delete authentication cookies and end the session.

```http
DELETE /auth/logout
Cookie: access_token=<jwt>
```

**Response** `200 OK`

```json
{
    "message": "Logout successful"
}
```

**Response headers set:**
- `Set-Cookie: access_token=; Max-Age=0`
- `Set-Cookie: refresh_token=; Max-Age=0`

---

## Keycloak Login

Authenticate via Keycloak SSO. The frontend obtains a Keycloak token through the OIDC flow and sends it here.

```http
POST /auth/keycloak
Content-Type: application/json

{
    "keycloak_token": "<keycloak-jwt>"
}
```

**Response** `202 Accepted`

```json
{
    "message": "Login successful",
    "access_exp": "2024-01-15T12:30:00Z"
}
```

The backend:
1. Validates the Keycloak JWT against the configured realm.
2. Extracts user info from the token claims.
3. Creates or updates the user in the local database.
4. Fetches SSH certificates from the PLGrid proxy (if available).
5. Issues a backend JWT via `Set-Cookie`.

**Errors:**
- `401` — Invalid Keycloak token
- `500` — Keycloak validation failed

---

## Keycloak Logout

```http
DELETE /auth/keycloak
Cookie: access_token=<jwt>
```

**Response** `200 OK`

```json
{
    "message": "Logout successful"
}
```

---

## Token Lifecycle

```
┌─────────────┐     POST /auth/login      ┌─────────────────┐
│   Client     │ ──────────────────────────▶│  Backend         │
│              │ ◀────── Set-Cookie ────────│  (JWT issued)    │
│              │                            └─────────────────┘
│              │     GET /auth/status
│              │ ──── Cookie: access_token ──▶
│              │ ◀──── 200 OK ──────────────
│              │
│              │     GET /auth/refresh
│  (token      │ ──── Cookie: refresh_token ─▶
│   expiring)  │ ◀──── new access_token ─────
│              │
│              │     DELETE /auth/logout
│              │ ──── Cookie: access_token ──▶
│              │ ◀──── cookies cleared ──────
└─────────────┘
```

The frontend auto-refreshes the access token before expiry using `GET /auth/refresh`.
