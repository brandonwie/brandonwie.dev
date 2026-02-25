---
title: 'Understanding Traefik, Keycloak, and ForwardAuth'
description: Kubernetes services exposed via Traefik had no authentication layer. Any user
date: 2026-01-18T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - security
  - traefik
  - keycloak
  - oauth2
  - authentication
category: security
draft: false
lang: en
references:
  - url: 'https://www.keycloak.org/documentation'
    title: Keycloak Documentation
    type: official
  - url: 'https://doc.traefik.io/traefik/middlewares/http/forwardauth/'
    title: Traefik ForwardAuth Middleware
    type: official
  - url: 'https://oauth2-proxy.github.io/oauth2-proxy/'
    title: OAuth2 Proxy Documentation
    type: official
---

who knew the URL (e.g., `/grafana`, `/admin`) could access internal dashboards
and APIs directly. Adding per-service authentication would mean duplicating
login logic in every service. The goal was a single, centralized auth gate that
protects multiple services without any of them needing to implement
authentication themselves.

---

## Difficulties Encountered

- **Cross-namespace middleware references are undocumented**: Traefik's
  ForwardAuth middleware must be in the same namespace as the IngressRoute, or
  use a `middleware@namespace` syntax that is barely mentioned in the docs.
  Initial attempts with cross-namespace references silently failed with no error
  — requests just bypassed auth entirely.
- **OAuth2-Proxy configuration is sprawling**: OAuth2-Proxy has 100+
  configuration flags. Finding the correct combination for Keycloak OIDC (issuer
  URL format, scope requirements, cookie domain settings) required extensive
  trial-and-error because most examples online use Google or GitHub as the
  provider, not Keycloak.
- **Redirect loops on misconfigured cookie domains**: If the cookie domain does
  not match the service domain exactly, the browser never sends the auth cookie
  back, causing an infinite redirect loop between OAuth2-Proxy and Keycloak that
  produces no useful error message.
- **OIDC discovery endpoint path varies by Keycloak version**: Keycloak changed
  its default URL structure between versions (with and without `/auth/` prefix),
  causing "issuer mismatch" errors that looked like a configuration problem but
  were actually a version compatibility issue.
- **ForwardAuth subrequests are invisible**: When ForwardAuth denies a request,
  Traefik logs show only the final 302 redirect. The internal subrequest to
  OAuth2-Proxy and its response are not logged by default, making it very hard
  to diagnose why auth is failing.

---

## When to Use

- Kubernetes clusters with multiple web services (dashboards, APIs, admin
  panels) that all need the same authentication gate
- Projects using Traefik as the ingress controller where you want to avoid
  adding auth logic to each individual service
- Environments where you need a centralized identity provider (SSO) with user
  management, realm isolation, and OIDC compliance

---

## When NOT to Use

- **Single-service deployments**: If you only have one service, embedding auth
  directly (e.g., Passport.js, Spring Security) is simpler than deploying
  Keycloak + OAuth2-Proxy as separate services.
- **API-only backends without browser clients**: ForwardAuth relies on browser
  cookie sessions. For pure API authentication (mobile apps,
  service-to-service), use JWT validation middleware directly instead.
- **Environments without Traefik**: ForwardAuth is a Traefik-specific
  middleware. If you use Nginx or another ingress controller, look at
  `auth_request` (Nginx) or equivalent mechanisms instead.
- **Lightweight projects where Keycloak is overkill**: Keycloak is a
  full-featured IAM server with significant resource requirements. For simple
  username/password auth, consider lighter alternatives like Authelia or
  Authentik.

---

## Table of Contents

