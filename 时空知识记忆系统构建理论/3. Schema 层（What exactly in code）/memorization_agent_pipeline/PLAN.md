# Memorization Pipeline Demo Plan

> Status: Pre-production plan for a working demo with `demo_website`.

## Goal (说人话版本)
用户在网页里输入视频（先用 `Jian.mp4`），点击开始。  
系统跑完管线，写入图谱和向量，网页能看到知识图并且能检索到信息。

## Success Criteria (必须满足)
1. `/ingest` 能跑完，状态从 `running` 到 `succeeded` 或明确 `failed`。
2. Memory Graph 有数据：`/graph/v0/segments?source_id=Jian.mp4` 非空。
3. Demo 页面能拉取并渲染图谱（segments/events/places/timeslices）。
4. Demo 页面能拉取事件证据和实体人脸样本。
5. Memory 搜索可返回结果（`/search`）。
6. 失败时 UI 有明确提示，不“假成功”。

## Scope
MVP 只跑本地路径（服务端可访问的文件），不做文件上传。  
生产级上传、鉴权、SaaS 任务队列放到后续阶段。

## System Map (谁在说话)
- **demo_website**：前端 UI（Vite 代理 `/api`）
- **memorization_agent ops**：`POST /ingest` 触发管线（端口 8081）
- **memory service**：Graph + Search API（端口 8000）
- **Neo4j/Qdrant**：实际存储

数据流：  
`demo_website → /api/ingest → memorization_agent → memory service → Neo4j/Qdrant`  
`demo_website → /api/graph & /api/search → memory service`

## Repo Implementation Snapshot (当前已实现)

> 结论基于当前仓库扫描，状态分三类：Done / Partial / Missing。

| Task | Status | Evidence |
|---|---|---|
| 0.1 统一运行入口 | Done | `demo_website/vite.config.ts`, `demo_website/src/lib/config.ts` |
| 0.2 视频路径输入 | Done | `demo_website/src/lib/api.ts` (`selectVideo`) |
| 1.1 Job 状态闭环 | Done | `modules/memorization_agent/api/server.py` (`/ingest/{task_id}/status`) |
| 1.2 Graph 写入强制 | Done | `modules/memorization_agent/application/pipeline_steps.py` |
| 2.1 图谱快照 | Done | `demo_website/src/lib/api.ts` (`fetchGraphSnapshot`) |
| 2.2 事件证据/人脸样本 | Done | `demo_website/src/lib/api.ts`, `modules/memory/api/server.py` |
| 3.1 向量搜索展示 | Done | `demo_website/src/components/search-panel.tsx`, `demo_website/src/lib/api.ts` |
| 3.2 QA 对接 | Partial | UI 有 `ChatPanel`，但默认用 mock（`demo_website/src/lib/api.ts`） |
| 4.1 前端交互测试 | Missing | 未见 Playwright/端到端脚本 |
| 4.2 运行时依赖清单 | Partial | 有 RUNBOOK 说明，但缺“依赖矩阵”一页 |

## Phased Plan (按阶段交付)

### Phase 0 — Baseline Wiring (能跑通)
- **Task 0.1** 统一运行入口  
  实现：确认 `demo_website` 使用 `/api` 代理，ops `/ingest` 和 memory `/graph` 路由可达。  
  测试：`curl /health` + `curl /ingest` + `curl /graph/v0/segments`。  
  记录：`modules/memorization_agent/PROCESS.md`、`demo_website/PROCESS.md`。

- **Task 0.2** 视频路径输入可用  
  实现：UI 使用服务端可访问的路径（`demo/data/Jian.mp4`）。  
  测试：输入空路径必须报错，输入路径能创建任务。  
  记录：`demo_website/PROCESS.md`。

- **Task 0.3** 强制开启语义理解依赖  
  实现：demo 模式（`MEMA_DEMO_STRICT=1`）必须开启 VLM + diarization（否则 DoD 不可达）；VLM 使用 OpenRouter `qwen/qwen3-vl-8b-instruct`。  
  测试：缺失 VLM/diarization 时直接提示“配置不满足”，不得继续跑。  
  记录：`docs/.../memorization_agent_pipeline/RUNBOOK.md` + `PROCESS.md`。

