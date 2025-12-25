# Runbook：启动全链路服务并跑通 `Jian.mp4`

目标：启动 **Qdrant + Neo4j + Memory Service + Memorization Agent Ops**，然后通过 `POST /ingest` 跑 “视频→写入” 管线，并用 “小状态接口” 轮询进度。

> **状态说明（未上线生产）**：`/ingest` 入口已注入 Graph 写入；GraphUpsert 失败会让任务 `failed`。  
> 需要 `MEMA_MEMORY_API_URL`（推荐）；旧变量仍可用但会告警。

> 约定：本文所有命令都在仓库根目录执行（`MOYAN_AGENT_INFRA/`）。

> [!NOTE]
> `/ingest` 现在会写 Graph；如果 Memory API 不可达，会直接失败而不是“成功但图为空”。

---

## 0. 前置（你需要的 4 个东西）

1) Qdrant（向量库）  
2) Neo4j（图数据库）  
3) Memory Service（对外统一 API：写入/检索/图查询）  
4) Memorization Agent Ops（内网 ingest：跑管线并写入 Memory）

---

## 1. 启动 Qdrant / Neo4j（Docker）

如果你已经在 Docker Desktop 里启动了 `qdrant` 和 `neo4j`，可以跳过本节。

你需要保证端口可用：
- Qdrant：`127.0.0.1:6333`
- Neo4j Bolt：`127.0.0.1:7687`

---

## 2. 启动 Memory Service（端口 8000）

开一个终端（Terminal A）：

```bash
QDRANT_HOST=127.0.0.1 QDRANT_PORT=6333 \
NEO4J_URI=bolt://127.0.0.1:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=password \
uv run uvicorn modules.memory.api.server:app --host 127.0.0.1 --port 8000
```

健康检查：

```bash
curl -s http://127.0.0.1:8000/health
```

---

## 3. 启动 Memorization Agent Ops（端口 8081）

再开一个终端（Terminal B）：

### 3.1 P0（推荐）配置：不依赖 LLM、不拉 OpenCLIP、向量用 hash fallback

```bash
MEMA_MEMORY_MODE=http \
MEMA_MEMORY_API_URL=http://127.0.0.1:8000 \
MEMA_PIPELINE_LLM_SEMANTIC_ENABLE=false \
MEMA_PIPELINE_ENABLE_CLIP_IMAGE=false \
MEMA_FORCE_HASH_EMBEDDINGS=1 \
MEMA_PIPELINE_ASR_DEVICE=cpu \
MEMA_VOICE_DEVICE=cpu \
uv run python modules/memorization_agent/api/server.py
```

> [!NOTE]
> 推荐使用 `MEMA_MEMORY_API_URL`；`MEMA_MEMORY_BASE_URL` / `MEMA_MEMORY_API_BASE` 仍兼容但会告警。

> 如果你的 GPU 环境完整（CUDA/cuDNN 都 OK），可以尝试把 `cpu` 改成 `cuda`。  
> 但如果出现“挂住/卡死/初始化很久”，先回到 CPU，保证稳定跑通。

### 3.2 启用 VLM（OpenRouter：`qwen/qwen3-vl-8b-instruct`）

前提：你已经在 `modules/memory/config/.env` 写好了 `OPENROUTER_API_KEY`（以及可选 `OPENROUTER_BASE_URL`）。

```bash
MEMA_LLM_MAX_IMAGES_PER_REQUEST=1 \
MEMA_LLM_BATCH_MODE=single \
MEMA_LLM_MAX_IMAGE_EDGE=512 \
MEMA_LLM_JPEG_QUALITY=65 \
MEMA_MEMORY_MODE=http \
MEMA_MEMORY_API_URL=http://127.0.0.1:8000 \
MEMA_DEMO_STRICT=1 \
MEMA_PIPELINE_LLM_SEMANTIC_ENABLE=true \
MEMA_PIPELINE_ENABLE_DIARIZATION=1 \
MEMA_PIPELINE_ENABLE_CLIP_IMAGE=false \
MEMA_FORCE_HASH_EMBEDDINGS=1 \
MEMA_PIPELINE_ASR_DEVICE=cpu \
MEMA_VOICE_DEVICE=cpu \
uv run python modules/memorization_agent/api/server.py
```

> VLM 打开后会明显变慢（需要发请求给 OpenRouter），这是正常的。
> 由于 `MEMA_DEMO_STRICT=1`，若未启用 VLM/diarization 将直接拒绝 ingest。

