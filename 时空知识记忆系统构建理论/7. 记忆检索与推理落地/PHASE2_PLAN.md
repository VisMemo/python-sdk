# Phase 2 执行计划（排除 OCR / 情感检测）

> 目标：补齐 L3-L4 检索/推理能力，让 demo_website 能稳定回答对标清单中的多跳/语义问题并展示可解释证据链。
> 范围：视频 ingest → 图构建 → 检索/解释链 → 前端展示（含 Qdrant 可视化、搜索改版）。
> 非范围：OCR、情感检测、生产级性能优化。

## 1. 目标与交付
- 图谱侧：事件描述绑定 ASR+说话人，生成稳定的 `Event.tags/type`；CO_OCCURS、FIRST_MEET、NEXT_EVENT 关系自动构建并可解释。
- 查询侧：多跳问题有固定查询模板（共现、首次相遇、谁对谁说了什么、事件前后因果），Explain 返回真实证据链。
- 前端侧：搜索界面重构，支持多模态检索与过滤；新增交互式 Qdrant 向量分布视图，与 3D 图/结果联动。
- 验证侧：端到端用例覆盖图构建、Explain、搜索联动，记录于 `PROCESS.md`。

## 2. 后端/图谱工作分解
1) 数据与特征对齐
   - 强制 VLM 输入包含 ASR + speaker diarization，写入事件描述与 `Event.tags/type`。
   - 人物属性补全：known/unknown、眼镜等基础视觉属性落盘 `Entity.attributes`（统一枚举/阈值放 `/shared/types`）。
2) 关系与构建流水线
   - CO_OCCURS 边：定义规则（同时间片/段内共现），ingest 后自动触发 `build_cooccurs`。
   - 首次相遇/认识度：基于 CO_OCCURS 时序生成 `FIRST_MEET` 解释链，复用 `/graph/v0/explain/first_meeting`。
   - 时序增强：确保 `build_timeslices`、`build_event_relations`（NEXT_EVENT）在写入后异步完成；失败记录日志不阻塞读。
3) 查询模板与 Explain
   - 固化 L3-L4 查询模板：① 首次相遇 ② 多次共现 ③ 谁对谁说了什么/回应什么 ④ 事件前后因果/下一步。
   - `/graph/v0/explain/event` 响应包含：事件 → 人物 → 发言/画面证据 → 时间片；禁止生成式补全。
4) 可靠性与观测
   - 结构化日志字段 `event.module.entity.verb` 覆盖 ingest/build/explain；关键计数、空值率、异常分布落指标。
   - 构建任务的结果校验：节点/边计数、空值率检查，异常告警。
5) 测试验证
   - 集成测试：ingest → 图构建，校验 CO_OCCURS、FIRST_MEET、NEXT_EVENT 生成；事件描述含 ASR 文本。
   - Explain E2E：至少 3 个多跳问题回放，验证回答与证据链节点/边存在且时间戳对齐。
   - Property-based：共现/首次相遇生成器的顺序一致性测试。

## 3. demo_website 改版计划
1) 后端接口准备
   - Qdrant 近邻/分桶查询接口：按 entity/event/utterance 类型、时间范围过滤，返回 Graph node id 与媒体 URL。
   - 多模态搜索统一端点：文本/语音/图像 embedding + 过滤条件，携带节点/证据信息。
2) 前端信息架构
   - 搜索面板重构：模式切换（语义全文/语音/图像向量）、时间与类型过滤、结果列表与 Graph 高亮联动。
   - Qdrant 可视化：新增 `components/qdrant-viz`，展示 2D/3D 投影（UMAP/TSNE 预计算下发）及近邻连线，点击与 GraphCanvas/结果联动。
   - 解释链面板：在搜索/问答结果中展开证据链（节点/边/媒体），可跳转时间片/片段。
3) 交互与反馈
   - 搜索状态：Loading/计时/召回数显示；错误提示包含 API 路径与错误码，提供重试。
   - “肌肉感”展示：显示查询耗时、候选数、过滤后数；提供问题模板快捷按钮。
4) 状态与模块边界
   - `useDemoController` 作为公共入口，搜索/Qdrant 视图通过显式 props 交互，禁止深层导入。
   - 组件拆分：查询表单、结果列表、解释链、Qdrant 可视化独立文件，公共类型由模块入口导出。
5) 前端测试与验收
   - 交互测试：搜索→高亮→证据链→媒体播放；筛选与模式切换可用。
   - 端到端：预置 3 个问题脚本验证搜索与图联动；记录于 `demo_website/PROCESS.md`。

## 4. Wow Factor 前端增强计划

> 目标：让 Demo 在视觉和交互上达到"一眼惊艳"的效果，展示 MOYAN 的技术深度与差异化。

### 4.1 核心视觉效果

#### ① 记忆星图（Memory Constellation）
- **效果**：3D 图谱不再是普通节点图，而是"星空"效果——Entity 为恒星（大、亮），Evidence 为卫星（小、绕转），Event 为星云（发光团）。
- **实现**：
  - 使用 Three.js 自定义 shader，节点带辉光（glow）和脉冲动画。
  - Entity 节点根据 `co_occurs_count` 调整亮度（越活跃越亮）。
  - 选中时：粒子光线从选中节点向关联节点扩散。
- **文件**：`components/graph/constellation-canvas.tsx`

