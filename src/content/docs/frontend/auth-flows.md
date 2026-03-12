---
title: Auth Flows
description: Authentication implementation in the YAPTIDE frontend.
---

The frontend supports two authentication modes and a demo mode that bypasses auth entirely.

## Mode Selection

| Mode | Activated By | Backend Required |
|---|---|---|
| **Standard** (username/password) | Default | Yes |
| **Keycloak SSO** (PLGrid) | `REACT_APP_ALT_AUTH=plg` | Yes + Keycloak |
| **Demo** (no auth) | `REACT_APP_TARGET=demo` | No |

## Standard Authentication

### Login Flow

```typescript
// AuthService.tsx — simplified
const login = async (username: string, password: string) => {
  const response = await ky.post('auth/login', {
    json: { username, password },
    credentials: 'include'  // sends/receives httpOnly cookies
  });

  const { accessExp } = await response.json();

  // Store user info in localStorage for persistence across refreshes
  localStorage.setItem('user', JSON.stringify({ username }));

  // Start auto-refresh timer
  startRefreshTimer(accessExp);
};
```

### Auto-Refresh

The UI auto-refreshes the access token at **1/3 of its lifetime**:

```typescript
const startRefreshTimer = (accessExp: number) => {
  const now = Date.now() / 1000;
  const ttl = accessExp - now;
  const refreshIn = (ttl / 3) * 1000;  // milliseconds

  setTimeout(async () => {
    const response = await ky.get('auth/refresh', {
      credentials: 'include'
    });
    const { accessExp: newExp } = await response.json();
    startRefreshTimer(newExp);
  }, refreshIn);
};
```

This creates a self-sustaining refresh loop. If the refresh fails (e.g., refresh token expired), the user is logged out.

### Logout

```typescript
const logout = async () => {
  await ky.delete('auth/logout', { credentials: 'include' });
  localStorage.removeItem('user');
  // Reset the UI to the login tab
};
```

### Session Persistence

On page load, the UI checks `localStorage` for a saved user and attempts a token refresh:

```typescript
// On app load
const savedUser = localStorage.getItem('user');
if (savedUser) {
  try {
    await refreshToken();
    // Session restored
  } catch {
    localStorage.removeItem('user');
    // Session expired, show login
  }
}
```

## Keycloak SSO

### Configuration

`KeycloakAuthService.tsx` initializes the Keycloak JS SDK:

```typescript
const keycloak = new Keycloak({
  url: config.keycloakBaseUrl,     // REACT_APP_KEYCLOAK_BASE_URL
  realm: config.keycloakRealm,     // REACT_APP_KEYCLOAK_REALM
  clientId: config.keycloakClientId // REACT_APP_KEYCLOAK_CLIENT_ID
});
```

### Init Options

```typescript
keycloak.init({
  onLoad: 'check-sso',
  pkceMethod: 'S256',
  silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
  checkLoginIframe: false
});
```

- **`check-sso`** — checks for existing session without forcing login
- **`pkceMethod: 'S256'`** — PKCE with SHA-256 challenge (prevents authorization code interception)
- **`silentCheckSsoRedirectUri`** — invisible iframe for session checks without page reload

### Token Exchange

After Keycloak authentication, the frontend exchanges the Keycloak token with the YAPTIDE backend:

```typescript
const exchangeKeycloakToken = async () => {
  const response = await ky.post('auth/keycloak', {
    headers: {
      Authorization: `Bearer ${keycloak.token}`
    },
    credentials: 'include'
  });

  const { accessExp } = await response.json();
  startRefreshTimer(accessExp);
};
```

The backend validates the Keycloak token, creates/updates the user, and issues local JWT cookies.

### Auto-Refresh

Keycloak tokens are refreshed independently of the YAPTIDE tokens:

```typescript
// Refresh Keycloak token when < 5 minutes remaining
keycloak.onTokenExpired = () => {
  keycloak.updateToken(300).then((refreshed) => {
    if (refreshed) {
      // Re-exchange with backend
      exchangeKeycloakToken();
    }
  });
};
```

### PLGrid Service Check

The UI checks the Keycloak token for PLGrid service claims:

```typescript
const hasYaptideAccess = keycloak.tokenParsed?.PLG_YAPTIDE_ACCESS === true;

if (!hasYaptideAccess) {
  // Show dialog: "You need to enroll in the YAPTIDE PLGrid service"
  showServiceRejectionDialog();
}
```

## Demo Mode

When `REACT_APP_TARGET=demo`:

```typescript
// ConfigService.tsx
const demoMode = process.env.REACT_APP_TARGET === 'demo';

// AuthService.tsx
if (config.demoMode) {
  // Skip all auth logic
  // User is "anonymous"
  // No backend communication
  return;
}
```

In demo mode:
- The login tab is hidden
- No API calls are made
- Only Geant4 Wasm simulations work
- No results are persisted

## Server Reachability

`AuthService.tsx` includes a **reachability poller** that periodically checks if the backend is accessible:

```typescript
const checkServerReachable = async () => {
  try {
    await ky.get('auth/status', { credentials: 'include', timeout: 5000 });
    setServerReachable(true);
  } catch {
    setServerReachable(false);
  }
};
```

If the server becomes unreachable, the UI shows a notification and disables simulation submission (remote simulations only — Geant4 Wasm continues to work).

## The `authKy` Client

`AuthService` exports an `authKy` HTTP client — a pre-configured `ky` instance with:

```typescript
const authKy = ky.create({
  prefixUrl: config.backendUrl,
  credentials: 'include',
  hooks: {
    afterResponse: [snakeToCamelTransformer]
  }
});
```

All backend API calls in the frontend use `authKy` to ensure cookies are sent and responses are camelCased.
