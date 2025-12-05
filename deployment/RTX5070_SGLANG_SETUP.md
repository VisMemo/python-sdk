# RTX 50 Series (Blackwell) + SGLang 部署指南

> 适用于 NVIDIA RTX 5070/5080/5090 等 Blackwell 架构显卡 (sm_120a)

## 硬件要求

| 组件 | 最低要求 | 推荐配置 |
|------|---------|---------|
| GPU | RTX 5070 (12GB VRAM) | RTX 5080/5090 |
| CUDA Runtime | 12.0+ | 12.8 |
| Driver | 575.0+ | 最新稳定版 |
| RAM | 32GB | 64GB |

## 软件依赖

| 软件 | 版本要求 | 说明 |
|------|---------|------|
| PyTorch | 2.8.0+ (cu128) | 支持 Blackwell |
| SGLang | 0.5.5+ | 稳定版即可 |
| transformers | 4.55+ | 支持 Qwen3-VL |
| Python | 3.11.x | 项目约束 |

### 重要：Attention Backend 选择

| Backend | nvcc 要求 | 性能 | 推荐场景 |
|---------|----------|------|----------|
| **triton** | 无需 | 良好 | **默认推荐**（无 JIT 编译问题）|
| flashinfer | 12.8+ | 最佳 | 已安装 CUDA 12.8 Toolkit |

> ⚠️ **关键问题**：FlashInfer 需要 JIT 编译 CUDA 内核，要求系统 nvcc 支持 `compute_120a`（即 CUDA 12.8+）。
> 如果你的 nvcc 版本较旧（如 11.5），请使用 `triton` 后端。

## 快速开始

### 1. 安装依赖（可选）

```bash
cd /path/to/MOYAN_AGENT_INFRA

# 如果尚未安装 SGLang
./scripts/start_sglang_5070.sh --install
```

### 2. 启动服务器（推荐方式）

```bash
# ⚠️ 推荐：使用 triton 后端 + ModelScope 镜像
./scripts/start_sglang_5070.sh --use-mirror-non-fp8
```

这将：
- 使用 ModelScope 镜像（`https://hf-mirror.com`），无需 VPN
- 使用 `triton` 注意力后端，避免 FlashInfer JIT 编译问题
- 模型：`Qwen/Qwen3-VL-2B-Instruct`（非 FP8 版本）

#### 其他启动方式

```bash
# 使用自定义模型
SGLANG_MODEL="Qwen/Qwen2.5-7B-Instruct" ./scripts/start_sglang_5070.sh --use-mirror-non-fp8

# 使用自定义端口
SGLANG_PORT=8080 ./scripts/start_sglang_5070.sh --use-mirror-non-fp8

# 调整显存占用（默认 0.70）
SGLANG_MEM_FRAC=0.60 ./scripts/start_sglang_5070.sh --use-mirror-non-fp8

# 使用 flashinfer 后端（需要 CUDA 12.8+ nvcc）
SGLANG_BACKEND=flashinfer ./scripts/start_sglang_5070.sh --use-mirror-non-fp8
```

默认配置：
- **模型**: `Qwen/Qwen3-VL-2B-Instruct`
- **端口**: 30000
- **主机**: 0.0.0.0
- **内存**: 70% GPU 显存
- **后端**: triton（无需 JIT 编译）

### 3. 测试连接

```bash
# 健康检查
curl http://localhost:30000/health

# 生成测试
curl -X POST http://localhost:30000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen3-VL-2B-Instruct-FP8",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 手动安装步骤

如果自动脚本失败，按以下步骤手动安装：

### Step 1: 安装 PyTorch Nightly (CUDA 12.8)

```bash
source .venv/bin/activate

# 使用 uv 安装 PyTorch Nightly
uv pip install --upgrade \
    torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/nightly/cu128
```

### Step 2: 安装 SGLang Nightly

```bash
# 方式 A: pip/uv 安装 (推荐)
uv pip install "sglang[all]" --prerelease=allow --upgrade

