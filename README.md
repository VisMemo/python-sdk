# omem

Python SDK for the omem memory service — give your AI agents long-term memory.

## Installation

```bash
pip install omem
```

## Quick Start

```python
from omem import Memory

# Initialize
mem = Memory(
    endpoint="https://your-service.sealoshzh.site/api/v1/memory",
    tenant_id="your-tenant",
    api_key="qbk_xxx",
)

# Save a conversation
mem.add("conv-001", [
    {"role": "user", "content": "明天和 Caroline 去西湖"},
    {"role": "assistant", "content": "好的，我记住了"},
])

# Search memories
result = mem.search("我什么时候去西湖？")
if result:
    print(result.to_prompt())  # Formatted for LLM injection
```

## API Reference

### `Memory`

Main class for interacting with the memory service.

```python
mem = Memory(
    endpoint="https://...",    # Memory service URL
    tenant_id="your-tenant",   # Required
    api_key="qbk_xxx",         # Required
)
```

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

