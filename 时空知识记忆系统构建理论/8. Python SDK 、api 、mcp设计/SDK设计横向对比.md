# SDK 设计横向对比（Mem0 / Zep / memU / MemOS）与 MOYAN 取舍

> 目标：对标主流“重型记忆”开源方案的 SDK/API/管线形态，提炼可借鉴模式与可超越点，为 MOYAN 的 Session Commit（默认重型、异步、可重试）方案提供外部参照。  
> 范围：只讨论“如何把一整段会话/对话文本标准化并触发抽取写入”，不讨论模型效果优劣。

---

## 1. 我们关心的对比维度（统一口径）

1) **会话模型**：是否有 session/thread 的一等公民概念？  
2) **SDK 入口形态**：append vs batch add vs session commit？  
3) **标准化来源**：系统是否尝试解析任意 trace/context dump，还是依赖标准 messages/turns？  
4) **抽取触发时机**：同步/异步？是否后台处理？  
5) **失败语义与重试**：best-effort 还是“直到成功”的管线契约？  
6) **幂等与增量**：重复提交/会话重开时如何避免重复写入与图污染？  
7) **治理信号**：是否有 TTL/importance/validity 等一等字段或等价机制？

---

## 2. Mem0（mem0ai/mem0）：标准 messages 批量 add + LLM 决策更新

### 2.1 入口与数据模型

- SDK 入口：`Memory.add(messages=[...], user_id, agent_id, run_id, metadata, infer=...)`  
- 规范 messages：最小 `{"role": "...", "content": "..."}`，可选 `name`（群聊/参与者标识）

### 2.2 抽取触发与写入

- 触发：**一次 add（batch）触发一次抽取与写入**（不是每条 message 自动抽取）。  
- 典型链路：messages parse → LLM 抽 facts → embedding → 向量库检索相似旧记忆 → LLM 决策 ADD/UPDATE/DELETE/NONE → 写入向量库/（可选）图存储 → 审计记录。

### 2.3 自动接入方式（避免“解析任意 context”）

- 提供 OpenAI 兼容 proxy：拦截标准 `messages[]`，自动 add 和记忆检索再拼回 prompt。  
- 结论：Mem0 **依赖标准 messages**，不靠解析任意 trace。

### 2.4 关键启示

- “重型写入”的主流入口形态可以很简单：**把一段对话作为 messages 批次交给 add**。  
- 真正的重点是：抽取后的**去重/更新决策**（ADD/UPDATE/DELETE/NONE）要可控，否则记忆会冲突与膨胀。

---

## 3. Zep（getzep/zep）：Thread（对话流水）+ Graph（结构化记忆）双轨，异步后台抽取

### 3.1 入口与会话模型

- 会话模型：`user_id + thread_id`（Thread 是对话流水的一等公民）。  
- 写入入口：`thread.add_messages(thread_id, [Message(...)])`（可逐条也可批量）。

### 3.2 抽取触发

- 抽取进入 temporal knowledge graph：**异步后台处理**（写消息不阻塞等抽取完成）。  

### 3.3 集成层的“标准化”做法（我们应借鉴）

- CrewAI/AutoGen 集成不解析任意 trace，而是拦截框架事件并按 `metadata.type` 路由：  
  - `type="message"` → 存 thread（对话）  
  - `type="json/text/data"` → 存 graph（结构化数据）  

### 3.4 治理机制（等价于“遗忘/状态变化”）

- Zep 的 temporal KG 事实边常有 `valid_at / invalid_at`，表达事实随时间的有效区间（更偏“时间有效性治理”而非 TTL 秒数）。

### 3.5 关键启示

- **Thread（原始对话）/Graph（结构化）双轨分离**可以降低污染与回放成本。  
- **异步抽取**是重型记忆的现实选择（吞吐与稳定性优先）。

---

## 4. memU（NevaMind-AI/memU）：Resource 批处理（resource_url+modality）驱动的三层记忆架构

### 4.1 入口与会话模型

- memU 不以 session/thread 为中心：输入被建模为 `resource_url + modality`。  
- 核心入口：`MemoryService.memorize(resource_url, modality)`（一次资源 ingestion job）。

### 4.2 对话标准化方式

- 对话 ingestion 会先做“行号索引 + LLM 分段（topic/time gap）”，再对分段内容抽取。  
- 其标准化更像“从 raw conversation 文本生成 segments”，不是“turn append/commit 模型”。

