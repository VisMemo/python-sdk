# Memory Service API Reference (Developer)

Status: pre-production reference for developers building memory apps.

Scope:
- Memory Service API (search + graph + write)

This doc is a practical reference, not a design spec. It mirrors the current
code in `modules/memory/api/server.py` and `modules/memorization_agent/api/server.py`.

## 1) Base URL

Local default (dev):
- Memory Service: `http://127.0.0.1:8000`
- Memorization Agent (ingest): `http://127.0.0.1:8081`

## 2) Authentication and Tenant

### Dev mode (auth disabled)
If `memory.api.auth.enabled = false` in Memory Service config:
- You must send `X-Tenant-ID` header for tenant scoping.

Example:
```
X-Tenant-ID: test_tenant
```

### Auth enabled
If `memory.api.auth.enabled = true`:
- Send API token with header `X-API-Token` (configurable).
- JWT is supported when `jwks_url` is configured.

### Optional request signature
Some write/admin endpoints can require a signature when
`memory.api.auth.signing.required = true`.

Required headers:
- `X-Signature`: HMAC-SHA256 signature
- `X-Signature-Ts`: unix timestamp (seconds)

Signature payload:
```
payload = f"{ts}.{path}".encode() + b"." + body_bytes
signature = hmac_sha256(secret, payload)
```

Notes:
- `path` is the URL path only (no host, no query string).
- `body_bytes` is the raw request body (JSON bytes).

## 3) Common Response Codes

- 200 OK: success
- 400 Bad Request: missing tenant or invalid parameters
- 401 Unauthorized: missing/invalid token or signature
- 404 Not Found: resource not found
- 422 Unprocessable Entity: invalid payload structure
- 429 Too Many Requests: rate limit
- 500 Server Error

## 4) Core Data Models (simplified)

### MemoryEntry (vector store + projection graph)
```
{
  "id": "uuid-or-logical-id",
  "kind": "episodic|semantic",
  "modality": "text|image|audio|structured",
  "contents": ["primary text", "..."],
  "vectors": {"text": [..], "image": [..], "audio": [..]},
  "metadata": {
    "tenant_id": "tenant",
    "user_id": ["subject_1"],
    "memory_domain": "general",
    "run_id": "Jian.mp4",
    "timestamp": 12.3,
    "source": "m3|mem0|ctrl",
    "clip_id": 3
  }
}
```

### Edge (projection graph)
```
{
  "src_id": "node-id",
  "dst_id": "node-id",
  "rel_type": "appears_in|said_by|located_in|equivalence|prefer|executed|describes|temporal_next|co_occurs",
  "weight": 0.7
}
```

### GraphUpsertRequest (typed TKG graph)
```
{
  "segments": [...],
  "evidences": [...],
  "utterances": [...],
  "entities": [...],
  "events": [...],
  "places": [...],
  "time_slices": [...],
  "regions": [...],
  "states": [...],
  "knowledge": [...],
  "edges": [...],
  "pending_equivs": [...]
}
```

Full schemas live in:
- `modules/memory/contracts/memory_models.py`
- `modules/memory/contracts/graph_models.py`

## 5) Core API Endpoints (Memory Service)

### Health
`GET /health`

### Search (vector + graph expansion)
`POST /search`

Body:
```
{
  "query": "speaker",
  "topk": 10,
  "expand_graph": true,
  "graph_backend": "memory|tkg",
  "threshold": 0.1,
  "filters": {
    "tenant_id": "test_tenant",
    "run_id": "Jian.mp4",
    "user_id": ["subject_1"],
    "memory_domain": "general"
  },
  "graph_params": {
    "max_hops": 2,
    "cap": 9,
    "rel_whitelist": ["APPEARS_IN", "SAID_BY", "LOCATED_IN"]
  }
}
```

Notes:
- If `filters.tenant_id` is missing, Memory Service will attempt to use `X-Tenant-ID`.
- `graph_backend = memory` expands via projection graph.
- `graph_backend = tkg` expands typed TKG graph.

### Graph-first search
`POST /graph/v1/search`

Use when you want typed graph retrieval with evidence chains.

### Graph upsert (typed TKG graph)
`POST /graph/v0/upsert`

Body: `GraphUpsertRequest` (see above).

### Graph reads (v0)
All require tenant context (header or auth).

- `GET /graph/v0/segments?source_id=Jian.mp4&limit=100`
- `GET /graph/v0/events?source_id=Jian.mp4&limit=100`
- `GET /graph/v0/events/{event_id}`
- `GET /graph/v0/places?source_id=Jian.mp4&limit=100`
- `GET /graph/v0/places/{place_id}`
- `GET /graph/v0/timeslices?source_id=Jian.mp4&limit=100`
- `GET /graph/v0/entities/{entity_id}/timeline?limit=100`
- `GET /graph/v0/entities/{entity_id}/evidences?subtype=face&source_id=Jian.mp4&limit=50`
- `GET /graph/v0/explain/event/{event_id}`
- `GET /graph/v0/explain/first_meeting?me_id=...&other_id=...`

### Memory write (vector store + projection graph)
`POST /write`

Body:
```
{
  "entries": [MemoryEntry, ...],
  "links": [Edge, ...],
  "upsert": true,
  "return_id_map": false
}
```

### Memory update/delete/link
- `POST /update` (patch a MemoryEntry)
- `POST /delete` (soft delete)
- `POST /link` (single edge)
- `POST /batch_link` / `POST /batch_delete`
- `POST /rollback` (version rollback)

### Specialized search helpers
- `POST /timeline_summary`
- `POST /speech_search`
- `POST /object_search`
- `POST /entity_event_anchor`

These are optional helpers for timeline summaries, speech keyword search,
object search, and anchoring events around entities.

## 6) Ingestion API (Memorization Agent)

If you are building a video app, use the ingest service to produce
Memory entries and typed graph in one run.

`POST http://127.0.0.1:8081/ingest`

Body:
```
{
  "path": "demo/data/Jian.mp4",
  "tenant_id": "test_tenant",
  "run_id": "Jian.mp4",
  "user_ids": ["subject_1"],
  "memory_domain": "general"
}
```

Status:
`GET http://127.0.0.1:8081/ingest/{task_id}/status`

Notes:
- `task_id` is `run_id` if provided, otherwise auto-generated.
- Graph write is required when `MEMA_MEMORY_API_URL` is set.

## 7) Quickstart Flow (Jian.mp4)

1) Start Memory Service (8000) and Memorization Agent (8081).
2) POST `/ingest` with `Jian.mp4`.
3) Poll `/ingest/{task_id}/status` until `succeeded`.
4) Read Graph:
   - `/graph/v0/segments?source_id=Jian.mp4`
   - `/graph/v0/events?source_id=Jian.mp4`
5) Search:
   - `POST /search` with filters `{ "run_id": "Jian.mp4" }`

## 8) Admin Endpoints (use with caution)

These are intended for maintenance only:
- `/graph/v0/admin/*` (equiv approvals, TTL cleanup, build relations)
- `/admin/ensure_collections`
- `/admin/run_ttl`
- `/admin/decay_edges`
- `/config/*` (search and graph configuration)

## 9) References

- `modules/memory/docs/RETRIEVAL_API_AND_WORKFLOW.md` (detailed behavior)
- `docs/时空知识记忆系统构建理论/3. Schema 层（What exactly in code）/TKG-Graph-v1.0-Ultimate.md`
- `docs/时空知识记忆系统构建理论/3. Schema 层（What exactly in code）/memorization_agent_pipeline/RUNBOOK.md`