#### ② 解释链动画（Reasoning Flow Animation）
- **效果**：当查询返回多跳解释链时，不是静态高亮，而是"电流流动"动画沿证据路径传递。
- **实现**：
  - 边使用 animated dash-array + gradient stroke。
  - 节点按顺序亮起（500ms 间隔），配合音效（可选）。
  - 最终节点爆发式放大 + 光晕。
- **示例路径**：`回家事件 ⚡→ 语音片段 ⚡→ 张三 ⚡→ 打电话事件`
- **文件**：`components/graph/reasoning-flow.tsx`

#### ③ 时间河流（Temporal River）
- **效果**：底部显示时间轴，事件/语音/视频片段以"河流"形式流动，点击任意位置跳转到对应时刻。
- **实现**：
  - 横向 SVG 时间轴，事件为彩色气泡，高度表示密度/重要性。
  - 支持 zoom（按天/小时/分钟）和 scrub。
  - 当前时间点有垂直光标线，拖动时图谱实时过滤。
- **文件**：`components/timeline/temporal-river.tsx`

### 4.2 交互增强

#### ④ 实时推理仪表盘（Live Inference Dashboard）
- **效果**：查询时显示"MOYAN 正在思考"面板，展示内部处理流程。
- **内容**：
  ```
  ┌─────────────────────────────────────┐
  │ 🔍 Query: "第一次见面"              │
  │ ├─ Vector Search    ████████░░ 80ms │
  │ ├─ Graph Traverse   ██████░░░░ 60ms │
  │ ├─ Evidence Rank    ████░░░░░░ 40ms │
  │ └─ Total            ██████████ 180ms│
  │ 📊 Retrieved: 12 nodes, 23 edges    │
  └─────────────────────────────────────┘
  ```
- **价值**：展示系统"肌肉"，与竞品的黑盒形成对比。
- **文件**：`components/inference-dashboard.tsx`

#### ⑤ 证据卡片画廊（Evidence Gallery）
- **效果**：选中 Entity 时，右侧展示 Masonry 瀑布流画廊：人脸样本、语音波形、关键帧缩略图。
- **交互**：
  - hover 放大 + 显示时间戳。
  - 点击播放对应视频/音频片段。
  - 滤镜切换：face / voice / scene / object。
- **文件**：`components/evidence-gallery.tsx`

### 4.3 设计系统升级

#### ⑥ 玻璃拟态主题（Glassmorphism Theme）
- **配色**：
  - 背景：深蓝渐变 `#0a0e27 → #1a1f4a`
  - 面板：半透明毛玻璃 `backdrop-blur-xl bg-white/5`
  - 强调色：电光蓝 `#00d4ff`、紫罗兰 `#a855f7`
- **字体**：Inter (UI) + JetBrains Mono (数据/代码)
- **动效**：所有面板展开/收起使用 `framer-motion` 弹簧动画。

#### ⑦ 深色/浅色模式切换
- 默认深色（更酷），支持一键切换浅色（演示/投影友好）。

### 4.4 实现优先级

| 特性 | 冲击力 | 工作量 | 优先级 |
|:---|:---|:---|:---|
| ② 解释链动画 | ⭐⭐⭐⭐⭐ | 2天 | **P0** |
| ④ 推理仪表盘 | ⭐⭐⭐⭐ | 1天 | **P0** |
| ③ 时间河流 | ⭐⭐⭐⭐ | 2天 | P1 |
| ① 记忆星图 | ⭐⭐⭐⭐⭐ | 3天 | P1 |
| ⑤ 证据画廊 | ⭐⭐⭐ | 1天 | P2 |
| ⑥⑦ 主题升级 | ⭐⭐⭐ | 1天 | P2 |

### 4.5 示例代码：解释链动画

```tsx
// components/graph/reasoning-flow.tsx
export function ReasoningFlow({ chain, onComplete }: Props) {
  const [activeIndex, setActiveIndex] = useState(-1);
  
  useEffect(() => {
    chain.forEach((_, i) => {
      setTimeout(() => setActiveIndex(i), i * 500);
    });
    setTimeout(onComplete, chain.length * 500);
  }, [chain]);

  return (
    <svg className="absolute inset-0 pointer-events-none">
      {chain.map((edge, i) => (
        <g key={i} className={i <= activeIndex ? "animate-flow-in" : "opacity-0"}>
          <line 
            x1={edge.from.x} y1={edge.from.y}
            x2={edge.to.x} y2={edge.to.y}
            stroke="url(#electric-gradient)"
            strokeWidth={i === activeIndex ? 4 : 2}
            strokeDasharray="8 4"
            className="animate-dash"
          />
          {i === activeIndex && (
            <circle cx={edge.to.x} cy={edge.to.y} r="20" className="animate-pulse-glow" />
          )}
        </g>
      ))}
      <defs>
        <linearGradient id="electric-gradient">
          <stop offset="0%" stopColor="#00d4ff" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
    </svg>
  );
}
```

## 5. Definition of Done（P2）
- 图：事件描述含 ASR+说话人信息，CO_OCCURS/FIRST_MEET/NEXT_EVENT 自动构建且可解释。
- 查询：多跳模板可返回节点/边/证据链，Explain 不依赖生成式幻想。
- 前端：新搜索与 Qdrant 可视化上线，结果联动 3D 图，展示查询性能指标。
- 验证：上述测试通过，PROCESS 文档更新数据流、接口、测试结果。
