# SDK SaaS Architecture Alignment

## Overview

This document summarizes the SDK design changes made to align with the SaaS architecture as documented in `Sealos_Saas/系统连通性架构文件.md` and `Sealos_Saas/系统子模块架构文件.md`.

## Key Architecture Insights

### Request Flow (SaaS)
```
SDK → kong → qbrain-gateway → api-dev (BFF) → mem → qdrant/neo4j
```

### Gateway Responsibilities
- Validates API Key from `Authorization: Bearer qbk_*` or `X-Api-Key: qbk_*`
- Looks up `account_id` from `api_keys` table in Supabase
- Generates internal JWT (`x-api-token`)
- **Injects headers**: `x-tenant-id`, `x-principal-user-id`, `x-principal-apikey-id`
- Forwards to `api-dev` (BFF)

### api-dev (BFF) Responsibilities
- Reads `memory_policy`, `llm_keys` from Supabase
- **Owns `user_tokens` calculation**: Replaces SDK's `user_tokens` with `["u:{account_id}"]`
- **Owns `client_meta` injection**: Adds `memory_policy`, `llm_config`, etc.
- Calls `mem` service with transformed request

## SDK Changes Made

### 1. Removed `tenant_id` from Request Body (SaaS Mode)

**Before:**
```python
body = {
    "tenant_id": str(self.tenant_id),  # ❌ SDK sent this
    "query": query,
    ...
}
```

**After:**
```python
# In SaaS mode, gateway injects x-tenant-id header; SDK should not send tenant_id in body.
if not saas_mode:
    body["tenant_id"] = str(self.tenant_id)  # ✅ Only for self-hosted
```

**Rationale**: Gateway already injects `x-tenant-id` header from API key lookup. SDK should not duplicate this in the request body.

### 2. Removed `X-Tenant-ID` Header (SaaS Mode)

**Before:**
```python
if self.tenant_id and self.tenant_id != "__from_api_key__":
    h["X-Tenant-ID"] = str(self.tenant_id)  # ❌ SDK sent this
```

**After:**
```python
# In SaaS mode, gateway injects x-tenant-id header from API key lookup.
# SDK should NOT send X-Tenant-ID header in SaaS mode.
saas_mode = self._mode == "saas" or self.tenant_id == "__from_api_key__"
if not saas_mode and self.tenant_id and self.tenant_id != "__from_api_key__":
    h["X-Tenant-ID"] = str(self.tenant_id)  # ✅ Only for self-hosted
```

**Rationale**: Gateway injects `x-tenant-id` header, so SDK should not send it in SaaS mode.

### 3. Removed `user_tokens` from Request Body (SaaS Mode)

**Before:**
```python
body = {
    "user_tokens": list(self.user_tokens),  # ❌ SDK sent this
    ...
}
```

**After:**
```python
# Only attach user_tokens when not in SaaS mode.
if not saas_mode and self.user_tokens:
    body["user_tokens"] = list(self.user_tokens)  # ✅ Only for self-hosted
```

**Rationale**: BFF (`api-dev`) owns `user_tokens` calculation and replaces SDK's value with `["u:{account_id}"]`. SDK should not send it in SaaS mode.

### 4. Removed `client_meta` from Request Body (SaaS Mode)

**Before:**
```python
body = {
    "client_meta": dict(client_meta),  # ❌ SDK sent this
    ...
}
```

**After:**
```python
# Only attach client_meta when not in SaaS mode.
if not saas_mode and client_meta:
    body["client_meta"] = dict(client_meta)  # ✅ Only for self-hosted
```

**Rationale**: BFF (`api-dev`) owns `client_meta` injection (adds `memory_policy`, `llm_config`, etc.). SDK should not send it in SaaS mode.

## Endpoint Paths

SDK uses correct paths:
- Base URL: `https://zdfdulpnyaci.sealoshzh.site/api/v1/memory`
- Ingest: `POST /api/v1/memory/ingest` ✅
- Retrieval: `POST /api/v1/memory/retrieval` ✅
- Graph: `GET /api/v1/memory/graph/v0/*` ✅

Gateway routes:
- `/api/v1/memory/*` → `api-dev` → `/memory/*` (gateway strips `/api/v1` prefix)

## Headers Sent by SDK (SaaS Mode)

✅ **Correct**:
- `Authorization: Bearer qbk_*` or `X-Api-Key: qbk_*` (for gateway auth)
- `X-Request-ID` (optional, for idempotency)

❌ **Not sent** (gateway/BFF injects):
- `X-Tenant-ID` (gateway injects from API key lookup)
- `x-api-token` (gateway generates internal JWT)
- `x-principal-user-id` (gateway injects)
- `x-principal-apikey-id` (gateway injects)

## Request Body (SaaS Mode)

✅ **Sent**:
- `session_id`
- `turns` (for ingest)
- `query` (for retrieval)
- `memory_domain`
- `commit_id`, `cursor` (for ingest)
- `topk`, `task`, `debug`, `with_answer`, `backend`, `tkg_explain` (for retrieval)
- `entity_hints`, `time_hints` (for retrieval)

❌ **Not sent** (BFF owns):
- `tenant_id` (gateway injects as header)
- `user_tokens` (BFF replaces with `["u:{account_id}"]`)
- `client_meta` (BFF injects from Supabase config)

## Data Isolation

**SaaS Mode**: Data is isolated at **account level** (not per SDK `user_id`).
- All data under the same API key shares the same `user_tokens: ["u:{account_id}"]`
- The optional `user_id` parameter in `Memory.__init__()` is accepted but does not affect SaaS data partitioning
- Per-user isolation is a potential future feature controlled via backend `memory_policy`, not SDK-side tokens

## Verification

To verify the SDK is correctly aligned:

1. **Check request body** (with `debug=True`):
   ```python
   mem = Memory(api_key="qbk_xxx")
   result = mem.search("test", debug=True)
   # Inspect result.debug to see what was sent
   ```

2. **Check headers** (use network inspector):
   - Should see `Authorization: Bearer qbk_*` or `X-Api-Key: qbk_*`
   - Should NOT see `X-Tenant-ID` (gateway injects it)
   - Should NOT see `x-api-token` (gateway generates it)

3. **Check backend logs** (if accessible):
   - BFF should show `user_tokens: ["u:{account_id}"]` (not SDK's value)
   - BFF should show `client_meta` with `memory_policy`, `llm_config` (injected by BFF)

## Migration Notes

If you previously used:
- `MemoryClient(user_tokens=[...])` in SaaS mode → **Now ignored with warning**
- `MemoryClient(tenant_id=...)` in SaaS mode → **Still accepted but not sent in body/headers**
- `client_meta={...}` in SDK calls → **Now ignored in SaaS mode**

These changes ensure the SDK is a **thin client** that delegates control-plane concerns (isolation, config, auth) to the SaaS backend.