1. [The Big Picture: A Building Analogy](#the-big-picture-a-building-analogy)
2. [What is Traefik?](#what-is-traefik)
3. [What is Keycloak?](#what-is-keycloak)
4. [The Problem: No Security](#the-problem-no-security)
5. [What is ForwardAuth?](#what-is-forwardauth)
6. [Who is OAuth2-Proxy?](#who-is-oauth2-proxy)
7. [The Complete Login Flow](#the-complete-login-flow)
8. [Complete Architecture Diagram](#complete-architecture-diagram)
9. [Glossary](#glossary)

---

## The Big Picture: A Building Analogy

Imagine your application (Crucio) is a **fancy building** with different rooms:

| Room              | What's Inside                  |
| ----------------- | ------------------------------ |
| **Grafana room**  | Monitoring dashboards          |
| **API room**      | Where apps talk to the backend |
| **Web room**      | The main lobby/website         |
| **Keycloak room** | The membership office          |

Right now, anyone can walk into any room. We want to add security so only
**members can enter certain rooms**.

---

## What is Traefik?

### The Simple Answer

**Traefik is a doorman/bouncer** that stands at the entrance of your building.

```text
THE INTERNET (Everyone outside)
        │
        ▼
┌─────────────────────────────┐
│                             │
│    🚪 TRAEFIK (Doorman)     │
│                             │
│  "Where do you want to go?" │
│                             │
└──────────────┬──────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
    ▼          ▼          ▼
┌───────┐ ┌───────┐ ┌──────────┐
│Grafana│ │  API  │ │   Web    │
│ Room  │ │ Room  │ │  Lobby   │
└───────┘ └───────┘ └──────────┘
```

### What Traefik Does

| Job                | What It Means                                  |
| ------------------ | ---------------------------------------------- |
| **Routing**        | "You want /grafana? Go to the Grafana room!"   |
| **Security**       | "I'll add security features to protect you"    |
| **Load Balancing** | "Room is full? Let me send you to another one" |

### In Project Crucio

When someone visits `https://crucio.brandonwie.dev/grafana`, Traefik:

1. Receives the request
2. Looks at the URL path (`/grafana`)
3. Says "Ah, you want Grafana!" and sends you there

### Technical Details

- **Type**: Ingress Controller (Kubernetes component that handles incoming
  traffic)
- **Location in Project**: `infra/k3s/system/traefik/`
- **Key Files**:
  - `ingressroute-*.yaml` - Define which URLs go to which services
  - `middleware-*.yaml` - Add features like rate limiting, security headers

---

## What is Keycloak?

### The Simple Answer

**Keycloak is a membership office** that issues ID cards and checks if they're
valid.

```text
┌─────────────────────────────────────────────┐
│                                             │
│    🏢 KEYCLOAK (Membership Office)          │
│                                             │
│    "I keep track of all members"            │
│    "I give out membership cards"            │
│    "I verify if cards are real"             │
│                                             │
│    📋 Member Database:                      │
│    - testuser (password: testpassword)      │
│    - admin (password: crucio_admin_dev)     │
│                                             │
└─────────────────────────────────────────────┘
```

### What Keycloak Does

| Job                 | What It Means                                                 |
| ------------------- | ------------------------------------------------------------- |
| **Stores Users**    | Has a database of usernames and passwords                     |
| **Issues Tokens**   | When you log in, it gives you a "membership card" (JWT token) |
| **Verifies Tokens** | Other services can ask "Is this card real?"                   |

### In Project Crucio

- **URL**: `https://crucio.brandonwie.dev/auth/`
- **Location in Project**: `infra/k3s/security/keycloak/`
- **Status**: Deployed and running, ready to issue membership cards

### Key Concepts

| Term       | Meaning                                                          |
| ---------- | ---------------------------------------------------------------- |
| **Realm**  | A tenant/workspace in Keycloak (we use "crucio" realm)           |
| **Client** | An application that uses Keycloak (e.g., crucio-web, crucio-api) |
| **OIDC**   | OpenID Connect - the protocol for authentication                 |

---

## The Problem: No Security

```text
Current Situation (INSECURE):

User → "I want to see Grafana"
         │
         ▼
    ┌──────────┐
    │ Traefik  │
    │ Doorman  │
    └────┬─────┘
         │
         │  "Sure, come right in!"
         │  (No questions asked)
         │
         ▼
    ┌──────────┐
    │ Grafana  │  ← Anyone can see your dashboards!
    └──────────┘
```

**The problem**: Traefik is a lazy doorman. It doesn't check if you're a member.

---

## What is ForwardAuth?

### The Simple Answer

**ForwardAuth is teaching the doorman to check membership cards.**

Instead of letting everyone in, Traefik will now:

1. Stop you at the door
2. Ask "Do you have a valid membership card?"
3. If no → Send you to the membership office to get one
4. If yes → Let you in

### The New Flow (SECURE)

```text
User → "I want to see Grafana"
         │
         ▼
    ┌──────────────────────────────────────────┐
    │  Traefik Doorman                          │
    │                                          │
    │  "Wait! Let me check your membership"    │
    │                                          │
    │  [Whispers to OAuth2-Proxy]              │
    │  "Hey, is this person a member?"         │
    └─────────────────────────┬────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
    ┌──────────────────┐           ┌──────────────────┐
    │  "YES, they're   │           │  "NO, never seen │
    │   a member!"     │           │   them before"   │
    └────────┬─────────┘           └────────┬─────────┘
             │                              │
             ▼                              ▼
    ┌──────────────────┐           ┌──────────────────┐
    │  "Welcome to     │           │  "Go to the      │
    │   Grafana!"      │           │   membership     │
    │                  │           │   office first!" │
    │   🎉 Access!     │           │                  │
    └──────────────────┘           │  → Keycloak      │
                                   │  → Login Page    │
                                   │  → Get card      │
                                   │  → Come back     │
                                   └──────────────────┘
```

### Technical Definition

**ForwardAuth** is a Traefik middleware that:

1. Intercepts incoming requests
2. Makes an internal "subrequest" to an authentication service
3. If auth service returns `200 OK` → Allow the request through
4. If auth service returns `401/302` → Redirect to login

---

## Who is OAuth2-Proxy?

### Why Do We Need It?

Traefik is a doorman, not a security expert. It can ask "is this person a
member?" but it doesn't know **how** to verify membership cards.

**OAuth2-Proxy** is the **security guard** that:

1. Knows how to read membership cards (JWT tokens)
2. Knows how to talk to Keycloak
3. Handles the whole "go get a card, come back with it" dance

```text
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  Traefik (Doorman)          OAuth2-Proxy           Keycloak        │
│      👔                     (Security Guard)       (Membership     │
│                                   🔐                 Office)        │
│                                                        🏢           │
│                                                                     │
│  "Is this person            "Let me check...        "Yes, that's   │
│   a member?"      ───────►   I'll ask Keycloak"  ───► testuser!"   │
│                                                                     │
│                             "Keycloak says yes!"                    │
│  "OK, let them in" ◄───────                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Technical Details

- **Image**: `quay.io/oauth2-proxy/oauth2-proxy:v7.x`
- **Port**: 4180 (internal only)
- **Protocol**: Implements OAuth2/OIDC flows
- **Session Storage**: Secure HTTP-only cookies

---

## The Complete Login Flow

### Step-by-Step: First Visit to /grafana

#### Step 1: You Visit Grafana

```text
You: "I want to see https://crucio.brandonwie.dev/grafana"
```

#### Step 2: Traefik Checks ForwardAuth

```text
Traefik: "Hold on! Let me check with the security guard."

Traefik → OAuth2-Proxy: "Is this person allowed in?"
```

#### Step 3: No Valid Cookie (First Visit)

```text
OAuth2-Proxy: "I don't see a membership card cookie. Denied!"

OAuth2-Proxy → Traefik: "Send them to Keycloak to log in"
```

#### Step 4: Redirect to Login Page

```text
Traefik → You: "You need to log in first!"

Browser redirects to: https://crucio.brandonwie.dev/auth/realms/crucio/login
```

#### Step 5: You Log In at Keycloak

```text
┌─────────────────────────────────────┐
│         KEYCLOAK LOGIN              │
│                                     │
│   Username: [testuser          ]    │
│   Password: [••••••••••       ]    │
│                                     │
│          [ LOG IN ]                 │
└─────────────────────────────────────┘
```

#### Step 6: Keycloak Issues a Code

```text
Keycloak: "Password correct! Here's a temporary code."

Keycloak → Browser: "Go to https://crucio.brandonwie.dev/oauth2/callback?code=ABC123"
```

#### Step 7: OAuth2-Proxy Exchanges Code for Token

```text
Browser arrives at: /oauth2/callback?code=ABC123

OAuth2-Proxy → Keycloak: "Here's code ABC123, give me a real token"

Keycloak → OAuth2-Proxy: "Here's a JWT token proving testuser is logged in"

OAuth2-Proxy: "I'll save this in a cookie on the user's browser"
```

#### Step 8: You're Redirected Back to Grafana

```text
OAuth2-Proxy → Browser: "Here's a cookie. Now go back to /grafana"

Browser: *Has cookie now* → Goes to /grafana
```

#### Step 9: This Time, You Get In

```text
Traefik: "Let me check with security guard again"

Traefik → OAuth2-Proxy: "Is this person allowed?"

OAuth2-Proxy: "Yes! They have a valid cookie!" ✅

Traefik → You: "Welcome to Grafana! 🎉"
```

### Sequence Diagram

```text
┌──────┐     ┌─────────┐     ┌──────────────┐     ┌──────────┐     ┌─────────┐
│ User │     │ Traefik │     │ OAuth2-Proxy │     │ Keycloak │     │ Grafana │
└──┬───┘     └────┬────┘     └──────┬───────┘     └────┬─────┘     └────┬────┘
   │              │                 │                  │                │
   │ GET /grafana │                 │                  │                │
   │─────────────>│                 │                  │                │
   │              │                 │                  │                │
   │              │ Check auth      │                  │                │
   │              │────────────────>│                  │                │
   │              │                 │                  │                │
   │              │ 302 (no cookie) │                  │                │
   │              │<────────────────│                  │                │
   │              │                 │                  │                │
   │ 302 Redirect to /auth/login    │                  │                │
   │<─────────────│                 │                  │                │
   │              │                 │                  │                │
   │ GET /auth/realms/crucio/login  │                  │                │
   │───────────────────────────────────────────────────>│                │
   │              │                 │                  │                │
   │ Login Page   │                 │                  │                │
   │<───────────────────────────────────────────────────│                │
   │              │                 │                  │                │
   │ POST (username/password)       │                  │                │
   │───────────────────────────────────────────────────>│                │
   │              │                 │                  │                │
   │ 302 to /oauth2/callback?code=ABC                  │                │
   │<───────────────────────────────────────────────────│                │
   │              │                 │                  │                │
   │ GET /oauth2/callback?code=ABC  │                  │                │
   │─────────────────────────────────>│                │                │
   │              │                 │                  │                │
   │              │                 │ Exchange code    │                │
   │              │                 │─────────────────>│                │
   │              │                 │                  │                │
   │              │                 │ JWT Token        │                │
   │              │                 │<─────────────────│                │
   │              │                 │                  │                │
   │ 302 to /grafana + Set-Cookie   │                  │                │
   │<─────────────────────────────────│                │                │
   │              │                 │                  │                │
   │ GET /grafana (with cookie)     │                  │                │
   │─────────────>│                 │                  │                │
   │              │                 │                  │                │
   │              │ Check auth      │                  │                │
   │              │────────────────>│                  │                │
   │              │                 │                  │                │
   │              │ 200 OK ✓        │                  │                │
   │              │<────────────────│                  │                │
   │              │                 │                  │                │
   │              │ Forward to Grafana                 │                │
   │              │────────────────────────────────────────────────────>│
   │              │                 │                  │                │
   │ Grafana Dashboard              │                  │                │
   │<───────────────────────────────────────────────────────────────────│
   │              │                 │                  │                │
```

---

## Complete Architecture Diagram

```text
                    THE INTERNET
                         │
                         ▼
    ┌────────────────────────────────────────────────────────┐
    │              CLOUDFLARE (Security Wall)                │
    │         DDoS protection, SSL/TLS encryption            │
    └────────────────────────────────────────────────────────┘
                         │
                         ▼
    ┌────────────────────────────────────────────────────────┐
    │                                                        │
    │              🚪 TRAEFIK (Doorman)                       │
    │                                                        │
    │   "Every request comes through me"                     │
    │   "I check ForwardAuth before letting anyone in"       │
    │                                                        │
    └───────────────┬─────────────────────────────┬──────────┘
                    │                             │
                    │ Protected Routes            │ Unprotected
                    │ (/grafana, /admin)          │ (/auth, /api)
                    ▼                             │
    ┌────────────────────────────────────┐        │
    │                                    │        │
    │  🔐 OAUTH2-PROXY (Security Guard)  │        │
    │                                    │        │
    │  "Is this cookie valid?"           │        │
    │  "Let me verify with Keycloak"     │        │
    │                                    │        │
    └─────────────┬──────────────────────┘        │
                  │                               │
                  │ Validates with                │
                  ▼                               │
    ┌────────────────────────────────────┐        │
    │                                    │        │
    │  🏢 KEYCLOAK (Membership Office)   │◄───────┘
    │                                    │   (Users log in here)
    │  - User database                   │
    │  - Token issuing                   │
    │  - Token verification              │
    │                                    │
    └────────────────────────────────────┘
                  │
                  │ If verified ✅
                  ▼
    ┌────────────────────────────────────┐
    │                                    │
    │  📊 GRAFANA (Protected Service)    │
    │                                    │
    │  Only authenticated users see this │
    │                                    │
    └────────────────────────────────────┘
```

---

## Glossary

| Term             | Plain English                                    | Technical Definition                                       |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| **Traefik**      | Doorman that routes you to the right room        | Kubernetes Ingress Controller                              |
| **Keycloak**     | Membership office that knows all members         | Identity and Access Management (IAM) server                |
| **OAuth2-Proxy** | Security guard that checks your card             | Authentication proxy that handles OAuth2/OIDC flows        |
| **ForwardAuth**  | The rule that says "check cards before entering" | Traefik middleware that delegates auth to external service |
| **JWT Token**    | Your digital membership card                     | JSON Web Token - signed data proving identity              |
| **Cookie**       | Where your browser stores your card              | Browser storage for session data                           |
| **OIDC**         | The language the membership office speaks        | OpenID Connect - authentication protocol built on OAuth2   |
| **Realm**        | A separate membership database                   | Keycloak tenant/workspace                                  |
| **Client**       | An app registered with the membership office     | OAuth2 client application                                  |
| **Middleware**   | Extra checks the doorman performs                | Traefik plugin that processes requests                     |
| **Ingress**      | The building's front door                        | Kubernetes resource for external access                    |
| **Subrequest**   | Doorman's whisper to security guard              | Internal HTTP request for auth check                       |

---

## Project Crucio Files Reference

| Component              | Location                                               | Purpose                         |
| ---------------------- | ------------------------------------------------------ | ------------------------------- |
| Traefik Routes         | `infra/k3s/system/traefik/ingressroute-*.yaml`         | Define URL routing              |
| Traefik Middlewares    | `infra/k3s/system/traefik/middleware-*.yaml`           | Security headers, rate limiting |
| Keycloak               | `infra/k3s/security/keycloak/`                         | Identity provider deployment    |
| OAuth2-Proxy           | `infra/k3s/security/oauth2-proxy/`                     | ForwardAuth handler             |
| ForwardAuth Middleware | `infra/k3s/system/traefik/middleware-forwardauth.yaml` | Traefik ForwardAuth config      |

---

## Deployment Setup Guide

### Prerequisites

Before deploying OAuth2-Proxy, ensure:

1. **Keycloak is running**:
   `kubectl get pods -n crucio-security -l app.kubernetes.io/name=keycloak`
2. **'crucio' realm exists**: Created in T3.1.2
3. **Test user exists**: Created in T3.1.3

### Step 1: Create OAuth2-Proxy Client in Keycloak

This is a **MANUAL STEP** that must be done before deploying OAuth2-Proxy.

1. **Access Keycloak Admin Console**:

   ```bash
   kubectl port-forward svc/keycloak -n crucio-security 8080:8080
   ```

   Then open: <http://localhost:8080/auth/admin/>

2. **Login as admin**:
   - Username: `admin`
   - Password: `crucio_admin_dev`

3. **Select 'crucio' realm** (dropdown in top-left)

4. **Create new client**:
   - Navigate: Clients → Create client
   - Client ID: `oauth2-proxy`
   - Client Protocol: `openid-connect`
   - Click: Next

5. **Configure client settings**:
   - Client Authentication: **ON** (Confidential client)
   - Authorization: OFF
   - Standard flow: **ON**
   - Direct access grants: OFF
   - Click: Next

6. **Set redirect URIs**:
   - Valid Redirect URIs: `https://crucio.brandonwie.dev/oauth2/callback`
   - Add additional URIs as needed:
     - `https://grafana.brandonwie.dev/oauth2/callback`
     - `https://api.brandonwie.dev/oauth2/callback`
   - (For local dev, add: `http://localhost/oauth2/callback`)
   - Click: Save

7. **Copy client secret**:
   - Go to: Credentials tab
   - Copy the "Client Secret" value
   - You'll need this for the secret.yaml

### Step 2: Generate Cookie Secret

OAuth2-Proxy needs a secret key to encrypt session cookies.

```bash
# Generate 32-byte base64url-encoded secret
python3 -c 'import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())'
```

Save the output - you'll need it for secret.yaml.

### Step 3: Update Secret Values

Edit `infra/k3s/security/oauth2-proxy/secret.yaml`:

1. **Replace client secret**:

   ```bash
   # Take the secret from Keycloak step 7
   echo -n 'your-keycloak-client-secret-here' | base64
   # Paste result into OAUTH2_PROXY_CLIENT_SECRET
   ```

2. **Replace cookie secret**:

   ```bash
   # Take the output from step 2
   echo -n 'your-generated-cookie-secret' | base64
   # Paste result into OAUTH2_PROXY_COOKIE_SECRET
   ```

### Step 4: Deploy OAuth2-Proxy

```bash
# Deploy OAuth2-Proxy
kubectl apply -k infra/k3s/security/oauth2-proxy/

# Verify deployment
kubectl get pods -n crucio-security -l app.kubernetes.io/name=oauth2-proxy

# Check logs for any errors
kubectl logs -n crucio-security -l app.kubernetes.io/name=oauth2-proxy
```

### Step 5: Deploy ForwardAuth Middleware

```bash
# Deploy ForwardAuth middleware
kubectl apply -f infra/k3s/system/traefik/middleware-forwardauth.yaml

# Verify middleware created
kubectl get middleware -n crucio-system forwardauth-oauth2
```

### Step 6: Update Grafana Route

```bash
# Apply updated Grafana IngressRoute (now includes ForwardAuth)
kubectl apply -f infra/k3s/system/traefik/ingressroute-grafana.yaml
```

### Verification

1. **Test OAuth2-Proxy health**:

   ```bash
   kubectl port-forward svc/oauth2-proxy -n crucio-security 4180:4180
   curl http://localhost:4180/ping
   # Should return: OK
   ```

2. **Test Grafana with auth**:
   - Visit: <https://grafana.brandonwie.dev/>
   - Should redirect to Keycloak login page
   - Login with: `testuser` / `testpassword`
   - Should redirect back to Grafana

3. **Test logout**:
   - Visit: <https://crucio.brandonwie.dev/oauth2/sign_out>
   - Session cookie should be cleared
   - Next visit to Grafana requires login again

### Troubleshooting

| Problem                 | Cause                    | Solution                                              |
| ----------------------- | ------------------------ | ----------------------------------------------------- |
| 502 Bad Gateway         | OAuth2-Proxy not running | Check pods: `kubectl get pods -n crucio-security`     |
| Redirect loop           | Invalid redirect URI     | Verify Keycloak client's Valid Redirect URIs          |
| "Invalid issuer"        | Wrong OIDC URL           | Check OAUTH2_PROXY_OIDC_ISSUER_URL in configmap       |
| Cookie not set          | Wrong domain             | Check OAUTH2_PROXY_COOKIE_DOMAINS matches your domain |
| "Invalid client secret" | Secret mismatch          | Re-copy secret from Keycloak                          |

### Debug Commands

```bash
# Check OAuth2-Proxy logs
kubectl logs -n crucio-security -l app.kubernetes.io/name=oauth2-proxy -f

# Check Traefik logs for routing issues
kubectl logs -n kube-system -l app.kubernetes.io/name=traefik -f

# Test OIDC discovery endpoint
kubectl exec -n crucio-security deploy/oauth2-proxy -- \
  wget -qO- http://keycloak.crucio-security:8080/auth/realms/crucio/.well-known/openid-configuration
```

---

## Next Steps

After completing T3.1.4:

1. **T3.1.5**: Update API to validate Keycloak tokens (replace local JWT)
2. **T3.2.1**: Create guardrails service (PII masking + injection detection)
3. **Enable Grafana Auth Proxy**: Configure Grafana to use X-Auth-Request-User
   header

### Optional: Enable Grafana Auth Proxy Mode

To enable automatic login in Grafana based on ForwardAuth headers, update
`grafana.ini`:

```ini
[auth.proxy]
enabled = true
header_name = X-Auth-Request-User
header_property = username
auto_sign_up = true
```

This allows Grafana to automatically create and login users based on the
X-Auth-Request-User header set by OAuth2-Proxy.

---

_Last Updated: 2026-01-18_ _Related Task: T3.1.4 - Integrate Traefik with
Keycloak_ _Status: Implementation Complete - Follow Deployment Setup Guide
above_