### Phase 1 — Ingest + Status (用户能看进度)
- **Task 1.1** Job 状态闭环  
  实现：`/ingest/{task_id}/status` 的状态与 UI 对齐（queued/running/succeeded/failed）。  
  测试：触发任务后轮询，直到终态；失败时 UI 明确展示 error。  
  记录：`modules/memorization_agent/PROCESS.md` + `demo_website/PROCESS.md`。

- **Task 1.2** Graph 写入强制  
  实现：GraphUpsert 失败时任务必须失败，UI 展示原因。  
  测试：断开 Memory API，确认状态为 failed。  
  记录：`modules/memorization_agent/PROCESS.md`。

- **Task 1.3** VLM 输入包含说话人分离 + 人脸映射  
  实现：开启 diarization；VLM prompt 注入“speaker_id → face/person 映射表”+ ASR 时间戳。  
  测试：调试日志可见 `[ASR transcripts]` 且带 speaker_id；映射表存在且格式固定。  
  记录：`modules/memorization_agent/PROCESS.md`。

### Phase 2 — Graph Retrieval (图能看懂)
- **Task 2.1** 图谱快照  
  实现：前端拉 `/graph/v0/segments|events|places|timeslices` 并渲染。  
  测试：`Jian.mp4` 有节点、有时间轴、有边。  
  记录：`demo_website/PROCESS.md`。

- **Task 2.2** 事件证据与人脸样本  
  实现：点击事件/实体后拉取 `/graph/v0/explain/event/{id}` 与 `/graph/v0/entities/{id}/evidences`。  
  测试：事件有 evidence；人物能显示人脸样本（可能为空，但要有提示）。  
  记录：`demo_website/PROCESS.md`。

### Phase 3 — Retrieval (能检索)
- **Task 3.1** 向量搜索  
  实现：`/search` 能返回 `Jian.mp4` 的结果并在 UI 展示。  
  测试：query 结果非空，包含文本内容片段。  
  记录：`modules/memory/PROCESS.md` + `demo_website/PROCESS.md`。

- **Task 3.2** QA（可选）  
  实现：对接 `/v1/agent/qa`（如需）。  
  测试：问答返回，UI 展示 answer 与关联节点。  
  记录：`demo_website/PROCESS.md`。

### Phase 4 — Hardening (不假成功)
- **Task 4.1** 前端交互测试  
  实现：至少覆盖“上传 → 运行 → 成功/失败 → 图谱 → 证据 → 搜索”的一条完整流程。  
  测试：Playwright 或最小脚本；确保按钮有反馈。  
  记录：`demo_website/PROCESS.md`。

- **Task 4.2** 运行时依赖清单  
  实现：明确可选依赖（OpenCLIP、VLM、GPU）和默认关闭策略。  
  测试：CPU-only 配置跑完 `Jian.mp4`。  
  记录：`docs/.../memorization_agent_pipeline/README.md` + `PROCESS.md`。

## Known Gaps (必须承认)
- 目前没有文件上传，只有“服务器路径输入”。  
- Ops 任务状态是内存态，服务重启会丢。  
- QA 路径未必启用（`enableQA=false`）。

## Future Consideration (暂不实现)
- **SAM-Audio 视觉提示分离**：暂不实现，作为后续增强方向。  
  参考：`docs/时空知识记忆系统构建理论/3. Schema 层（What exactly in code）/memorization_agent_pipeline/SAM_AUDIO_INTEGRATION.md`

## Definition of Done (Jian.mp4)
1. 打开 demo 网站 → 输入 `demo/data/Jian.mp4` → 点击开始 → 成功。  
2. 图谱可见，事件可展开，人脸样本可查看。  
3. 事件节点能看到**清晰的事件描述**（来自 VLM），作为终端用户能理解“发生了什么”。  
4. 事件描述包含 ASR 文本信息（VLM 的文本输入包含音频转写）。  
5. VLM 输入包含 diarization 的 speaker_id，且存在 speaker_id → face/person 的映射表。  
6. 事件节点的详情中可看到“对话理解”（至少包含 speaker_id 与对应的 ASR 文本片段）。  
7. `/search` 返回命中结果。  
8. 断开 Memory API 时任务明确失败且 UI 提示。  

## Execution Discipline (硬规矩)
每个任务都要按“三步走”：  
**代码实现 → 测试验证 → PROCESS.md 记录**。  
不做这三步，就当没做。
