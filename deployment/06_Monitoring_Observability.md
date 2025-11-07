# 监控与可观测性

## 📊 监控栈选型

### 方案对比
| 方案 | 易用性 | 功能 | 成本 | 推荐度 |
|------|--------|------|------|--------|
| **Prometheus + Grafana** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 低 | ✅ |
| DataDog | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 高 | ⭐⭐ |
| New Relic | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 高 | ⭐⭐ |
| 自研 | ⭐ | ⭐ | 中 | ❌ |

**推荐：Prometheus + Grafana（开源）**
- ✅ 成本低
- ✅ 生态成熟
- ✅ 高度可定制

## 🎯 关键指标体系

### RED方法 (Rate, Errors, Duration)
```yaml
API指标:
  Rate (速率):
    - 每秒请求数 (RPS)
    - 租户级别QPS
    - 按API分组统计

  Errors (错误):
    - HTTP 4xx/5xx比率
    - 业务错误率
    - 认证失败率

  Duration (延迟):
    - P50/P95/P99延迟
    - 慢查询识别
    - 性能退化趋势

系统指标:
  CPU使用率:
    - 整体CPU利用率
    - 按服务分组
    - GPU利用率

  内存使用:
    - 堆内存使用
    - 缓存命中率
    - 内存泄漏检测

  存储I/O:
    - 磁盘使用率
    - I/O等待时间
    - Neo4j/Qdrant性能

业务指标:
  租户活跃度:
    - 日活租户数
    - API调用分布
    - 资源使用排行

  成本指标:
    - 每租户成本
    - GPU使用成本
    - 存储成本分析
```

### 监控配置
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'api-server'
    static_configs:
      - targets: ['api:8000']
    metrics_path: /metrics
    scrape_interval: 5s

  - job_name: 'neo4j'
    static_configs:
      - targets: ['neo4j:9090']

  - job_name: 'qdrant'
    static_configs:
      - targets: ['qdrant:6333']
```

## 📈 Grafana仪表板

### 核心仪表板设计
```json
{
  "dashboard": {
    "title": "MOYAN SaaS监控仪表板",
    "panels": [
      {
        "title": "API请求速率",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total[5m])) by (status_code)",
            "legendFormat": "{{status_code}}"
          }
        ]
      },
      {
        "title": "P99延迟",
        "type": "singlestat",
        "targets": [
          {
            "expr": "histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "P99"
          }
        ]
      },
      {
        "title": "活跃租户数",
        "type": "graph",
        "targets": [
          {
            "expr": "count(increase(api_calls_total[24h]) > 0)",
            "legendFormat": "活跃租户"
          }
        ]
      },
      {
        "title": "GPU利用率",
        "type": "graph",
        "targets": [
          {
            "expr": "avg(gpu_utilization_ratio)",
            "legendFormat": "平均GPU利用率"
          }
        ]
      }
    ]
  }
}
```

## 🚨 告警策略

### 告警规则配置
```yaml
# alert_rules.yml
groups:
  - name: moyan_alerts
    rules:
      - alert: HighAPIErrorRate
        expr: |
          (
            sum(rate(http_requests_total{status_code=~"5.."}[5m]))
            /
            sum(rate(http_requests_total[5m]))
          ) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "API错误率超过5%"
          description: "当前错误率: {{ $value | humanizePercentage }}"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API P99延迟超过500ms"

      - alert: DiskSpaceLow
        expr: |
          (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "磁盘空间不足10%"

      - alert: GPUMemoryHigh
        expr: |
          (nvidia_gpu_memory_used_bytes / nvidia_gpu_memory_total_bytes) > 0.9
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "GPU内存使用率超过90%"
```

## 📝 结构化日志

### 日志格式标准
```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "INFO",
  "message": "处理视频请求",
  "service": "moyan-api",
  "tenant_id": "tenant_abc123",
  "user_id": "user_xyz789",
  "trace_id": "abc-123-def-456",
  "span_id": "xyz-789",
  "api_endpoint": "/api/v1/video/process",
  "method": "POST",
  "status_code": 200,
  "response_time_ms": 150,
  "request_size": 1024,
  "response_size": 2048,
  "metadata": {
    "job_id": "job_001",
    "video_url": "https://...",
    "processing_time": 50
  }
}
```

### 日志聚合
```yaml
# fluent-bit.conf
[SERVICE]
    Flush         1
    Log_Level     info
    Daemon        off
    Parsers_File  parsers.conf

[INPUT]
    Name              tail
    Path              /var/log/containers/moyan-*.log
    Parser            docker
    Tag               kube.*
    Refresh_Interval  5

[FILTER]
    Name    grep
    Match   kube.*
    Regex   level (INFO|WARN|ERROR)

[OUTPUT]
    Name  es
    Match *
    Host  elasticsearch.logging.svc.cluster.local
    Port  9200
    Index moyan-logs
```

## 🔍 分布式追踪

### OpenTelemetry配置
```python
from opentelemetry import trace
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

# 初始化追踪
trace.set_tracer_provider(TracerProvider())
tracer = trace.get_tracer(__name__)

# 配置Jaeger导出器
jaeger_exporter = JaegerExporter(
    agent_host_name="jaeger",
    agent_port=6831,
)

span_processor = BatchSpanProcessor(jaeger_exporter)
trace.get_tracer_provider().add_span_processor(span_processor)

# 使用示例
async def process_video(request: VideoRequest, tenant_id: str):
    with tracer.start_as_current_span("process_video") as span:
        span.set_attribute("tenant_id", tenant_id)
        span.set_attribute("video_url", request.video_url)

        # 业务逻辑
        result = await video_processor.run(request)

        span.set_attribute("result.status", "success")
        return result
```

## 🔐 安全监控

### 异常检测规则
```yaml
安全告警:
  大量认证失败:
    条件: 5分钟内失败 > 50次
    阈值: 单IP
    动作: 封禁IP

  可疑API调用:
    条件: 非常规API组合
    检测: 机器学习模型
    动作: 人工审核

  数据访问异常:
    条件: 租户访问非授权资源
    动作: 立即阻断 + 告警

  配额超限:
    条件: API调用 > 配额90%
    动作: 通知租户管理员
```

## 📊 成本监控

### 成本可视化
```yaml
成本维度:
  按服务:
    - API服务器
    - GPU计算
    - 数据库
    - 存储
    - 网络

  按租户:
    - 租户成本排行
    - 成本趋势分析
    - ROI计算

  按资源:
    - CPU成本
    - 内存成本
    - GPU成本
    - 存储成本
```

## ✅ 实施清单
- [ ] 部署Prometheus + Grafana
- [ ] 配置指标收集
- [ ] 创建仪表板
- [ ] 设置告警规则
- [ ] 配置日志聚合
- [ ] 部署Jaeger追踪
- [ ] 成本监控集成
- [ ] 安全监控配置
- [ ] 演练故障场景