# 方式 B: 从源码安装 (如果需要最新特性)
git clone -b main https://github.com/sgl-project/sglang.git
cd sglang
pip install -e "python[all]"
```

### Step 3: 安装 FlashInfer

```bash
# Blackwell 需要最新的 FlashInfer
uv pip install flashinfer-python --upgrade --force-reinstall --no-deps
```

### Step 4: 设置环境变量

```bash
# 在 venv 中使用 pip 安装的 CUDA 运行时
export CUDA_HOME="${VENV_DIR}/lib/python3.11/site-packages/nvidia/cuda_runtime"
export LD_LIBRARY_PATH="${CUDA_HOME}/lib:${LD_LIBRARY_PATH}"

# 禁用 CUDA Graph (Blackwell 可能有兼容性问题)
export SGLANG_DISABLE_CUDA_GRAPH=1
```

## 模型选择

### Qwen3-VL 系列 (Vision-Language)

| 模型 | VRAM 需求 | 推荐显卡 |
|------|----------|---------|
| Qwen3-VL-2B-Instruct-FP8 | ~4GB | RTX 5070 |
| Qwen3-VL-8B-Instruct | ~16GB | RTX 5080 |
| Qwen3-VL-32B-Instruct | ~64GB | RTX 5090 x2 |

### 启动不同模型

```bash
# 修改脚本中的 MODEL_PATH，或直接运行：
uv run --no-sync python -m sglang.launch_server \
    --model-path "Qwen/Qwen3-VL-2B-Instruct-FP8" \
    --host 0.0.0.0 \
    --port 30000 \
    --trust-remote-code \
    --disable-cuda-graph
```

## 常见问题

### Q0: ValueError: Unknown scheme for proxy URL 'socks://...'

**原因**: `httpx`（Hugging Face Hub 使用的 HTTP 客户端）不支持 SOCKS 代理，只支持 HTTP/HTTPS 代理

**解决方案（推荐）**: 使用 ModelScope 镜像（无需代理）

```bash
./scripts/start_sglang_5070.sh --use-mirror
```

**其他解决方案**:

1. **临时禁用 SOCKS 代理**:
   ```bash
   unset ALL_PROXY all_proxy
   ./scripts/start_sglang_5070.sh
   ```

2. **转换为 HTTP 代理**（如果 VPN 支持）:
   ```bash
   # 如果你的 VPN 提供 HTTP 代理端口（通常是 7890 或 8080）
   export HTTP_PROXY=http://127.0.0.1:7890
   export HTTPS_PROXY=http://127.0.0.1:7890
   unset ALL_PROXY all_proxy
   ./scripts/start_sglang_5070.sh
   ```

3. **使用本地已下载的模型**:
   ```bash
   # 如果模型已在 ~/.cache/huggingface 中，禁用代理即可
   unset ALL_PROXY all_proxy HTTP_PROXY HTTPS_PROXY
   ./scripts/start_sglang_5070.sh
   ```

### Q1: 脚本报错 "Bad substitution" 或 "nvidia-smi not found"

**原因**: 脚本使用了 bash 特性，不能用 `sh` 运行

**解决**:
```bash
# ❌ 错误：不要用 sh 运行
sh ./scripts/start_sglang_5070.sh

# ✅ 正确：使用 ./ 或 bash
./scripts/start_sglang_5070.sh
# 或者
bash ./scripts/start_sglang_5070.sh
```

如果 `nvidia-smi` 检测失败，确保：
- NVIDIA 驱动已安装：`/usr/bin/nvidia-smi` 存在
- 脚本有执行权限：`chmod +x ./scripts/start_sglang_5070.sh`

### Q2: ImportError: cannot import name 'Qwen2_5_VLProcessor'

**原因**: `transformers` 版本太旧，不支持 Qwen3-VL

**解决**:
```bash
# 安装最新版本的 transformers (从 GitHub main)
uv pip install "transformers @ git+https://github.com/huggingface/transformers.git@main" --upgrade
```

### Q3: PyTorch 2.9.1 & CuDNN 兼容性错误

**原因**: PyTorch 2.9.1 需要 cuDNN 9.15+

**解决**:
```bash
# 升级 cuDNN 到 9.16
uv pip install nvidia-cudnn-cu12==9.16.0.29
```

### Q4: FlashInfer 报错 "Unsupported gpu architecture 'compute_120a'"

**原因**: FlashInfer JIT 编译需要 nvcc 支持 `compute_120a`，即 CUDA Toolkit 12.8+。你的系统 nvcc 版本太旧。

**检查 nvcc 版本**:
```bash
nvcc --version
# 如果显示 CUDA 11.x 或 12.0-12.7，就会遇到此问题
```

**解决方案（推荐）**: 使用 Triton 后端，无需 JIT 编译

```bash
# 方式 1：使用脚本（推荐）
./scripts/start_sglang_5070.sh --use-mirror-non-fp8

