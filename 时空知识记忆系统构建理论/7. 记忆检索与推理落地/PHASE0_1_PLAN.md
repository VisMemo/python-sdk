# Phase 0–1 落地计划（可执行版）

> 目标：基于 `7. 记忆检索与推理落地/PLAN.md`，先把 L1–L2 的问题“能答、可解释”跑通。
> 参考进度：`docs/时空知识记忆系统构建理论/3. Schema 层（What exactly in code）/memorization_agent_pipeline/PROCESS.md`

---

## 0. 当前进度基线（来自 PROCESS）

- 已完成（P0）：/ingest 成功、Graph API 可查（segments/events/utterances）。  
- 已完成（P1 部分）：  
  - 事件链：`NEXT_EVENT` 已在 pipeline 内生成。  
  - 语音绑定：`Utterance → Person(SPOKEN_BY)` 与 `Event → Utterance(SUPPORTED_BY)` 已写入。  
  - 颜色属性：对象 evidence 已带 color。  
  - Place 兜底：无 scene 时写入 `Place=unknown`，保证 OCCURS_AT 不空。  
  - VLM Place 兜底：scene 缺失时，允许 VLM `place` 写入 Place。  
  - 事件标签：仅 VLM 输出 `event_type/action/actor_tag`（规则标签已移除）。  

- 未完成（P1 仍需补齐）：  
  - Scene/Place 稳定化：OpenCLIP 依赖仍缺，需稳定可用或用 VLM place 兜底。  
  - L1/L2 查询链路的 UI 证据展示与端到端烟测（对照 22 个问题）。  

> 结论：Phase 0 已完成；Phase 1 进入“补齐场景与 UI 证据链”的阶段。

---

## Phase 0：让 /ingest → 图可查 → Demo 可看见

### 0.1 目标
- **最小闭环**：视频 ingest 后，Graph API 可查到 Segment/Event/Entity。
- **可视验证**：demo_website 能看到片段列表与事件详情。

### 0.2 任务拆解（含命令与 DoD）

**P0-A 服务就绪**  
- 动作：启动 Memory Service 与依赖（Neo4j/Qdrant）。  
- 验证：`GET /health` 返回 200。  
- DoD：Memory Service 可响应且日志无启动错误。  

示例命令：  
```
docker start qdrant neo4j
uv run uvicorn modules.memory.api.server:app --port 8000
```

**P0-B /ingest 跑通**  
- 动作：运行 memorization_agent 的 `/ingest`。  
- DoD：`/ingest/<run_id>/status` 显示 `succeeded`。  

示例命令：  
```
MEMA_MEMORY_MODE=http MEMA_MEMORY_API_URL=http://127.0.0.1:8000 \
MEMA_PIPELINE_LLM_SEMANTIC_ENABLE=true \
uv run python modules/memorization_agent/api/server.py
```

**P0-C Graph 基础可查**  
- 动作：确认 segments/events 非空。  
- DoD：`segments/events` 返回 items 数量 > 0。  

示例命令：  
```
curl -H 'X-Tenant-ID: test_tenant' \
  'http://127.0.0.1:8000/graph/v0/segments?source_id=Jian.mp4&limit=5'
curl -H 'X-Tenant-ID: test_tenant' \
  'http://127.0.0.1:8000/graph/v0/events?source_id=Jian.mp4&limit=5'
```

**P0-D Demo 最小可视化**  
- 动作：demo_website 读取 segments/events 并展示。  
- DoD：点击事件能看到 `event.summary` 与 `segment` 时间范围。  
- 备注：若出现 EMFILE，使用 `CHOKIDAR_USEPOLLING=1` 或提高 `ulimit -n`。  

### 0.3 Gate 通过条件
- Graph API 可以稳定返回非空 segments/events。  
- demo_website 至少能渲染事件列表与事件详情页。

### 0.4 记录要求
- 记录一次完整跑通结果（命令 + 关键返回）到对应 `PROCESS.md`。

