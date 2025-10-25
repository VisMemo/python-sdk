# M3-Agent 记忆生成模块输入需求调研

> 目的：梳理 M3-Agent memorization pipeline 的输入侧数据要求、依赖与中间格式，为后续与本项目记忆层对接提供依据。

---

## 1. Pipeline 概览

M3-Agent 的记忆生成分为两个阶段：

1. **中间特征生成** (`memorization_intermediate_outputs.py`)
   - 对每个视频切片执行人脸检测/聚类与语音分离/说话人嵌入。
   - 产出 JSON 化的人脸与语音结果，缓存至 `intermediate_outputs` 目录。

2. **记忆图构建** (`memorization_memory_graphs.py`)
   - 对每个切片提取原始视频/帧/音频的 base64 表示。
   - 结合中间特征调用多模态 LLM 生成事件描述与高层摘要，并插入 `VideoGraph`。
   - 输出 pickled `VideoGraph`，包含人物节点、语音节点、文字节点及其关系。

核心依赖：
- 视频切片（约 30s）
- 生成模型：Gemini/Omni/Embedding API
- 视觉/语音模型：InsightFace、ERes2Net 等

---

## 2. 数据准备与 Sample 契约

### 2.1 data.jsonl（每行一个视频样本）
```json
{
  "id": "bedroom_01",
  "video_path": "data/videos/robot/bedroom_01.mp4",
  "clip_path": "data/videos/clips/bedroom_01",
  "mem_path": "data/videos/memory_graphs/bedroom_01.pkl",
  "intermediate_outputs": "data/videos/intermediate_outputs/robot/bedroom_01"
}
```
字段说明：
- `video_path`：原视频（可选，用于回溯）。
- `clip_path`：提前按 `interval_seconds` (默认 30s) 切分的片段目录，文件名形如 `0.mp4`, `1.mp4`。
- `mem_path`：输出的记忆图 pickle。
- `intermediate_outputs`：缓存人脸/语音 JSON，若不存在则在运行时生成。

### 2.2 目录结构要求
```
clip_path/
  ├── 0.mp4
  ├── 1.mp4
  └── ...
intermediate_outputs/
  ├── clip_0_faces.json
  ├── clip_0_voices.json
  ├── clip_1_faces.json
  └── clip_1_voices.json
```

---

## 3. 原始输入（process_video_clip）

调用：`base64_video, base64_frames, base64_audio = process_video_clip(clip_path)`

- `base64_video`: 整个 clip 的二进制（`mp4` → base64）。
- `base64_frames`: 采样帧集合，默认 fps=5，列表元素为 JPG base64 字符串。
- `base64_audio`: 若存在音轨，转换为 PCM 16kHz WAV 并编码为 base64；若无音频则为 `None`。

> 集成要点：如我们已有统一视频抓帧/音频提取服务，需要提供同样格式的数据（base64 字符串列表/字节串）。

---

## 4. 中间输出格式

### 4.1 人脸文件 `clip_{id}_faces.json`
示例结构（`Face` 列表）：
```json
[
  {
    "frame_id": 12,
    "bounding_box": [x1, y1, x2, y2],
    "face_emb": [0.12, ...],
    "cluster_id": 3,
    "extra_data": {
      "face_base64": "...",
      "face_detection_score": "0.92",
      "face_quality_score": "25.7"
    },
    "matched_node": 5
  },
  ...
]
```
生成流程：
1. `extract_faces` + InsightFace 检测 → embedding。
2. `cluster_faces` → 聚类 id。
3. 筛选（检测/质量阈值 + 最大数量）。
4. 根据 `cluster_id` 建立映射并更新 `VideoGraph`：
   - 若已有图节点匹配（余弦阈值 0.3），更新节点；否则新建。
   - 返回 `id2faces`：`{node_id: [face, ...]}`。

### 4.2 语音文件 `clip_{id}_voices.json`
示例结构：
```json
[
  {
    "start_time": "00:05",
    "end_time": "00:09",
    "duration": 4,
    "asr": "把灯打开",
    "audio_segment": "...base64 wav...",
    "embedding": "...binary bytes...",
    "matched_node": 7
  },
  ...
]
```
生成流程：
1. 使用 Gemini LLM (`prompt_audio_segmentation`) 对整段视频进行说话人分段与 ASR。
2. `get_audio_segments` 按时间截取音频子段 → base64。
3. 通过 ERes2NetV2 生成声纹向量，归一化。
4. 与 `VideoGraph` 现有语音节点匹配（余弦阈值 0.6），更新或新建。

> 依赖：需提供 `modules/memorization_agent/ops/models/pretrained_eres2netv2w24s4ep4.ckpt`，并在 GPU 上执行。

---

## 5. 记忆生成（generate_memories）输入

函数签名：`generate_memories(base64_frames, id2faces, id2voices, video_path)`

