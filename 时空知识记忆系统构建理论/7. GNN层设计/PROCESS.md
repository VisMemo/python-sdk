# PROCESS

## 2025-12-24（Cycle 1）— GNN 层概念架构与落地设计

### 目标
- 在 `TKG-Graph-v1.0-Ultimate.md` 的节点/边设计基础上，明确 GNN/GAT/Temporal GNN 能做什么、最先做什么、以及如何与 Neo4j + Qdrant 共存。
- 特别处理三个现实约束：
  - `tenant_id ≈ user`，对话围绕 Self Entity 高度中心化。
  - 文本入口 Entity 数量大、身份弱、短寿命。
  - 视觉人脸 Person Entity 必须以人脸/声纹为主信号，图上下文只能辅助消歧。

### 实现（文档产出）
- 新增设计文档：`docs/时空知识记忆系统构建理论/7. GNN层设计/GNN层-概念架构与落地设计.md`
  - 说明 GNN 层定位：图为 truth source，向量为 cache/index。
  - 给出可落地的 4 类形态：图增强向量、软 TTL、Temporal 预测、实体对齐建议。
  - 明确写入与索引策略：raw 先写入（Neo4j+Qdrant），GNN 近线回填 enhanced（版本化，永不覆盖 raw）。
  - 给出线上检索的回退与解释性要求（Never break userspace）。
  - 补齐验收指标：质量/成本/风险三类指标，便于后续做灰度与回归。

### 测试验证（用户导向用例）
> 本周期无可执行代码变更；验证以“可操作的验收用例”形式给出，供后续实现阶段落地为自动化测试/回归集。

- 召回质量：时效压制、证据去噪
- 软 TTL：闲聊噪声降权、周期性事件不被误删
- 视觉身份：相似脸不误合并（主信号必须来自 face embedding）
- 回退机制：GNN 向量不可用时回退 raw 向量检索

### 结论与风险
- 结论：第一阶段应只做 `Event` 粒度的 Graph-Enhanced Embedding（ROI 最高、可回退、易解释），并用检索日志驱动 importance/TTL。
- 风险：
  - 如果不做版本化与回退，GNN 的一次训练失误会直接破坏线上体验。
  - 如果让图上下文主导人脸合并，将快速制造不可修复的伪身份。

---

## 2025-12-24（Cycle 2）— Graph‑Native AI Memory 执行版 Roadmap

### 目标
- 将“Graph‑Native AI Memory 双轮驱动（Macro Steering + Micro Refining）”从概念白皮书压实为**可执行的阶段路线图**，明确每阶段交付物、验收指标、回退策略与风险护栏。

### 实现（文档产出）
- 新增路线图：`docs/时空知识记忆系统构建理论/7. GNN层设计/Road map.md`
  - 明确目标/非目标（禁止“单向量承载全库事实”的错觉）。
  - 给出 Phase 0~5 的落地顺序（按风险收益排序），并定义每阶段验收指标。
  - 给出决策矩阵：全图单向量 vs Self‑centered ego‑subgraph。
  - 发散提出 Life Context 的多尺度/多分面/节律/硬约束构建方式。

### 测试验证（验收口径）
> 本周期无代码变更；采用“可操作的线上/离线指标”作为验收测试标准。

- 质量：nDCG@K、Recall@K、Freshness@K、冲突压制率
- 成本：GNN 回填延迟、回查比例、归档误杀率
- 风险：视觉 Person 误合并率、预测污染率（应为 0，靠流程隔离）

### 结论与风险
- 结论：第一阶段胜利定义应是 `vec_event_gnn_v1 + importance 重排 + 可回退`，先把检索质量做出硬提升，再推进 Macro state 与注入。
- 风险：若不做灰度与一键回退，注入/向量替换会把“局部改进”变成“全局事故”。
