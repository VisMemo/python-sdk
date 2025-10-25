# Prometheus 集成与告警配置

本文给出将记忆层 /metrics_prom 接入 Prometheus 的抓取配置与告警规则示例。

## 1. 抓取配置（prometheus.yml）
```yaml
scrape_configs:
  - job_name: 'memory-service'
    scrape_interval: 15s
    static_configs:
      - targets: ['127.0.0.1:8000']  # 按实际端口修改
    metrics_path: /metrics_prom
```

## 2. 关键指标说明
- 计数器：
  - `memory_writes_total`、`memory_searches_total`、`memory_graph_rel_merges_total`、`memory_rollbacks_total`
  - 作用域与过滤：`memory_search_scope_total{scope=...}`、`memory_search_filter_applied_total{key=user|domain|session}`
  - 缓存：`memory_search_cache_hits_total`、`memory_search_cache_misses_total`、`memory_search_cache_evictions_total`、`memory_search_cache_hits_scope_total{scope=...}`
  - 域分布：`memory_domain_distribution_total{domain=...}`
- 延迟直方图（毫秒）：
  - `memory_search_latency_ms_bucket{le="..."}`、`memory_search_latency_ms_sum`、`memory_search_latency_ms_count`
  - 百分位示例：`histogram_quantile(0.95, sum(rate(memory_search_latency_ms_bucket[5m])) by (le))`

## 3. 告警规则示例（P95/P99 延迟）
```yaml
groups:
- name: memory-service-alerts
  rules:
  - alert: MemorySearchLatencyHighP95
    expr: histogram_quantile(0.95, sum(rate(memory_search_latency_ms_bucket[5m])) by (le)) > 200
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Memory search P95 latency high"
      description: "P95 latency over 200ms for 5m"

  - alert: MemorySearchLatencyHighP99
    expr: histogram_quantile(0.99, sum(rate(memory_search_latency_ms_bucket[5m])) by (le)) > 500
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Memory search P99 latency high"
      description: "P99 latency over 500ms for 5m"

  - alert: MemoryRollbacksSpike
    expr: increase(memory_rollbacks_total[10m]) > 5
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "Memory rollbacks increased"
      description: "More than 5 rollbacks in 10 minutes"
```

## 4. Grafana 面板建议
- 搜索吞吐与延迟（P50/P95/P99）
- 写入次数与失败率（按日志或错误计数）
- 邻域展开/关系增量（graph_rel_merges_total 的速率）

> 说明：以上规则仅为参考阈值，需按实际 SLA 与环境调优。