### 4.3 抽取与存储形态

- 三层结构：Resource（原始）→ MemoryItem（结构化条目）→ MemoryCategory（主题聚合与摘要）。  
- embedding 写入多个层（resource caption / item summary / category summary）。

### 4.4 治理/TTL 与失败语义

- DeepWiki 可见信息中：未强调 TTL/importance 作为一等字段。  
- 幂等/重试机制更多是内部关系去重与本地资源缓存；未见“队列 + 失败重试直到成功”的外部契约。

### 4.5 关键启示

- 对长对话，**“先分段再抽取”**能显著降低抽取跑偏与输出膨胀风险（值得 MOYAN Stage3 借鉴）。  
- 但作为 SaaS 写入管线，memU 在“session 增量幂等/失败补偿/治理标签”上不够硬。

---

## 5. MemOS（MemTensor/MemOS）：add 即 ingest + tree_text 单次抽取 + scheduler 后台重组织

### 5.1 入口形态

- 入口：`MOSCore.add(messages|memory_content|doc_path, user_id, session_id)` / `mos_product.add`（对应 REST `/product/add`）。  
- 不强调 session-close commit；没有明显 append buffer 概念。

### 5.2 抽取方式（tree_text）

- `tree_text` backend 下：把 messages 拼成文本，**单次 LLM 调用**生成结构化 `memory list`（key/memory_type/value/tags），再写入存储并生成 embedding。  
- 后续去重/聚类/摘要/关系推断更多由 scheduler/GraphStructureReorganizer 异步执行。

### 5.3 治理信号

- 有 Working/LongTerm/User 等分层；WorkingMemory 容量限制/替换策略可视为一种“TTL/淘汰”。  
- 有 activation/importance 等概念，并由 scheduler 更新与组织。

### 5.4 幂等/重复 ingestion

- DeepWiki 可见信息里：add 层面未见显式“重叠 messages 去重”的入口幂等；更像“先写，后续 merge/organize 吸收重复”。

### 5.5 关键启示

- “写入后持续重组织（scheduler）”的思想很强：把治理从入口挪到后台。  
- 但如果缺少入口幂等与归档真相源，SaaS 场景下会带来一致性与可回归风险。

---

## 6. 结论：MOYAN 方案的定位（借鉴并超越）

### 6.1 我们借鉴的共识（与业界一致）

- **不要解析任意 host context dump**：应在编排层/SDK 侧形成标准 turns/messages。  
- **异步抽取是现实选择**：重型抽取/建图不应阻塞写入入口。  
- **结构化记忆需要治理**：不治理就必然污染与膨胀（Zep 的 validity / MemOS 的 scheduler 都在解决这件事）。

### 6.2 我们明确要“超越”的点（作为 SaaS 工程底线）

1) **归档真相源（Archive as Source of Truth）**  
   - commit 接单后先归档；任何失败都不丢原文；可回放可重跑。
2) **默认重型（Stage2→Stage3），无路由**  
   - 入口语义简单：会话 close → commit → 自动跑重型管线。
3) **失败重试直到成功（最终一致）**  
   - Stage2/Stage3 任一步失败：保留该步之前的缓存产物，定期重试直至成功。
4) **入口幂等 + 增量续写（anti-pollution）**  
   - `tenant_id + session_id + turn_id` 作为最小幂等边界；  
   - 会话重开仅提交新增 turns；重复提交不重复写；冲突提交直接 409。
5) **Stage2 无损约束（span 校验）**  
   - 过滤可以有损，但保留的原话必须无损（可程序校验），避免 LLM “改写污染”。

### 6.3 可选增强（下一步可吸收的外部优点）

- 借鉴 memU：Stage3 之前增加“对话分段”策略（长会话更稳）。  
- 借鉴 MemOS：后置 scheduler 做长期治理（activation/merge/redundancy filtering），但前提是我们先把入口幂等与归档打牢。

---

## 7. 对 MOYAN 当前施工文档的映射

- 我们的最终方案施工规范：`客户端SDK_会话提交与重型抽取写入_施工规范_v0.md`  
- 本文作为“竞调对照表”，用于解释为什么我们选择：  
  - 默认重型、异步、归档真相源、失败重试直到成功、入口幂等增量提交。

