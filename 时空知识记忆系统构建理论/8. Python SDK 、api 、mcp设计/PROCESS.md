# PROCESS（8. Python SDK 、api 、mcp设计）

## 2025-12-21：Session Commit（默认重型、异步、可重试）SDK 施工规范

### 完成内容

- 新增施工文档：`客户端SDK_会话提交与重型抽取写入_施工规范_v0.md`
  - 明确“会话内 append、本地缓存；会话关闭 commit，一次提交异步入队”的开发者使用路径。
  - 明确服务端新增 ingest 入口（版本化）、job/session 状态查询接口形态（用于 SDK/控制台）。
  - 明确默认重型（Stage2→Stage3），无路由；任一步失败保留归档并定期重试直到成功。
  - 明确 Stage3 失败时外部语义：不承诺任何索引/图写入可见化，仅保留归档并重试。
  - 明确幂等与增量提交：`tenant_id + session_id + turn_id` 为最小幂等边界；同 turn_id 内容不一致返回 409。

### 测试/验证

- 本次为设计文档施工，不涉及代码变更与自动化测试。
- 验收清单已写入规范文档第 13 节，作为后续实现与测试基准。

### 风险与待确认

- 归档缓存的存储介质、加密策略、TTL 与访问审计需在产品/合规层进一步定稿。
- Stage3 的“对外可见一致性”需要在实现层通过幂等/版本化/可见性门闩保证（否则可能出现部分写入）。

## 2025-12-21：SDK 设计横向对比（Mem0 / Zep / memU / MemOS）

### 完成内容

- 新增竞调文档：`SDK设计横向对比.md`
  - 对齐统一对比维度：会话模型、SDK 入口、标准化来源、抽取时机、失败语义、幂等增量、治理信号。
  - 总结各方案核心思想：
    - Mem0：标准 messages 批量 add + LLM 决策更新
    - Zep：Thread/Graph 双轨 + 异步抽取 + metadata.type 路由
    - memU：Resource 批处理 + 三层聚合 + 对话分段抽取
    - MemOS：add 即 ingest + tree_text 单次抽取 + scheduler 后台重组织
  - 明确 MOYAN 的“借鉴并超越”点：归档真相源、默认重型、失败重试直到成功、入口幂等增量、Stage2 无损约束。

### 测试/验证

- 本次为竞调与设计文档更新，不涉及代码变更与自动化测试。

## 2025-12-21：Stage2 输出从“抄写原文”改为“标记与坐标”

### 变更内容

- 更新施工规范：`客户端SDK_会话提交与重型抽取写入_施工规范_v0.md`
  - Stage2 不再要求/允许 LLM 输出 `text_exact`（抄写原文片段）。
  - 改为逐 turn 标记（keep/drop）+ 可选 span 的 `start/end` 坐标；由程序规则式切片/拼接生成 `filtered_transcript`。
  - 目的：降低输出 token 成本，避免抄写错误导致校验失败，提高稳定性与可回归性。

### 测试/验证

- 本次为文档契约变更，不涉及代码实现与自动化测试。

## 2025-12-21：新增“用户主动保存信号（Pin Intent）”治理语义

### 变更内容

- 更新施工规范：`客户端SDK_会话提交与重型抽取写入_施工规范_v0.md`
  - Stage2 的 TurnMarkV1 增加 `user_triggered_save` 字段，用于表达“用户明确要求记住/保存”的高优先级保留信号。
  - 引入 PinIntent（建议由程序从 marks 生成并落盘），在 Stage3 写入一个 `user_pinned_note` 类型的 Knowledge/Note，并绑定 `source_turn_ids` 以保证可审计与可重试。
  - 明确：`evidence_level` 保持真实来源，不因“用户想保存”而自动升级为“用户确认其为真”。

### 测试/验证

- 本次为文档契约与治理语义变更，不涉及代码实现与自动化测试。

## 2025-12-22：清理“对话会话三段式管线”文档，改为 Stage2 策略说明

### 变更内容

- 更新文档：`对话会话三段式写入管线_施工规范.md`
  - 去除已过时的 Stage1（输入格式归一/去噪）与 Stage3（建图写入细节）内容；
  - 统一为 Stage2 策略说明：逐 turn 标记（TurnMarkV1）+ TTL/重要性/证据等级 + PinIntent；
  - 对齐最新契约：Stage2 不抄写原文，不输出 `text_exact`；用户主动保存用 `user_triggered_save`/PinIntent 表达，不篡改 `evidence_level` 语义。

### 测试/验证

- 本次为文档清理与口径对齐，不涉及代码实现与自动化测试。

## 2025-12-22：补齐 Stage3 幂等/可见性门闩与 E2E 验收用例

### 变更内容

- 更新施工规范：`客户端SDK_会话提交与重型抽取写入_施工规范_v0.md`
  - 增加 Stage3 幂等硬约束：节点/边/向量点必须有稳定幂等 key；写入必须 upsert/MERGE，禁止 insert-only。
  - 增加“部分写入不可见”门闩：推荐 `published=false` 写入 + 全部读路径强制过滤 `published=true`，成功后 publish。
  - 明确 `requires_confirmation` 的 owner：由上游产品/Agent 发起确认并回写更新。
  - 扩写 MCP 边界：本方案范围内 MCP 不涉及写操作；写入走 SDK/HTTP ingest。
- 更新 Stage2 策略文档：`对话会话三段式写入管线_施工规范.md`
  - 将 TTL 表“建议值”改为“默认值（可被 tenant/product policy 覆盖）”并写死 fallback 语义。
  - 补充 `requires_confirmation` 后续闭环与责任归属说明。
- 新增验收用例：`端到端验收用例_会话写入与可检索闭环.md`
  - 覆盖 happy path、Stage3 部分失败不可见、重试成功 publish、会话重开增量提交。

### 测试/验证

- 本次为设计与验收用例文档更新，不涉及代码实现与自动化测试。

## 2025-12-22：对齐“现有 HTTP 端口”与“SDK 高阶端口（ingest/retrieval）”规划

### 完成内容

- 新增对齐文档：`HTTP端口现状与SDK对接规划_v0.md`
  - 列出 `modules/memory/api/server.py` 当前已暴露的全部 HTTP 端口分类（核心读写/图/高成本/配置与管理）。
  - 明确当前缺口：缺少 `POST /ingest/dialog/v1` 与 `POST /retrieval/dialog/v2`（以及 job/session 状态端点），导致高阶链路只能 in-proc 调用。
  - 明确施工后新增端口（方案 A）：`POST /ingest/dialog/v1` + `GET /ingest/jobs/{job_id}` + `GET /ingest/sessions/{session_id}` + `POST /retrieval/dialog/v2`。
  - 给出 SDK 与后端交互时序与职责边界：append 本地缓存、commit 异步入队、retrieval 每轮召回、策略在服务端版本化。

### 测试/验证

- 本次为端口规划与文档口径对齐，不涉及代码实现与自动化测试。

## 2025-12-22：确认对外 SDK 包名为 `omem`

### 变更内容

- 更新施工规范：`客户端SDK_会话提交与重型抽取写入_施工规范_v0.md`
  - 写死对外发布的 import name：`omem`（全小写），作为稳定入口。
- 更新端口对接文档：`HTTP端口现状与SDK对接规划_v0.md`
  - 明确 SDK（`omem`）与后端端口（`/ingest/...`、`/retrieval/...`）的默认对接关系。

### 测试/验证

- 本次为文档口径与命名对齐，不涉及代码实现与自动化测试。