组装上下文：
```python
video_context = [
  {"type": "video_base64/mp4", "content": video_path or base64_video},
  {"type": "text", "content": "Face features:"},
  {"type": "images/jpeg", "content": [("<face_5>", base64_face), ...]},
  {"type": "text", "content": "Voice features:"},
  {"type": "text", "content": json.dumps({"<voice_7>": [{"start_time": ..., "asr": ...}, ...]})}
]
```

- `<face_X>`、`<voice_Y>` 标签与 `VideoGraph` 节点 ID 对应，用于与记忆文本里的实体 `<face_5>`、`<voice_7>` 对齐。
- 根据 `faces_input` 配置选择使用人脸裁剪 (`face_only`) 或带框帧 (`face_frames`)。

### 5.1 LLM 调用
- 模型：`qwen2.5-omni`（可替换为其他多模态 LLM）。
- Prompt：`prompt_generate_memory_with_ids_sft`，请求输出：
  - `video_descriptions`（episodic memories）
  - `high_level_conclusions`（semantic memories）

返回示例：
```json
{
  "video_descriptions": ["<face_5> 在 <voice_7> 的请求下打开了灯"],
  "high_level_conclusions": ["<face_5> 更倾向回应 <voice_7> 的请求"]
}
```

### 5.2 嵌入与图更新
- 文本嵌入：`text-embedding-3-large`。
- `parse_video_caption` 提取记忆文本中的实体标签，与图节点连边。
- Episodic 记忆 → 新建 text node；Semantic 记忆 → 与现有节点余弦比对（阈值 0.85/0），决定强化、削弱或新建。

---

## 6. 输出：VideoGraph（Pickle）

结构要点：
- 节点类型：`img`、`voice`、`episodic`、`semantic`。
- `nodes[node_id].embeddings`：历史嵌入列表（受 `max_img_embeddings` 等限制）。
- `nodes[node_id].metadata['contents']`: 对应 face/voice base64 或记忆文本。
- `text_nodes_by_clip[clip_id]`：按时间顺序记录每个 clip 的记忆节点。
- `event_sequence_by_clip`：仅记录 episodic 节点顺序，用于回放。

集成策略：
- 可将 `VideoGraph` 作为我们记忆图的输入，通过序列化/反序列化读取。
- 也可直接复用 face/voice/记忆 JSON ，在我们自己的图结构中重建。

---

## 7. 依赖与资源要求汇总

| 环节 | 必要输入/依赖 | 说明 |
| --- | --- | --- |
| 视频切片 | `clip_path` 目录 + 钟表一致的 30s 切片 | 需预处理，可复用现有切片工具 |
| 人脸处理 | InsightFace (GPU) | 需要 `cluster_size`、质量阈值配置 |
| 语音处理 | Gemini LLM + ERes2NetV2 (GPU) | 需网络/API 权限；语音段落>2s |
| 文本嵌入 | `text-embedding-3-large` 或等价模型 | 支持批量 embedding |
| 多模态 LLM | Qwen-Omni或其他 | 输入需包含 base64 图像与 JSON 文本 |
| 存储 | `intermediate_outputs/`、`memory_graphs/` | 建议按视频 ID 分目录管理 |

---

## 8. 与本项目对接建议

1. **统一契约**：
   - 复用 InputFrame → Draft → Event 模型时，应扩展 `SystemEventDraft(category="video")` 以携带 `faces/voices/blob_id`。
   - 记忆 Agent 接口可直接接受 `base64_frames`、`faces_json`、`voices_json`，返回我们的 `MemoryEntry` 列表。

2. **中间缓存复用**：
   - 保留 `clip_{id}_faces.json` 与 `clip_{id}_voices.json` 结构，便于增量处理与回放。
   - 若我们已有统一人脸/语音服务，需保证输出字段兼容（尤其 `extra_data.face_base64` 和 `embedding` 格式）。

3. **API 替换**：
   - 根据实际可用的 LLM/嵌入服务（本地 vs 云端）实现可插拔接口，保留 `generate_memories` 的上下文格式。

4. **时间戳对齐**：
   - 记录每个 clip 的起始 `source_ts`，以便将 episodic 记忆回写到全局时间轴。

---

## 9. 待确认问题

- Gemini/Qwen 等外部模型若无法直接调用，需设计本地替代方案或微调小模型。
- 语音段落长度 < 2 秒默认被丢弃；需要根据家庭场景调整阈值。
- 人脸聚类质量依赖 `cluster_size` 与评分阈值，需根据摄像头清晰度调参。

---

通过以上调研，我们可以确定：要复用 M3-Agent 的记忆生成模块，必须提供切分好的视频片段、可选的中间人脸/语音特征文件以及与其契约一致的 base64 输入格式；同时满足外部模型与 GPU 依赖。在此基础上，我们可逐步将其输出映射到我们的记忆图与事件系统中，实现无缝集成。
