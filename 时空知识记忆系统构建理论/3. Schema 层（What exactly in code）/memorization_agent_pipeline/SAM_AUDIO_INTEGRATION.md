# SAM-Audio Integration Notes (Draft)

> 目标：解释当前音频/说话人链路，并说明如何用 SAM-Audio 增强人脸-音频共现与对话理解。  
> 状态：Pre-production 评估文档（不影响现有稳定路径）。

## 1) 当前系统（事实）

### 1.1 音频链路
- **ASR-only 模式**：只做语音转写，无说话人区分。  
  开关：`MEMA_PIPELINE_ENABLE_DIARIZATION=0`，`asr.mode` 可为 `local|hybrid|off`。
- **Diarization 模式**：语音分离 + 说话人嵌入 + voice 节点。  
  产物：
  - `id2audios`（按 voice_id 分组的 ASR 段）
  - `asr_memories`（包含 `text + timestamp + clip_id + voice_id`）

### 1.2 人脸-说话人映射
- 映射来源：
  - `character_mappings`（跨模态融合）
  - `SqliteIdentityRegistry`（人脸/声纹聚合）
- 输出：`person_tag_to_person_id`  
  用于把 voice 证据与 person 实体绑定，生成 `SPOKEN_BY` 边。

### 1.3 图谱落地（对话可用性）
- `UtteranceEvidence` 节点写入时间戳、speaker_track_id（如果有 diarization）。
- `Event` 与 `UtteranceEvidence` 通过 `SUPPORTED_BY` 关联。
- 问题：对话内容和“谁说的”仍依赖 diarization 质量；  
  混响/背景音/多人重叠时错误高。

### 1.4 现有瓶颈
1) Diarization 只靠音频，缺少“视觉约束”。  
2) 同时多人说话时，speaker -> face 映射不稳定。  
3) 对话理解靠 ASR 文本 + VLM 推断，缺少“面向人脸的声音分离”。

## 2) SAM-Audio 能做什么

SAM-Audio 是**基于多模态提示的音频分离模型**，不是传统 diarization：
- 输入：原始音频 + 提示（文本/视觉掩膜/时间片段）  
- 输出：**目标音频** + residual（背景）  
- 关键能力：
  - **视觉提示**：用“人脸/人物掩膜”指导分离某人的声音  
  - **时间片段提示**：用时间 anchor 引导分离  
  - 多候选 + 排序（ClapRanker/ImageBind Ranker）

这意味着它能把“视觉对象”直接绑定到“声音片段”。

## 3) 增强思路（替代/混合）

### 3.1 方式 A：替代 diarization（仅限 on-screen）
1. 每个 clip 内检测到人脸 → 生成 mask。  
2. 用 SAM-Audio（视觉 prompt）分离该人脸对应音频。  
3. 对分离音频做 ASR → 形成“person-specific transcript”。  
4. 直接写 `UtteranceEvidence` 并绑定到该 person。  

优势：人脸与声音强绑定。  
局限：对“画外音/不在画面的人”覆盖不足。

### 3.2 方式 B：混合模式（推荐）
- **SAM-Audio 负责 on-screen 说话人**  
  用人脸 mask 分离，生成高置信 speaker → person 映射。
- **原 diarization 兜底 off-screen 说话人**  
  没有视觉提示时仍走老路径。
- **融合策略**  
  - 如果 SAM-Audio 输出音频覆盖了同一时间段，则优先采用  
  - 若 SAM-Audio 失败，回退 diarization

### 3.3 方式 C：局部修复
只在“重叠说话/角色易混”的片段运行 SAM-Audio，降低成本。

## 4) 替换点（pipeline 级）

1. **AudioExtractor / voice_processing**  
   - 新增 `sam_audio` 适配器（输入：clip + face mask + time span）。  
   - 输出目标音频 → ASR → 生成 `asr_memories`。

2. **speaker → person 绑定**  
   - `voice_id` 可直接用 face track id（稳定、可读）。  
   - 仍保留 registry 映射作为 fallback。

3. **VLM 输入增强**  
   - `[ASR transcripts]` 不变  
   - 追加“face_id → transcript”对照表（减少 VLM 误配）

## 5) 预期收益

1) **说话人与人脸关联更稳**（降低错配）。  
2) **对话理解更清晰**（每条台词更容易归属正确人物）。  
3) **Event summary 更可靠**（VLM 的输入更干净）。

## 6) 风险与成本

- 计算成本高（视频每人脸分离一次）。  
- 对“画外音/背对镜头”仍需 diarization。  
- 需要稳定的视觉 mask（当前 pipeline 需要保证人脸轨迹/跟踪）。

## 7) 建议试点验证

**输入：** `Jian.mp4`  
**对比实验：**  
- Baseline：现有 diarization  
- SAM-Audio：视觉提示分离 + ASR  

**验收指标（最小集）：**
1. speaker → person 匹配准确率（人工 spot check 10 段）  
2. Event summary 是否正确包含台词归属  
3. 对话内容是否更连贯（主观评分）

---

结论：SAM-Audio 不是“完全替代”，更像“强约束分离器”。  
最佳路径是 **混合模式**：视觉提示分离优先，diarization 兜底。
