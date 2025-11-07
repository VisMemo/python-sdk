# 弹性伸缩与负载均衡

## 🔄 Auto Scaling配置

### 应用自动伸缩
```yaml
# aws-autoscaling-group.tf
resource "aws_autoscaling_group" "api_servers" {
  name                = "moyan-api-asg"
  vpc_zone_identifier = [aws_subnet.private_1a.id, aws_subnet.private_1b.id]
  min_size            = 2
  max_size            = 20
  desired_capacity    = 4

  # 目标组
  target_group_arns = [aws_lb_target_group.api.arn]

  # 健康检查
  health_check_type         = "EC2"
  health_check_grace_period = 300

  # 生命周期钩子
  lifecycle {
    create_before_destroy = true
  }

  tag {
    key                 = "Name"
    value               = "moyan-api"
    propagate_at_launch = true
  }

  tag {
    key                 = "Environment"
    value               = "production"
    propagate_at_launch = true
  }
}

# CPU伸缩策略
resource "aws_autoscaling_policy" "scale_up_cpu" {
  name                   = "moyan-scale-up-cpu"
  autoscaling_group_name = aws_autoscaling_group.api_servers.name
  policy_type           = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# 内存伸缩策略
resource "aws_autoscaling_policy" "scale_up_memory" {
  name                   = "moyan-scale-up-memory"
  autoscaling_group_name = aws_autoscaling_group.api_servers.name
  policy_type           = "TargetTrackingScaling"

  target_tracking_configuration {
    customized_metric_specification {
      metric {
        metric_name = "MemoryUtilization"
        namespace   = "AWS/EC2"
        stat        = "Average"
        dimensions {
          Name  = "AutoScalingGroupName"
          Value = aws_autoscaling_group.api_servers.name
        }
      }
    }
    target_value = 80.0
  }
}
```

### GPU节点伸缩
```yaml
# GPU专用伸缩组
resource "aws_autoscaling_group" "gpu_nodes" {
  name                = "moyan-gpu-asg"
  vpc_zone_identifier = aws_subnet.gpu.id
  min_size            = 0
  max_size            = 10
  desired_capacity    = 0

  # GPU实例需要placement group
  placement_group = aws_placement_group.gpu.name

  # 启动配置
  launch_template {
    id      = aws_launch_template.gpu.id
    version = "$Latest"
  }

  # 生命周期策略 - 缩放至0
  iam_instance_profile = aws_iam_instance_profile.gpu.name
  user_data = base64encode(templatefile("${path.module}/userdata-gpu.sh", {
    region = var.aws_region
  }))
}

# GPU任务队列伸缩
resource "aws_autoscaling_policy" "scale_gpu_queue" {
  name                   = "moyan-scale-gpu-queue"
  autoscaling_group_name = aws_autoscaling_group.gpu_nodes.name
  policy_type           = "StepScaling"
  adjustment_type       = "ChangeInCapacity"
  cooldown              = 300

  # 队列长度 > 10 时，增加1个GPU
  step_adjustment {
    metric_interval_lower_bound = 10
    metric_interval_upper_bound = 20
    scaling_adjustment          = 1
  }

  # 队列长度 > 20 时，增加3个GPU
  step_adjustment {
    metric_interval_lower_bound = 20
    scaling_adjustment          = 3
  }
}
```

## ⚖️ 负载均衡架构

### 应用负载均衡器 (ALB)
```hcl
# Application Load Balancer
resource "aws_lb" "main" {
  name               = "moyan-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [aws_subnet.public_1a.id, aws_subnet.public_1b.id]

  enable_deletion_protection       = true
  enable_cross_zone_load_balancing = true
  enable_http2                    = true
  idle_timeout                    = 60

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.bucket
    prefix  = "access-logs"
    enabled = true
  }

  tags = {
    Environment = "production"
    Name        = "moyan-alb"
  }
}

# 目标组
resource "aws_lb_target_group" "api" {
  name        = "moyan-api-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "instance"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/api/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = true
  }

  tags = {
    Environment = "production"
  }
}

# 监听器
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  # HTTP重定向到HTTPS
  default_action {
    type = "redirect"

    redirect {
      protocol = "HTTPS"
      port     = "443"
      status_code = "HTTP_301"
    }
  }
}
```

### WebSocket支持
```hcl
# WebSocket监听器
resource "aws_lb_listener" "websocket" {
  load_balancer_arn = aws_lb.main.arn
  port              = "8443"
  protocol          = "TCP"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = aws_acm_certificate.wss.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
```

## 🚦 智能路由

