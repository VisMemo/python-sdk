# omem

Python SDK for the omem memory service — give your AI agents long-term memory.

## Installation

```bash
pip install omem
```

## Quick Start

```python
from omem import Memory

mem = Memory(api_key="qbk_xxx")  # That's it!

# Save a conversation
mem.add("conv-001", [
    {"role": "user", "content": "明天和 Caroline 去西湖"},
    {"role": "assistant", "content": "好的，我记住了"},
])

# Search memories
result = mem.search("我什么时候去西湖？")
if result:
    print(result.to_prompt())
```

## API Reference

### `Memory`

Main class for interacting with the memory service.

```python
# Minimal (just api_key) - SaaS mode (recommended)
mem = Memory(api_key="qbk_xxx")

# Multi-user apps (SaaS)
# NOTE: In SaaS, data is isolated at the **account** level.
# The optional user_id is accepted for future/backend-controlled
# isolation features but does not currently change data partitioning.
mem = Memory(api_key="qbk_xxx", user_id="user-123")

# Self-hosted deployment (advanced / not covered here)
mem = Memory(api_key="...", endpoint="https://my-instance.com/api/v1/memory")
```

**Parameters:**
| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `api_key` | ✅ Yes | - | Your API key. Get one at [qbrain.ai](https://qbrain.ai) |
| `user_id` | No | `None` | Optional end-user identifier (future/backend-controlled isolation in SaaS) |
| `endpoint` | No | Cloud service | Override for self-hosted deployments |
| `timeout_s` | No | `30.0` | Request timeout in seconds |

### `add(conversation_id, messages)`

Save conversation messages to memory. Fire-and-forget — returns immediately.

```python
mem.add("conv-001", [
    {"role": "user", "content": "Book a meeting tomorrow at 3pm"},
    {"role": "assistant", "content": "Done! Meeting scheduled."},
])
```

**Parameters:**
- `conversation_id` — Unique identifier for the conversation
- `messages` — List of messages in OpenAI format (`role`, `content`)

**Note:** Call once per conversation (not per message) for best results. Memories become searchable after backend processing (~5-30 seconds).

### `search(query, *, limit=10, fail_silent=False)`

Search memories. Returns strongly-typed results.

```python
result = mem.search("meeting with Caroline")
if result:
    for item in result:
        print(f"[{item.score:.2f}] {item.text}")
```

**Parameters:**
- `query` — Search question
- `limit` — Maximum results (default: 10)
- `fail_silent` — Return empty result on error instead of raising (default: False)

**Returns:** `SearchResult` with:
- Truthy check: `if result: ...`
- Iteration: `for item in result: ...`
- LLM formatting: `result.to_prompt()`

## Error Handling

```python
from omem import OmemClientError, OmemRateLimitError

try:
    result = mem.search("query")
except OmemRateLimitError as e:
    print(f"Rate limited. Retry after {e.retry_after_s}s")
except OmemClientError as e:
    print(f"Error: {e}")
```

For agent robustness, use `fail_silent=True`:

```python
# Never raises — returns empty SearchResult on error
result = mem.search("query", fail_silent=True)
```

## Multi-User Apps (SaaS)

In SaaS, **data is isolated at the account level**. The backend (Gateway + BFF)
owns the effective `user_tokens` and `client_meta` based on your account
configuration, not on SDK-side settings.

You can still tag calls with an end-user identifier for your own tracking:

```python
mem = Memory(api_key="qbk_xxx", user_id="alice")  # for your app's bookkeeping

mem.add("conv-1", [{"role": "user", "content": "I love coffee"}])
result = mem.search("what do I like?")
```

Today, using different `user_id` values in SaaS **does not** guarantee separate
vector spaces; per-user isolation is a potential future feature controlled via
backend `memory_policy`, not SDK-side `user_tokens`.

For strict isolation in SaaS **today**, use separate accounts / API keys.

## Advanced: Conversation Buffer

For fine-grained control over when to commit:

```python
with mem.conversation("conv-001") as conv:
    conv.add({"role": "user", "content": "First message"})
    conv.add({"role": "assistant", "content": "Reply"})
    # Auto-commits on exit
```

Or manually:

```python
conv = mem.conversation("conv-001")
conv.add({"role": "user", "content": "Hello"})
result = conv.commit()  # Returns AddResult with job_id
```

## Future: Self-Hosted User Isolation (Design Sketch)

> Status: Design only – not implemented in the public SaaS service.

For self-hosted deployments that need per-end-user isolation within a tenant, a
cleaner design than `user_tokens` is:

### Recommended: `X-User-ID` Header

In this model:

- The deployment API key authenticates the tenant
- `X-User-ID` identifies the end user within that tenant
- The server enforces isolation based on `(tenant_id, user_id)`

Example future shape (not yet wired end-to-end):

```python
client = MemoryClient(
    base_url="http://localhost:8000/api/v1/memory",
    api_key="deployment_key",
    # user_id would eventually map to X-User-ID header on requests
    # user_id="alice",
)
```

### Alternative: Scoped API Keys

Another option for self-hosted tenants is to issue per-user API keys that
encode both tenant and user scope:

```python
client = MemoryClient(
    base_url="http://localhost:8000/api/v1/memory",
    api_key="qbk_tenant_alice_scoped_key",
)
```

In this model, the server derives both `tenant_id` and `user_id` from the key
itself and does not need a separate header.

These patterns are documented here as forward-looking guidance only; the SaaS
service uses account-level isolation based solely on the API key.

## License

MIT