健康检查：

```bash
curl -s http://127.0.0.1:8081/health
```

---

## 4. 触发 ingest（跑 `demo/data/Jian.mp4`）

### 4.1 方式 A：使用 `/ingest` API

```bash
curl -s -X POST http://127.0.0.1:8081/ingest \
  -H 'Content-Type: application/json' \
  -d '{
    "path": "demo/data/Jian.mp4",
    "tenant_id": "test_tenant",
    "run_id": "Jian.mp4",
    "user_ids": ["subject_1"],
    "memory_domain": "general"
  }'
```

你会拿到：
- `task_id`：通常就是你给的 `run_id`（这里是 `Jian.mp4`）
- `status`：`queued`

### 4.2 方式 B：使用 `run_real_pipeline.py`（脚本直跑）

```bash
MEMA_MEMORY_MODE=http \
MEMA_MEMORY_API_URL=http://127.0.0.1:8000 \
MEMA_USER_ID=subject_1 \
MEMA_MEMORY_DOMAIN=general \
MEMA_RUN_ID=Jian.mp4 \
MEMA_PIPELINE_LLM_SEMANTIC_ENABLE=false \
MEMA_FORCE_HASH_EMBEDDINGS=1 \
uv run python modules/memorization_agent/scripts/run_real_pipeline.py demo/data/Jian.mp4
```

### 4.3 方式 C：使用 `run_pipeline_stub.py`（轻量图写入验证）

> 不跑重模型，直接用 stub 证据写 Graph v0，适合快速验证 GraphUpsert。

```bash
PYTHONPATH=. uv run python scripts/run_pipeline_stub.py \
  --video demo/data/Jian.mp4 \
  --tenant test_tenant \
  --api http://127.0.0.1:8000 \
  --entity person_1
```

### 4.4 轮询状态（小接口，别用全量）

```bash
curl -s http://127.0.0.1:8081/ingest/Jian.mp4/status
```

> 如果你刚重启过 `memorization_agent`，会看到 404：这是正常的。  
> ops server 的任务状态存在内存里，进程一重启就清空；重新 `POST /ingest` 就有了。

你关心的字段：
- `status`: `queued | running | succeeded | failed`
- `progress.build_graph.vg_nodes / vg_edges`
- `progress.write_memory.written / mapped_entries / mapped_edges`

> 你之前看到的“curl 返回一大坨向量”来自 `GET /ingest/{task_id}`（全量），不是给 UI 用的。  
> 日常轮询一律用 `GET /ingest/{task_id}/status`。

---

## 5. 验证：数据确实写入了

### 5.1 Vector（适用于 /ingest）

```bash
curl -s -H 'X-Tenant-ID: test_tenant' -X POST http://127.0.0.1:8000/search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "speaker",
    "top_k": 5,
    "filters": {
      "run_id": "Jian.mp4",
      "memory_domain": "general",
      "user_id": "subject_1"
    }
  }'
```

### 5.2 Graph（/ingest 也会写入）

```bash
curl -s -H 'X-Tenant-ID: test_tenant' \
  'http://127.0.0.1:8000/graph/v0/segments?source_id=Jian.mp4&limit=5'
# 说明：`source_id` 与 ingest 的 `run_id` 对齐；如果你用自定义 run_id，请在这里用同一个值过滤。
```

> 如果返回空数组：检查 `run_id/source_id` 是否一致，或 Memory 服务是否可达。

---

## 常见坑（别浪费时间）

| 问题 | 原因 | 解决 |
|------|------|------|
| 任务 `failed` 且提示 `graph_write_failed` | Memory API 不可达/鉴权失败 | 检查 `MEMA_MEMORY_API_URL`/Token/网络 |
| `404` 查询任务状态 | ops server 重启后任务表清空 | 重新 `POST /ingest` |
| 环境变量没生效 | shell 里写 `VAR=xxx` 但没 export | 用 `VAR=... VAR2=... command` 或先 `export` |
| `GET /ingest/{task_id}` 返回一大坨 | 用错了接口（那是全量回放） | 用 `/ingest/{task_id}/status` |
| Memory API 返回 401/422 | 缺 `X-Tenant-ID` header | 加上 `-H 'X-Tenant-ID: xxx'` |
| 使用 `MEMA_MEMORY_API_URL` 但无效 | Memory API 不可达或地址写错 | 确认服务地址/端口/Token |