### 权重路由
```python
# 多版本路由 (蓝绿部署)
from fastapi import FastAPI
from typing import Dict

app = FastAPI()

class RouteManager:
    def __init__(self):
        self.weights = {
            "v1": 80,  # 80%流量到v1
            "v2": 20   # 20%流量到v2
        }
        self.version_assignments: Dict[str, str] = {}

    def get_version(self, user_id: str) -> str:
        """根据用户ID稳定分配版本"""
        if user_id in self.version_assignments:
            return self.version_assignments[user_id]

        # 基于哈希的一致性路由
        import hashlib
        hash_value = int(hashlib.md5(user_id.encode()).hexdigest(), 16)
        percentage = (hash_value % 100) + 1

        if percentage <= self.weights["v1"]:
            version = "v1"
        else:
            version = "v2"

        self.version_assignments[user_id] = version
        return version

# 使用中间件
@app.middleware("http")
async def version_router(request: Request, call_next):
    user_id = get_user_id_from_token(request)
    if user_id:
        version = route_manager.get_version(user_id)
        request.state.api_version = version

    response = await call_next(request)
    return response

# 在处理器中使用
@app.post("/api/v1/memory/store")
async def store_memory_v1(...):
    # v1实现
    pass

@app.post("/api/v2/memory/store")
async def store_memory_v2(...):
    # v2实现（优化版本）
    pass
```

### 地理路由
```yaml
# Route53地理路由策略
路由策略:
  亚太:
    地区: ap-southeast-1
    权重: 100%
    覆盖: 中国、新加坡、澳洲

  北美:
    地区: us-east-1
    权重: 100%
    覆盖: 美国、加拿大

  欧洲:
    地区: eu-west-1
    权重: 100%
    覆盖: 欧洲各国
```

## 📊 性能优化

### 连接复用
```python
# HTTP连接池优化
import httpx

class OptimizedHTTPClient:
    def __init__(self):
        self.client = httpx.AsyncClient(
            # 连接池配置
            limits=httpx.Limits(
                max_keepalive_connections=20,
                max_connections=100,
                keepalive_expiry=5
            ),
            # 超时配置
            timeout=httpx.Timeout(
                connect=5.0,
                read=30.0,
                write=30.0,
                pool=10.0
            ),
            # 压缩
            headers={"Accept-Encoding": "gzip, deflate"}
        )

    async def close(self):
        await self.client.aclose()
```

### 缓存优化
```yaml
多级缓存策略:
  L1 - 应用缓存:
    类型: 内存缓存
    大小: 100MB
    TTL: 5分钟
    命中率: 80%

  L2 - Redis缓存:
    类型: 分布式缓存
    大小: 1GB
    TTL: 1小时
    命中率: 95%

  L3 - CDN缓存:
    类型: CloudFront
    TTL: 24小时
    命中率: 99%

  缓存Key设计:
    格式: {tenant}:{resource}:{hash}
    示例: tenant_abc:memory:search:a1b2c3d4
```

## 🎯 成本优化

### Spot实例
```yaml
Spot实例策略:
  基础负载 (60%):
    模式: 预留实例 (1年)
    成本: $1000/月
    折扣: 40%

  弹性负载 (30%):
    模式: Spot实例
    成本: $300/月
    折扣: 70%

  突发负载 (10%):
    模式: 按需实例
    成本: $150/月
    说明: 无法预测的突发情况
```

### 资源预热
```python
class ResourceWarmer:
    def __init__(self, asg_client, ecs_client):
        self.asg = asg_client
        self.ecs = ecs_client

    async def warm_up(self, tenant_id: str):
        """预热租户资源"""
        # 1. 预热缓存
        await self.preload_cache(tenant_id)

        # 2. 预热数据库连接
        await self.prewarm_db_connections(tenant_id)

        # 3. 预热GPU实例
        await self.ensure_gpu_availability(tenant_id)

    async def scale_to_zero(self, tenant_id: str):
        """空闲时缩放至0"""
        # 保留最小资源
        await self.asg.update_auto_scaling_group(
            AutoScalingGroupName=f"moyan-{tenant_id}",
            MinSize=0,
            DesiredCapacity=0
        )
```

## 📈 监控与告警

### 伸缩告警
```yaml
告警规则:
  CPU高负载:
    条件: CPU > 80% 持续5分钟
    动作: 触发向上伸缩
    阈值: +2实例

  内存高负载:
    条件: 内存 > 85% 持续5分钟
    动作: 触发向上伸缩
    阈值: +2实例

  队列积压:
    条件: 等待队列 > 50 持续2分钟
    动作: 启动GPU实例
    阈值: +1实例

  低负载:
    条件: CPU < 20% 持续15分钟
    动作: 触发向下伸缩
    阈值: -1实例
    冷却期: 10分钟
```

## ✅ 实施清单
- [ ] 配置ALB多可用区
- [ ] 实施Auto Scaling策略
- [ ] 配置GPU节点伸缩
- [ ] 设置健康检查
- [ ] 配置WebSocket支持
- [ ] 实施蓝绿部署
- [ ] 配置地理路由
- [ ] 设置成本告警
- [ ] 性能基准测试
- [ ] 故障注入演练
