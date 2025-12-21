# PROCESS — 文本层设计（对话管线 API）

本文件记录“文本层设计/对话管线 API”相关的施工变更。每条记录包含：日期、范围、决策、验证。

---

## 2025-12-20 — dialog_v2 API 升级（方案设计落地到施工规范）

- **范围**
  - `docs/时空知识记忆系统构建理论/5. 文本层设计/对话管线API_v1_施工规范.md`
  - `docs/时空知识记忆系统构建理论/5. 文本层设计/PROCESS.md`
- **决策（Why）**
  - `dialog_v1` 在 `backend="tkg"` 时仍主要停留在“向量 + 简单加权”，没有把 TKG 的 `Event→Entity→TimeSlice→Knowledge` 结构转化为稳定的候选生成与证据链能力；
  - 语义检索无法只靠“图查询”解决：`/graph/v1/search` 是 Neo4j fulltext（倒排）召回，适合字面锚点但不足以覆盖隐式语义；因此必须与向量召回并行协作；
  - 绝对时间在对话数据里并不总是存在（TimeSlice `t_abs_*` 可能为空），TimeSlice 路径必须自适应降级，避免扫库与误匹配。
- **实现（What/How）**
  - 增加 `dialog_v2` 策略说明：三路并行（Event/Entity/TimeSlice），统一落到 `event_id` 候选池（默认 K=50），并以“E_graph 硬保留 + E_vec 动态补位”为核心，不浪费候选容量；
  - 明确 `E_graph`（Graph-first fulltext）与 `E_vec`（Qdrant utterance index 向量召回）的区别与互补关系；
  - Route_EN 增加“索引解析（建议新增实体 resolve 端点）+ 确定性 ID 生成（fallback）”两模式；
  - Route_T 明确启用条件与降级语义：没有可靠绝对时间时不参与候选生成，改由受限 `NEXT_EVENT` 补候选解决 L2 的邻近时序需求。
- **验证（Test）**
  - 本次为文档变更；回归建议运行：
    - `python -m pytest -q modules/memory/tests/unit/test_dialog_tkg_graph_v1.py`
    - `python -m pytest -q modules/memory/tests/unit/test_retrieval_dialog_v1.py`

---

## 2025-12-20 — dialog_v2 融合策略修正（Graph Cap + RRF + Fact 路由）

- **范围**
  - `docs/时空知识记忆系统构建理论/5. 文本层设计/对话管线API_v1_施工规范.md`
  - `docs/时空知识记忆系统构建理论/5. 文本层设计/PROCESS.md`
- **决策（Why）**
  - E_graph（倒排召回）容易吞掉候选池，导致语义/知识路由被挤出；
  - L2/L4 类型问题依赖 Knowledge/Fact 才能给出稳定时间/关系锚点；
  - RRF 融合比分数直加更稳健。
- **实现（What/How）**
  - 增加 Route_K（Knowledge/Fact 召回）并映射 Event；
  - 候选池采用 Graph Cap（默认 15）+ RRF 融合；
  - L2/L4 QA 证据条数设上限，降低噪声干扰；
  - debug 约束增加 `fact_search` 与 `graph_cap/rrf_k`。
- **验证（Test）**
  - 文档变更；功能回归参见：
    - `python -m pytest -q modules/memory/tests/unit/test_retrieval_dialog_v2.py`

---

## 2025-12-21 — 文本写入三段式管线（去噪 → 价值标注（原文无损）→ 建图写入）

- **范围**
  - `docs/时空知识记忆系统构建理论/5. 文本层设计/对话会话三段式写入管线_施工规范.md`
  - `开发者API 说明文档.md`
- **决策（Why）**
  - 开发者/Agent 的“上下文”格式无法统一（messages/trace/控制台导出文本混杂），若直接喂 LLM 抽取会导致成本爆炸、噪声污染与不可回归；
  - 必须先把输入变成确定性的 `turns[]`，再用 LLM 做“筛选+治理标注”，最后才进入 TKG 抽取与写入；
  - “过滤可以有损，但被保留的原话必须无损”：凡写入/建图的内容必须逐字可追溯到 turn（可程序校验）。
- **实现（What/How）**
  - 明确三段式：Stage1（启发式/确定性去噪）→ Stage2（LLM 价值标注：importance/TTL/证据等级，且 `span.text_exact` 必须等于 turn 子串）→ Stage3（复用现有 TKG pipeline 建图写入，并无损透传治理标签）；
  - 补充开发者 API 文档：推荐在“会话结束时”调用一次 `session_write`（SDK），并明确 turns 输入规范（role/speaker/timestamp）。
- **验证（Test）**
  - 本次为文档变更；实现阶段建议增加：
    - Stage2 输出校验器单测（span 子串一致性/字段合法性）
    - adapter 单测（AI Studio/OpenAI messages → CanonicalTurn）
