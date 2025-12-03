# Memory Service Improvement Priorities (Beyond UI)

## 1. Harden authentication and tenancy controls
- **Current state**: The API ships with auth disabled by default and only supports a single shared token or a static token→tenant mapping when enabled. There is no built-in rate limit, quota, or key rotation path, and callers can bypass auth entirely when the feature flag is left off (common for local runs).【modules/memory/config/memory.config.yaml†L153-L176】【modules/memory/api/server.py†L148-L228】
- **Impact**: Multi-agent/multi-user deployments cannot rely on strong isolation; accidental exposure of the token compromises every tenant. There is also no defense against abusive clients (replay, brute-force, or runaway query volume).
- **Suggested direction**:
  - Integrate an identity provider (OIDC/JWT) and enforce per-tenant claims at the gateway, with rotation and revocation stories.
  - Add per-tenant rate limits/quotas and request signing for sensitive mutations (write/update/delete/link/graph admin).
  - Move auth from "optional dev guard" to "default-on production profile" with configuration profiles for local vs. production.
  - Emit structured security/audit logs (who/what/when, success/failure) and expose metrics for auth failures and throttling.

## 2. Reliability and abuse safety nets at the edge
- **Current state**: The service clamps search top-k and graph fanout inside the app, but the FastAPI layer does not expose client-facing limits (rate limiting, payload size guards, or circuit breakers on the HTTP edge). Authentication being optional further weakens these guardrails.
- **Suggested direction**:
  - Add an API gateway or middleware for rate limiting, request size validation, and per-tenant circuit breakers, aligning limits with the in-app clamps.
  - Provide deployment-ready configs (Ingress/Nginx/Envoy) that enforce TLS, CORS allowlists, and anomaly logging.

## 3. Production-ready operational posture
- **Current state**: Observability exists for metrics/health, but there is no documented runbook for key management, auth rollout, or incident response for auth failures.
- **Suggested direction**:
  - Ship a "production hardening" checklist covering secret management, token/JWT rotation cadence, onboarding flows, and SLOs for auth latency/error budget.
  - Extend integration tests to cover auth-enabled paths (write/update/delete/graph admin) and per-tenant separation under throttling scenarios.
