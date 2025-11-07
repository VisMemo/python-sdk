# 计费系统与成本优化

## 💰 计费模型设计

### 套餐层级
```yaml
Free (免费):
  价格: $0/月
  API调用: 1,000/月
  存储: 100MB
  GPU: 0小时
  支持: 社区
  品牌: MOYAN Powered

Pro (专业版):
  价格: $99/月
  API调用: 100,000/月
  存储: 10GB
  GPU: 10小时/月
  支持: 邮件
  品牌: 白标

Enterprise (企业版):
  价格: $999/月
  API调用: 无限
  存储: 100GB
  GPU: 100小时/月
  支持: 专属客服
  功能: 私有部署
```

### 使用量计费
```typescript
interface UsageMetrics {
  tenantId: string;
  period: string; // '2024-01'
  apiCalls: {
    count: number;
    overage: number;
    cost: number;
  };
  storage: {
    gb: number;
    cost: number;
  };
  gpu: {
    hours: number;
    cost: number;
  };
  bandwidth: {
    gb: number;
    cost: number;
  };
  total: number;
}

class BillingCalculator {
  calculateUsage(usage: UsageMetrics): number {
    let cost = 0;

    // API调用计费 (前1000免费)
    if (usage.apiCalls.count > 1000) {
      const overage = usage.apiCalls.count - 1000;
      cost += overage * 0.001; // $0.001 per call
    }

    // 存储计费
    cost += usage.storage.gb * 0.10; // $0.10 per GB

    // GPU计费
    cost += usage.gpu.hours * 3.00; // $3.00 per hour

    // 带宽计费
    cost += usage.bandwidth.gb * 0.05; // $0.05 per GB

    return cost;
  }
}
```

## 🔌 支付集成

### Stripe集成
```typescript
// 订阅管理
class SubscriptionService {
  async createSubscription(tenantId: string, priceId: string) {
    const subscription = await stripe.subscriptions.create({
      customer: await this.getOrCreateCustomer(tenantId),
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    return subscription;
  }

  async createCheckoutSession(tenantId: string, priceId: string) {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: await this.getOrCreateCustomer(tenantId),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appUrl}/billing/cancel`,
    });

    return session;
  }

  async handleWebhook(event: Stripe.Event) {
    switch (event.type) {
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
    }
  }
}
```

### 发票生成
```typescript
class InvoiceService {
  async generateMonthlyInvoice(tenantId: string, period: string) {
    const usage = await this.getUsageMetrics(tenantId, period);
    const baseFee = await this.getBaseSubscriptionFee(tenantId);
    const overage = this.calculateOverages(usage);

    const invoice = {
      id: `inv_${Date.now()}`,
      tenantId,
      period,
      items: [
        { description: '基础套餐', amount: baseFee },
        { description: 'API超量费用', amount: overage.apiCalls },
        { description: '存储费用', amount: overage.storage },
        { description: 'GPU使用费', amount: overage.gpu },
      ],
      subtotal: baseFee + overage.total,
      tax: 0,
      total: baseFee + overage.total,
    };

    await this.sendInvoiceEmail(invoice);
    return invoice;
  }
}
```

## 📊 成本优化策略

### 自动缩放
```yaml
API服务器:
  缩放条件:
    CPU > 70%: 增加1个实例
    CPU < 30%: 减少1个实例
    最小实例: 2
    最大实例: 20
    缩放速度: 30秒

GPU节点:
  缩放条件:
    队列长度 > 10: 增加1个GPU
    队列长度 = 0: 缩放至0
    预热时间: 2分钟

数据库:
  Neo4j:
    连接数 > 80%: 增加只读副本
    内存使用 > 85%: 升级实例
  Qdrant:
    存储 > 80%: 增加分片
```

### 成本分析
```python
class CostAnalyzer:
    def analyze_cost_breakdown(self, tenant_id: str):
        """成本分析"""
        costs = {
            'compute': 0,
            'storage': 0,
            'network': 0,
            'managed_services': 0
        }

        # 计算资源
        compute_costs = self.get_compute_costs(tenant_id)
        costs['compute'] = compute_costs['api'] + compute_costs['gpu']

        # 存储成本
        storage_costs = self.get_storage_costs(tenant_id)
        costs['storage'] = storage_costs['s3'] + storage_costs['database']

        # 网络成本
        costs['network'] = self.get_network_costs(tenant_id)

        # 托管服务
        costs['managed_services'] = self.get_managed_service_costs(tenant_id)

        return costs

    def generate_optimization_recommendations(self, tenant_id: str):
        """成本优化建议"""
        recommendations = []

        # 检查GPU使用率
        gpu_utilization = self.get_gpu_utilization(tenant_id)
        if gpu_utilization < 0.3:
            recommendations.append({
                'type': 'gpu_spot_instances',
                'description': 'GPU使用率低于30%，建议使用Spot实例节省70%成本',
                'savings': '~$500/月'
            })

        # 检查存储
        storage_usage = self.get_storage_usage(tenant_id)
        if storage_usage.cold_data_ratio > 0.5:
            recommendations.append({
                'type': 'storage_tiering',
                'description': '超过50%为冷数据，建议迁移至Glacier',
                'savings': '~$200/月'
            })

        return recommendations
```

### 预留实例
```yaml
预留策略:
  基础负载 (60%):
    使用: 预留实例 (1年)
    折扣: 40%
    覆盖: API服务器、数据库

  峰值负载 (30%):
    使用: 按需实例
    说明: 无法预测的突发负载

  批处理 (10%):
    使用: Spot实例
    折扣: 70%
    覆盖: 大型视频处理任务
```

## 🎯 成本预算与告警

### 预算设置
```typescript
interface Budget {
  tenantId: string;
  monthlyLimit: number;
  alertThresholds: {
    warning: 0.7;  // 70%告警
    critical: 0.9; // 90%告警
  };
  recipients: string[];
}

class BudgetManager {
  async checkBudget(tenantId: string, currentSpend: number) {
    const budget = await this.getBudget(tenantId);
    const usagePercent = currentSpend / budget.monthlyLimit;

    if (usagePercent >= budget.alertThresholds.critical) {
      await this.sendCriticalAlert(tenantId, currentSpend, budget);
    } else if (usagePercent >= budget.alertThresholds.warning) {
      await this.sendWarningAlert(tenantId, currentSpend, budget);
    }
  }
}
```

## ✅ 实施清单
- [ ] 集成Stripe支付
- [ ] 设计计费模型
- [ ] 实现使用量追踪
- [ ] 配置自动开票
- [ ] 建立成本监控
- [ ] 设置预算告警
- [ ] 优化资源使用
- [ ] 预留实例策略
- [ ] Spot实例集成
- [ ] 成本分析报告
