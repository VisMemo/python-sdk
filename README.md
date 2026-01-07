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
# Minimal (just api_key)
mem = Memory(api_key="qbk_xxx")

# With user isolation (for multi-user apps)
mem = Memory(api_key="qbk_xxx", user_id="user-123")

# Self-hosted deployment
mem = Memory(api_key="...", endpoint="https://my-instance.com/api/v1/memory")
```

**Parameters:**
| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `api_key` | ✅ Yes | - | Your API key. Get one at [qbrain.ai](https://qbrain.ai) |
| `user_id` | No | `None` | Isolate memories per user in multi-user apps |
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

## Multi-User Apps

Isolate memories per user:

```python
# Each user has their own memory space
mem_alice = Memory(api_key="qbk_xxx", user_id="alice")
mem_bob = Memory(api_key="qbk_xxx", user_id="bob")

mem_alice.add("conv-1", [{"role": "user", "content": "I love coffee"}])
mem_bob.add("conv-1", [{"role": "user", "content": "I love tea"}])

# Searches are isolated
mem_alice.search("what do I like?")  # → coffee
mem_bob.search("what do I like?")    # → tea
```

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

## Coming Soon

Additional APIs for TKG (Temporal Knowledge Graph) queries will be available in future releases:
- Entity resolution
- Timeline queries
- Event search

## License

MIT
