# TKG Demo - Temporal Memory Queries

This demo showcases omem's Temporal Knowledge Graph (TKG) capabilities using the LoCoMo dataset.

## What it Does

1. **Load**: Parses Caroline & Melanie conversations from LoCoMo
2. **Write**: Stores conversations in TKG via omem SDK
3. **Query**: Demonstrates temporal queries like "前两天 Caroline 干什么了"

## Quick Start

```bash
# Step 1: Load data into TKG
uv run python -m apps.tkg_demo.load_locomo

# Step 2: Run interactive query demo
uv run python -m apps.tkg_demo.query_demo
```

## Query Examples

### Semantic Search
```
🤖 > What did Caroline do at the support group?
🤖 > When did Melanie go camping?
🤖 > Caroline 参加了什么活动?
```

### Entity Timeline
```
🤖 > /timeline Caroline
🤖 > /timeline Melanie
```

### Entity Resolution
```
🤖 > /entity Caroline
🤖 > /entity Melanie
```

### Event Search
```
🤖 > /events support group
🤖 > /events camping
```

## Data Source

The demo uses the first conversation from `benchmark/data/locomo/raw/locomo10.json`:
- **Speakers**: Caroline & Melanie
- **Sessions**: ~19 conversation sessions
- **Time Range**: May - August 2023

## Prerequisites

**Start local memory server first:**

```bash
# Terminal 1: Start the memory server
cd /home/boshenzh/Projects/MOYAN_AGENT_INFRA
# (your server start command here)
```

## Configuration

Default settings (edit in scripts if needed):
- `ENDPOINT`: `http://localhost:8000`
- `API_KEY`: `dev`
- `TENANT_ID`: `tkg_demo`

## omem SDK Features Demonstrated

| Feature | Method | Use Case |
|---------|--------|----------|
| Semantic Search | `mem.search()` | "What happened at X?" |
| Entity Timeline | `mem.get_entity_timeline()` | "What did X do recently?" |
| Entity Resolution | `mem.resolve_entity()` | Find entity by name |
| Event Search | `mem.search_events()` | Search TKG events |

## Architecture

```
LoCoMo JSON
    │
    ▼
load_locomo.py ──► omem Memory SDK ──► TKG (Neo4j + Qdrant)
                          │
                          ▼
query_demo.py ◄── Search Results
```