---

## Phase 1：L1–L2 能答（基础事实 + 时序）

### 1.1 目标
- **L1 能答**：时间/地点/语音/对象可检索。  
- **L2 能答**：事件顺序/时长/“最后状态”有可追溯路径。

### 1.2 关键能力补齐（含落点模块）

1) **Scene/Place 稳定化**  
问题：OpenCLIP 缺依赖导致 Place 为空。  
行动：补依赖或提供替代模型；失败时写入 `Place=unknown` 并标记。  
落点：`modules/memorization_agent/ops/scene_classify_clip.py`。  
DoD：Event 至少关联一个 Place（真实或 unknown）。  

2) **事件类型/动作标签**  
行动：仅基于 VLM 生成 `Event.type` / `Event.tags`（规则标签已移除）。  
落点：`modules/memorization_agent/application/pipeline_steps.py`。  
DoD：L1/L2 问题可通过 tags/type 过滤命中。  

3) **时序结构（NEXT_EVENT / TimeSlice）**  
行动：写入后触发 `/graph/v0/admin/build_timeslices` 与 `/graph/v0/admin/build_event_relations`。  
落点：`modules/memory/api/server.py`（admin 端点）。  
DoD：可按时间区间与“前后顺序”查询事件。  

4) **语音链路强绑定**  
行动：确保 Utterance → Person 的 SPOKEN_BY 可查，VLM 输入包含 ASR + diarization，格式统一为 `[personX][mm:ss-mm:ss]: text`。  
落点：`modules/memorization_agent/application/pipeline_steps.py`。  
DoD：事件详情中能显示“谁说了什么”。  

5) **对象属性（颜色/类别）最小集**  
行动：对常见 object 生成最小属性集合（类别+颜色）。  
落点：`modules/memorization_agent/application/pipeline_steps.py`。  
DoD：“红色杯子”等问题有可过滤证据。  

### 1.3 Demo 交互落地

- **问题入口**：在 UI 中提供 L1/L2 问题卡片，映射到固定查询模板。  
- **证据链展示**：事件 → 语音/画面证据 → 对应人物。

### 1.4 L1/L2 查询模板（最小集）

1) 问题：我提到“人工智能”是在什么时候？  
Query：`POST /speech_search` 或 `/search` → Utterance → Segment/Event。  

2) 问题：画面里出现过红色的杯子吗？  
Query：`/object_search` 或 `GET /graph/v0/events?tag=object:cup&color=red`。  

3) 问题：我回家后做的第一件事是什么？  
Query：定位 `Event.action=arrive_home` → NEXT_EVENT（依赖 VLM 标签）。  

4) 问题：我昨天玩手机玩了多久？  
Query：`Event.action=use_phone` 聚合 `duration`（依赖 VLM 标签）。  

### 1.5 管线后处理触发（建议）
- `POST /graph/v0/admin/build_timeslices`  
- `POST /graph/v0/admin/build_event_relations`  
- `POST /graph/v0/admin/build_cooccurs`

### 1.6 测试与记录
- 测试：E2E 查询脚本（Graph API 查询 + UI 点击流程）。  
- 记录：在 `PROCESS.md` 记录每个问题的可用路径与结果。

---

## 2. 交付物清单

1) Phase 0：可跑的 ingest + graph 查询证明，demo_website 最小视图可见。  
2) Phase 1：L1/L2 可回答问题清单（至少 4 条），解释链 UI，记录文档（PROCESS 更新）。  

---

## 3. 风险与控制

- Scene/Place 依赖外部模型：先保底写入 unknown，避免阻断链路。  
- VLM 标签不稳定：收敛标签集合 + 提示词约束 + UI 降级提示。  
- 否定问题先不做：Phase 1 不做 L5。

---

## 4. 版本记录

- v0.1：Phase 0/1 可执行计划（2025-12-25）
- v0.2：补充真实进度基线与“仅 VLM 标签”策略（2025-12-26）
