# PROCESS — omem SDK

本文件记录 omem SDK 的工程演进，确保每次变更都有清晰的“范围/动机/验证”。

---

## 2025-12-25 — SaaS Phase1：请求头标准化 + 错误分类 + 重试
- **范围**：
  - `omem/client.py`：新增 Authorization: Bearer、X-Request-ID、重试策略与错误分类。
  - `omem/__init__.py`：导出 RetryConfig 与错误类型。
  - `modules/memory/tests/unit/test_omem_sdk_http.py`：新增重试测试与请求头断言。
- **决策（Why）**：
  - SaaS 网关需要标准 `Authorization` 与 `X-Request-ID` 便于追踪；
  - SDK 侧必须能识别 401/403/429/402 等错误并进行可靠重试。
- **实现（What/How）**：
  - 默认生成 `X-Request-ID` 并透传；
  - 按状态码抛出明确的异常类型；
  - 429/5xx 与网络错误触发指数退避重试（支持 Retry-After）。
- **验证（Test）**：
  - `.venv/bin/python -m pytest modules/memory/tests/unit/test_omem_sdk_http.py modules/memory/tests/unit/test_api_auth_security.py modules/memory/tests/unit/test_api_scope_coverage.py -q`
  - **结果**：通过（19 passed）。
