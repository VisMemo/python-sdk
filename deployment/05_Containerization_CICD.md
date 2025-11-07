# 容器化与CI/CD流水线

## 🐳 容器化方案

### Docker镜像设计
```dockerfile
# 基础镜像
FROM python:3.11-slim

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# 创建应用用户
RUN useradd --create-home --shell /bin/bash app
USER app

# 设置工作目录
WORKDIR /app

# 安装Python依赖
COPY --chown=app:app pyproject.toml ./
RUN pip install --user --no-cache-dir -e .

# 复制应用代码
COPY --chown=app:app . .

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "demo.backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 多阶段构建优化
```dockerfile
# Build stage
FROM python:3.11 as builder
COPY . /app
RUN pip install --user . && \
    find /home/app/.local -type f -name "*.pyc" -delete && \
    find /home/app/.local -type d -name "__pycache__" -exec rm -rf {} + || true

# Runtime stage
FROM python:3.11-slim
COPY --from=builder /home/app/.local /home/app/.local
USER app
WORKDIR /app
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 🔄 CI/CD流水线

### GitHub Actions配置
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -e .[dev]
          pip install pytest-cov
      - name: Run tests
        run: pytest --cov=modules --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Bandit Security Linter
        run: bandit -r modules/ -f json -o bandit-report.json
      - name: Run Safety Check
        run: safety check --json --output safety-report.json

  build-and-deploy:
    needs: [test, security-scan]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1
      - name: Build, tag, and push image
        id: build-image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: moyan-agent-api
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: ecs-task-definition.json
          service: moyan-agent-service
          cluster: moyan-production
          wait-for-service-stability: true
```

### ArgoCD部署配置
```yaml
# apps/api-deployment.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: moyan-agent-api
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/company/moyan-agent-infra
    targetRevision: main
    path: k8s/api
    helm:
      valueFiles:
        - values-production.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: moyan
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

## 📦 基础设施即代码 (IaC)

### Terraform配置
```hcl
# main.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "moyan-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "us-east-1"
  }
}

# EKS Cluster
resource "aws_eks_cluster" "moyan" {
  name     = "moyan-prod"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = "1.28"

  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = ["0.0.0.0/0"]
  }
}

# ECS Service
resource "aws_ecs_service" "api" {
  name            = "moyan-api"
  cluster         = aws_ecs_cluster.moyan.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 3

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8000
  }
}
```

## ✅ 实施清单
- [ ] 创建Dockerfile
- [ ] 配置GitHub Actions
- [ ] 设置安全扫描
- [ ] 配置ArgoCD/Terraform
- [ ] 端到端测试
