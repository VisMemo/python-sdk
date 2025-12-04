# Memory Service Improvement Priorities (Non-UI)

The Memory service already offers rich multimodal ingestion, search, and graph features. The most pressing non-UI gap is production hardening so multiple agents/tenants can safely share one deployment. The items below describe the gaps, why they matter, and concrete steps to close them.

## 1) Identity, tenancy, and safety gates (highest impact)
- **Current state**: Auth is optional and token handling is simplistic (single shared token or a static token→tenant map). There is no rate limit, quota, or signing for mutations, so a leaked token compromises all tenants.
- **Impact**: Multi-agent and multi-tenant deployments have weak isolation and are fragile against brute-force or runaway usage.
- **What “good” looks like**:
  - Default-on authentication with an external IdP (OIDC/JWT) and per-tenant claims enforced at the edge.
  - Rotatable credentials (per-tenant keys or JWT client secrets), revocation lists, and audit trails for all write/update/delete/link/graph-admin calls.
  - Safety nets at the edge: rate limits/quotas per tenant, signed write requests, and structured security logs + metrics.
- **Next steps**:
  - Ship a production profile that enables auth by default and exposes OIDC/JWT settings alongside per-tenant rate-limit knobs.
  - Add middleware or an API gateway policy for request signing on mutations and per-tenant throttling.
  - Instrument structured audit logs (who/what/when/status) and export auth/throttle metrics for dashboards/alerts.

## 2) Edge reliability and abuse containment
- **Current state**: In-app clamps exist for top-k and fanout, but the HTTP edge lacks client-visible limits (request size, rate limiting, circuit breakers, CORS/TLS defaults).
- **Impact**: Overly large payloads or bursty traffic can degrade the service before in-app safeguards apply; misconfigured origins risk data leakage.
- **What “good” looks like**:
  - Edge policies for payload size, concurrent requests, per-tenant rate/connection limits, and graceful overload responses.
  - Secure ingress defaults: TLS required, explicit CORS allowlist, anomaly/error logging, and per-route timeouts.
- **Next steps**:
  - Provide ingress/gateway templates (Nginx/Envoy/Traefik) that codify payload limits, rate limits, timeouts, and CORS/TLS defaults aligned with in-app clamps.
  - Add middleware-level request size validation and circuit breakers for high-cost routes (search/timeline/graph expand).

## 3) Operational runbooks and test coverage for hardened mode
- **Current state**: Metrics and health endpoints exist, but there is no documented runbook for key rotation, auth rollout, or throttling incidents. Integration tests rarely exercise auth-on mode.
- **Impact**: Teams lack guidance for safe rollouts and incident response; regressions in auth-enabled paths may go unnoticed.
- **What “good” looks like**:
  - A production hardening checklist (secret management, rotation cadence, onboarding/offboarding flows, SLO/error budgets for auth and throttling).
  - Integration tests that cover auth-enabled write/update/delete/link/graph-admin paths under rate limits/throttling.
- **Next steps**:
  - Publish the runbook and checklist alongside sample dashboards/alerts for auth failure rates, throttle events, and audit anomalies.
  - Extend integration tests to run in “auth-on + rate-limited” mode to validate separation and proper failure modes.

## 4) 4-week delivery plan and acceptance criteria
- **Week 1**: Land “production profile” defaults (auth + rate-limit knobs) and request-size validation middleware; ship ingress templates with payload/rate/TLS/CORS policies.
- **Week 2**: Implement JWT/OIDC verification + tenant claim checks; add signed mutation verification and per-tenant throttling; emit structured audit/security logs.
- **Week 3**: Add high-cost route circuit breakers and per-route timeouts; hook auth/throttle/audit metrics to dashboards + alerts; document SLOs and incident runbooks.
- **Week 4**: Extend integration tests to run with auth-on + throttling; cover write/update/delete/link/graph-admin paths and overload responses; backfill regression tests for request-size clamps and circuit breakers.

**Definition of done** (for the hardening push):
- Auth on by default with tenant claims enforced, signed mutations verified, and per-tenant rate/connection limits active in both ingress templates and app middleware.
- Structured audit + security logs plus metrics for auth failures, throttle events, and circuit breaker trips, with example dashboards/alerts.
- Runbooks for key rotation, onboarding/offboarding, and throttling incidents published alongside a production checklist.
- CI integration suite exercises auth-enabled, throttled, and overload cases for all mutation/graph-admin routes with deterministic expectations.

### Week 1 status update (in progress)
- Added a `MEMORY_CONFIG_PROFILE=production` config that turns on token auth by default and preconfigures per-tenant rate limits + request size caps.
- Injected FastAPI middleware to reject oversized bodies early and throttle mutation endpoints, plus a hardened Nginx ingress template covering TLS, CORS, and edge rate limits.

### Week 2 status update (done)
- Added JWT/JWKS verification with issuer/audience claims and tenant claim enforcement, keeping header-only auth for development profiles.
- Enabled request signing for all mutation and graph-admin routes with per-tenant secrets and clock-skew protection.
- Exposed per-tenant token-bucket settings and security metrics (auth/signature failures, throttling, oversized bodies) for dashboards and alerting.

### Week 3 status update (done)
- Introduced API-layer circuit breakers and per-route timeouts for high-cost paths (search/timeline) using the reliability defaults.
- Hardened admin/config endpoints to require authenticated, signed calls and added structured security audit logs for auth/signature outcomes.