# 方式 2：手动启动
python -m sglang.launch_server \
    --model-path "Qwen/Qwen3-VL-2B-Instruct" \
    --attention-backend triton \
    --sampling-backend pytorch \
    --mem-fraction-static 0.70 \
    --disable-cuda-graph \
    --trust-remote-code
```

**备选方案**: 安装 CUDA Toolkit 12.8+（需要 root 权限）
```bash
# 下载并安装 CUDA 12.8
# https://developer.nvidia.com/cuda-12-8-0-download-archive
```

### Q5: RuntimeError: Assertion error ... std::filesystem::exists(nvcc_path)

**原因**: FP8 量化模型需要 JIT 编译 CUDA 内核，但找不到 `nvcc`（CUDA 编译器）

**解决**:

1. **自动检测（推荐）**: 脚本已自动检测系统 CUDA 安装，确保 `nvcc` 在 PATH 中
   ```bash
   # 脚本会自动设置 CUDA_HOME 和 PATH
   ./scripts/start_sglang_5070.sh --use-mirror
   ```

2. **手动设置 CUDA_HOME**:
   ```bash
   # 找到 nvcc 位置
   which nvcc
   
   # 设置 CUDA_HOME（根据你的系统调整）
   export CUDA_HOME=/usr/lib/nvidia-cuda-toolkit  # Ubuntu/Debian
   # 或
   export CUDA_HOME=/usr/local/cuda-12.x  # 手动安装的 CUDA
   
   export PATH="${CUDA_HOME}/bin:${PATH}"
   ```

3. **安装 CUDA Toolkit**（如果系统没有）:
   ```bash
   # Ubuntu/Debian
   sudo apt install nvidia-cuda-toolkit
   
   # 验证安装
   nvcc --version
   ```

4. **使用非 FP8 版本的模型**（如果不需要 FP8 量化）:
   ```bash
   # 修改脚本中的 MODEL_PATH
   MODEL_PATH="Qwen/Qwen3-VL-2B-Instruct"  # 非 FP8 版本
   ```

### Q6: CUDA_HOME 找不到

**注意**: 脚本现在会自动检测系统 CUDA。如果仍有问题：

```bash
# 对于运行（不需要 nvcc）
export CUDA_HOME="${VENV_DIR}/lib/python3.11/site-packages/nvidia/cuda_runtime"

# 对于 FP8 编译（需要 nvcc）
export CUDA_HOME=/usr/lib/nvidia-cuda-toolkit  # 或你的系统 CUDA 路径
export PATH="${CUDA_HOME}/bin:${PATH}"
```

### Q7: OOM (显存不足)

**解决**:
```bash
# 减少静态显存分配
--mem-fraction-static 0.7

# 或使用更小的模型
--model-path "Qwen/Qwen2.5-0.5B-Instruct"
```

### Q8: Docker 方式部署

如果遇到本地安装问题，可以使用 Docker (需要 NVIDIA Container Toolkit):

```bash
docker run --gpus all \
    --shm-size 32g \
    -p 30000:30000 \
    -v ~/.cache/huggingface:/root/.cache/huggingface \
    --env "HF_TOKEN=<your-token>" \
    --ipc=host \
    lmsysorg/sglang:nightly \
    python3 -m sglang.launch_server \
    --model-path Qwen/Qwen3-VL-2B-Instruct-FP8 \
    --host 0.0.0.0 \
    --port 30000 \
    --trust-remote-code
```

## 参考链接

- [SGLang 官方安装文档](https://docs.sglang.io/get_started/install.html)
- [SGLang Nightly Docker](https://hub.docker.com/r/lmsysorg/sglang/tags?name=nightly)
- [PyTorch Nightly Index](https://download.pytorch.org/whl/nightly/cu128)
- [FlashInfer GitHub](https://github.com/flashinfer-ai/flashinfer)

---
*Last Updated: 2025-12-05*

## 更新记录

- **2025-12-05**: 添加 triton 后端支持，修复 nvcc 12.8 以下版本的 FlashInfer JIT 编译问题
- **2025-12-04**: 初始版本

