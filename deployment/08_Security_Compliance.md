# 安全加固与合规审计

## 🛡️ 安全架构

### 纵深防御策略
```
Internet
    ↓
Cloudflare WAF (Layer 7 防护)
    ↓
API Gateway (限流/认证)
    ↓
Application (业务逻辑)
    ↓
Data Access Layer (参数化查询)
    ↓
Database (加密/审计)
```

## 🔐 认证与授权

### JWT安全配置
```python
# JWT配置优化
JWT_CONFIG = {
    "algorithm": "RS256",  # 非对称加密
    "expiration": 3600,    # 1小时过期
    "refresh_expiration": 86400,  # 24小时刷新期
    "issuer": "moyan.ai",
    "audience": "moyan-api",
    "key_rotation_interval": 2592000,  # 30天轮换
    "blacklist_enabled": True,  # 启用黑名单
    "revocation_check": True,   # 撤销检查
}

class JWTValidator:
    async def validate_token(self, token: str) -> dict:
        try:
            # 1. 检查黑名单
            if await self.redis.exists(f"blacklist:{token}"):
                raise Unauthorized("Token已撤销")

            # 2. 验证签名
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                audience=JWT_CONFIG["audience"],
                issuer=JWT_CONFIG["issuer"]
            )

            # 3. 检查租户状态
            tenant = await self.get_tenant(payload["tenant_id"])
            if tenant["status"] != "active":
                raise Unauthorized("租户已被暂停")

            return payload
        except jwt.ExpiredSignatureError:
            raise Unauthorized("Token已过期")
        except jwt.InvalidTokenError:
            raise Unauthorized("无效Token")
```

### 多因素认证 (MFA)
```typescript
// TOTP验证
import speakeasy from 'speakeasy';

class MFAService {
  generateSecret(userId: string): MFASecret {
    const secret = speakeasy.generateSecret({
      name: `MOYAN (${userId})`,
      length: 32
    });

    return {
      base32: secret.base32,
      qr_code_url: speakeasy.otpauthURL({
        secret: secret.base32,
        label: `MOYAN:${userId}`,
        encoding: 'base32'
      })
    };
  }

  verifyToken(token: string, secret: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2  // 允许前后2个时间窗口
    });
  }
}
```

## 🔒 数据加密

### 传输加密
```yaml
TLS配置:
  版本: TLS 1.3
  证书: Let's Encrypt (自动续期)
  HSTS: 启用 (max-age=31536000)
  加密套件:
    - TLS_AES_256_GCM_SHA384
    - TLS_CHACHA20_POLY1305_SHA256
    - TLS_AES_128_GCM_SHA256

中间人攻击防护:
  - 证书固定 (Certificate Pinning)
  - 公钥固定 (Public Key Pinning)
  - 严格传输安全 (HSTS)
```

### 存储加密
```python
# 数据库加密
class EncryptedField:
    def __init__(self, algorithm: str = "aes-256-gcm"):
        self.algorithm = algorithm
        self.key = os.getenv("FIELD_ENCRYPTION_KEY")

    def encrypt(self, data: str) -> str:
        """加密敏感字段"""
        iv = os.urandom(12)  # 96-bit IV for GCM
        cipher = AES.new(self.key, AES.MODE_GCM, nonce=iv)
        ciphertext, tag = cipher.encrypt_and_digest(data.encode())

        return base64.b64encode(iv + tag + ciphertext).decode()

    def decrypt(self, encrypted_data: str) -> str:
        """解密敏感字段"""
        data = base64.b64decode(encrypted_data.encode())
        iv = data[:12]
        tag = data[12:28]
        ciphertext = data[28:]

        cipher = AES.new(self.key, AES.MODE_GCM, nonce=iv)
        plaintext = cipher.decrypt_and_verify(ciphertext, tag)

        return plaintext.decode()

# 使用示例
class User(BaseModel):
    name: str
    email: EncryptedField  # 加密存储
    phone: EncryptedField  # 加密存储
    credit_card: Optional[EncryptedField] = None
```

## 🚨 安全监控

### 入侵检测
```yaml
异常检测规则:
  认证异常:
    - 5分钟内失败 > 20次 (单IP)
    - 异地登录检测
    - 暴力破解尝试

  API异常:
    - 非常规API调用模式
    - 大规模数据查询
    - 批量删除操作

  数据异常:
    - 访问未授权资源
    - 大量数据传输
    - 异常时间访问

  系统异常:
    - CPU/内存激增
    - 大量错误日志
    - 未知进程
```

### SIEM集成
```python
# 安全事件上报
class SecurityEventLogger:
    async def log_event(self, event: SecurityEvent):
        event_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event.type,
            "severity": event.severity,
            "tenant_id": event.tenant_id,
            "user_id": event.user_id,
            "ip_address": event.ip_address,
            "user_agent": event.user_agent,
            "details": event.details
        }

        # 1. 本地日志
        logger.warning(json.dumps(event_data))

        # 2. SIEM系统
        await self.siem_client.send(event_data)

        # 3. 实时告警
        if event.severity in ["high", "critical"]:
            await self.send_security_alert(event)

# 使用示例
await security_logger.log_event(SecurityEvent(
    type="suspicious_api_call",
    severity="high",
    tenant_id="tenant_123",
    user_id="user_456",
    details={
        "endpoint": "/api/v1/admin/users",
        "frequency": "1000_requests_in_5min"
    }
))
```

