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
