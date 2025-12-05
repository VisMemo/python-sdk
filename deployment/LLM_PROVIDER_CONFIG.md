# LLM Provider Configuration Guide

本指南介绍如何配置 Memory 和 Memorization Agent 模块的 LLM 提供商。

## 支持的提供商

| Provider | 类型 | 说明 | 环境变量 |
|----------|------|------|----------|
| `sglang` | 本地 | 本地 SGLang 服务（推荐开发/私有部署） | `SGLANG_BASE_URL`, `SGLANG_MODEL` |
| `openai` | 云端 | OpenAI API | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| `openrouter` | 云端 | OpenRouter 代理（多模型访问） | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| `gemini` | 云端 | Google Gemini | `GOOGLE_API_KEY`, `GEMINI_MODEL` |
| `qwen` | 云端 | 阿里通义千问 | `DASHSCOPE_API_KEY`, `QWEN_MODEL` |
| `glm` | 云端 | 智谱 GLM | `ZHIPUAI_API_KEY`, `GLM_MODEL` |
| `openai_compat` | 自定义 | 任意 OpenAI 兼容 API | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` |

## 快速配置

### 方式一：使用本地 SGLang（推荐用于开发）

1. **启动 SGLang 服务**：

```bash
./scripts/start_sglang_5070.sh --use-mirror-non-fp8
```

2. **设置环境变量**（在 `.env` 或终端中）：

```bash
export SGLANG_BASE_URL=http://localhost:30000
export SGLANG_MODEL=Qwen/Qwen3-VL-2B-Instruct
```

3. **配置 memory.config.yaml**：

```yaml
memory:
  llm:
    text:
      provider: sglang
      model: Qwen/Qwen3-VL-2B-Instruct
    multimodal:
      provider: sglang
      model: Qwen/Qwen3-VL-2B-Instruct
      required: true
      mapping_strategy: generic_image_url  # 或 none（禁用映射）
```

> **`mapping_strategy` 说明**：
> - `generic_image_url`：自动将 `media` 字段转换为 OpenAI 兼容的 `image_url` 格式
> - `none`：禁用转换，直接传递原始消息（适用于已预格式化的 payload）

### 方式二：使用云端 API

#### OpenAI

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini
```

```yaml
memory:
  llm:
    text:
      provider: openai
      model: gpt-4o-mini
    multimodal:
      provider: openai
      model: gpt-4o
```

#### Google Gemini

```bash
export GOOGLE_API_KEY=...
export GEMINI_MODEL=gemini-2.5-flash-lite
```

```yaml
memory:
  llm:
    multimodal:
      provider: gemini
      model: gemini-2.5-flash-lite
      mapping_strategy: none  # Gemini SDK 自带图片处理
```

#### OpenRouter（访问多种模型）

```bash
export OPENROUTER_API_KEY=sk-or-...
export OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free
```

```yaml
memory:
  llm:
    multimodal:
      provider: openrouter
      model: google/gemini-2.0-flash-exp:free
```

## 环境变量优先级

LLM 适配器按以下优先级选择提供商：

1. **SGLang**：`SGLANG_BASE_URL` + `SGLANG_MODEL`
2. **自定义 API**：`LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL`
3. **配置文件**：`memory.config.yaml` 中的 `llm.text.provider` / `llm.multimodal.provider`
4. **环境检测**：按顺序检测 `OPENROUTER_API_KEY` → `OPENAI_API_KEY` → `GOOGLE_API_KEY` → ...

## 混合配置（本地 + 云端）

你可以同时配置本地和云端，在不同场景切换：

```yaml
# memory.config.yaml
memory:
  llm:
    text:
      provider: sglang              # 文本任务使用本地
      model: Qwen/Qwen3-VL-2B-Instruct
    multimodal:
      provider: gemini              # 多模态任务使用云端
      model: gemini-2.5-flash-lite
```

## 测试 LLM 连接

### 测试 SGLang 服务

```bash
curl http://localhost:30000/health

curl -X POST http://localhost:30000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen3-VL-2B-Instruct",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 50
  }'
```

### 测试 Memory 模块 LLM 适配器

```python
from modules.memory.application.llm_adapter import build_llm_from_env

adapter = build_llm_from_env()
if adapter:
    response = adapter.generate([{"role": "user", "content": "Hello!"}])
    print(f"Provider: {adapter.kind}, Response: {response}")
else:
    print("No LLM adapter configured")
```

## 常见问题

### Q1: SGLang 服务连接失败

检查：
1. 服务是否启动：`curl http://localhost:30000/health`
2. 端口是否正确：`SGLANG_BASE_URL` 应包含正确端口
3. 防火墙设置

### Q2: 多模态请求失败

确保：
1. 使用支持多模态的模型（如 Qwen3-VL, GPT-4o, Gemini）
2. `mapping_strategy` 设置正确：
   - `generic_image_url`：适用于大多数 OpenAI 兼容 API
   - `none`：适用于 Gemini（自带图片处理）

### Q3: 如何在不同环境间切换

使用环境变量覆盖配置文件：

```bash
# 开发环境（本地）
export SGLANG_BASE_URL=http://localhost:30000
export SGLANG_MODEL=Qwen/Qwen3-VL-2B-Instruct

# 生产环境（云端）
export GOOGLE_API_KEY=...
export GEMINI_MODEL=gemini-2.5-flash-lite
```

---
*Last Updated: 2025-12-05*