## 🔍 安全审计

### 审计日志标准
```json
{
  "audit_id": "audit_20240115_001",
  "timestamp": "2024-01-15T10:30:00.123Z",
  "actor": {
    "type": "user",
    "id": "user_123",
    "tenant_id": "tenant_abc"
  },
  "action": {
    "type": "api_call",
    "resource": "memory",
    "operation": "read",
    "result": "success"
  },
  "request": {
    "method": "POST",
    "path": "/api/v1/memory/search",
    "headers": {...},
    "body_size": 1024
  },
  "response": {
    "status_code": 200,
    "body_size": 2048
  },
  "context": {
    "ip_address": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "session_id": "sess_789"
  }
}
```

### 审计查询
```sql
-- 查询用户操作历史
MATCH (a:AuditLog {tenant_id: 'tenant_123', user_id: 'user_456'})
WHERE a.timestamp >= datetime('2024-01-01')
RETURN a
ORDER BY a.timestamp DESC
LIMIT 100;

-- 统计API调用
MATCH (a:AuditLog)
WHERE a.action.type = 'api_call'
  AND a.timestamp >= datetime('now') - duration('P1D')
RETURN a.action.resource, count(*) as call_count
ORDER BY call_count DESC;
```

## 📋 合规性

### SOC 2合规
```yaml
SOC2控制点:
  安全性:
    - 访问控制 (CC6.1)
    - 认证 (CC6.7)
    - 加密 (CC6.8)
    - 网络安全 (CC6.6)

  可用性:
    - 监控 (A1.1)
    - 变更管理 (A1.3)
    - 事件响应 (A1.2)

  处理完整性:
    - 数据处理 (PI1.1)
    - 错误处理 (PI1.2)

  保密性:
    - 数据分类 (C1.1)
    - 加密传输 (C1.2)
    - 访问限制 (C1.3)

  隐私:
    - 通知 (P1.1)
    - 选择 (P2.1)
```

### GDPR合规
```python
# 数据主体权利
class GDPRCompliance:
    async def export_user_data(self, user_id: str, tenant_id: str):
        """数据可携权"""
        user_data = {
            "profile": await self.get_user_profile(user_id),
            "memories": await self.get_user_memories(user_id, tenant_id),
            "activity_log": await self.get_user_activity(user_id)
        }
        return user_data

    async def delete_user_data(self, user_id: str, tenant_id: str):
        """被遗忘权"""
        # 删除用户数据
        await self.neo4j.run(
            "MATCH (n {user_id: $user_id, tenant_id: $tenant_id}) DETACH DELETE n",
            user_id=user_id, tenant_id=tenant_id
        )

        # 匿名化审计日志
        await self.anonymize_audit_logs(user_id)

        return {"status": "deleted", "timestamp": datetime.utcnow()}

    async def process_data_request(self, user_id: str, request_type: str):
        """处理数据主体请求"""
        if request_type == "export":
            data = await self.export_user_data(user_id)
            return {"data": data, "format": "json"}
        elif request_type == "delete":
            result = await self.delete_user_data(user_id)
            return result
        else:
            raise ValueError("不支持的请求类型")
```

## 🔐 密钥管理

### AWS KMS集成
```python
import boto3

class KeyManager:
    def __init__(self):
        self.kms = boto3.client('kms')
        self.key_id = os.getenv('KMS_KEY_ID')

    def encrypt_sensitive_data(self, data: str) -> str:
        """加密敏感数据"""
        response = self.kms.encrypt(
            KeyId=self.key_id,
            Plaintext=data.encode(),
            EncryptionContext={'tenant_id': data.get('tenant_id', '')}
        )
        return base64.b64encode(response['CiphertextBlob']).decode()

    def decrypt_sensitive_data(self, encrypted_data: str) -> str:
        """解密敏感数据"""
        response = self.kms.decrypt(
            CiphertextBlob=base64.b64decode(encrypted_data),
            KeyId=self.key_id
        )
        return response['Plaintext'].decode()
```

## 🧪 安全测试

### 渗透测试
```yaml
测试范围:
  网络层:
    - 端口扫描
    - 服务枚举
    - SSL/TLS配置

  应用层:
    - SQL注入
    - XSS攻击
    - CSRF攻击
    - 文件上传漏洞

  认证:
    - 暴力破解
    - 会话劫持
    - Token伪造

  权限:
    - 水平越权
    - 垂直越权
    - 租户隔离

  数据:
    - 敏感信息泄露
    - 加密强度
    - 备份安全
```

### 自动化安全扫描
```yaml
# GitHub Actions安全扫描
name: Security Scan

on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Bandit (Python Security)
        run: bandit -r modules/ -f json -o bandit-report.json

      - name: Run Semgrep (SAST)
        uses: returntocorp/semgrep-action@v1
        with:
          config: auto
          generateSarif: "1"

      - name: Run Trivy (Container Scan)
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'moyan-api:latest'
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload results to GitHub
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'
```

## ✅ 实施清单
- [ ] 配置WAF
- [ ] 启用MFA
- [ ] 加密敏感数据
- [ ] 配置SIEM
- [ ] 实施审计日志
- [ ] 通过SOC 2审计
- [ ] 通过GDPR评估
- [ ] 定期渗透测试
- [ ] 安全扫描自动化
- [ ] 密钥轮换机制
- [ ] 事件响应计划
- [ ] 安全培训
