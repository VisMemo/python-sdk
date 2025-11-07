# 前端SaaS化改造

## 🎯 改造目标

将现有演示前端改造为多租户SaaS平台，支持：
- ✅ 多租户认证与授权
- ✅ 租户管理界面
- ✅ 计费与订阅
- ✅ 使用统计与监控
- ✅ 团队协作功能

## 🏗️ 技术栈选型

### 前端技术栈
```json
{
  "framework": "React 18 + TypeScript",
  "state_management": "Zustand (轻量级)",
  "ui_library": "Ant Design 5.x",
  "routing": "React Router v6",
  "http_client": "Axios + React Query",
  "charts": "ECharts / Recharts",
  "form": "React Hook Form + Zod验证",
  "auth": "Auth0 React SDK",
  "build": "Vite",
  "testing": "Vitest + Testing Library"
}
```

## 🔐 认证集成

### Auth0 React集成
```typescript
// src/auth/Auth0Provider.tsx
import { Auth0Provider } from '@auth0/auth0-react';

export const Auth0ProviderWithHistory = ({ children }: Props) => {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const redirectUri = window.location.origin;

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: redirectUri,
        audience: 'https://api.moyan.ai',
        scope: 'read:messages write:videos'
      }}
      useRefreshTokens
      cacheLocation="localstorage"
    >
      {children}
    </Auth0Provider>
  );
};

// src/hooks/useAuth.ts
export const useAuth = () => {
  const { user, isAuthenticated, isLoading, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0();

  const getToken = async () => {
    return await getAccessTokenSilently();
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    login: loginWithRedirect,
    logout,
    getToken
  };
};
```

### 路由保护
```typescript
// src/components/ProtectedRoute.tsx
const ProtectedRoute = ({ children, requiredRole }: Props) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) return <Spin size="large" />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && !user?.['https://moyan.ai/roles']?.includes(requiredRole)) {
    return <Result status="403" title="403" subTitle="没有访问权限" />;
  }

  return <>{children}</>;
};
```

## 🏢 租户管理

### 租户上下文
```typescript
// src/contexts/TenantContext.tsx
interface Tenant {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended';
  settings: TenantSettings;
  usage: UsageStats;
}

const TenantContext = createContext<{
  tenant: Tenant | null;
  switchTenant: (tenantId: string) => Promise<void>;
  updateSettings: (settings: Partial<TenantSettings>) => Promise<void>;
} | null>(null);

export const TenantProvider = ({ children }: Props) => {
  const { getToken } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);

  const loadTenant = async () => {
    const token = await getToken();
    const response = await api.get('/api/v1/tenant/current', {
      headers: { Authorization: `Bearer ${token}` }
    });
    setTenant(response.data);
  };

  return (
    <TenantContext.Provider value={{ tenant, switchTenant, updateSettings }}>
      {children}
    </TenantContext.Provider>
  );
};
```

### 租户管理页面
```typescript
// src/pages/TenantManagement.tsx
export const TenantManagement = () => {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);

  const tabs = [
    {
      key: 'overview',
      label: '概览',
      children: <TenantOverview tenant={tenant} />
    },
    {
      key: 'users',
      label: '用户管理',
      children: <UserManagement />
    },
    {
      key: 'billing',
      label: '计费管理',
      children: <BillingManagement />
    },
    {
      key: 'settings',
      label: '设置',
      children: <TenantSettings />
    }
  ];

  return (
    <div className="tenant-management">
      <Card>
        <Tabs items={tabs} />
      </Card>
    </div>
  );
};
```

## 💰 计费与订阅

### 订阅管理
```typescript
// src/pages/BillingManagement.tsx
export const BillingManagement = () => {
  const { tenant } = useTenant();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentUsage, setCurrentUsage] = useState<UsageStats>();

  useEffect(() => {
    loadPlans();
    loadUsage();
  }, []);

  const handleUpgrade = async (planId: string) => {
    const { data } = await api.post('/api/v1/billing/checkout', {
      planId,
      tenantId: tenant.id
    });
    window.location.href = data.checkoutUrl;
  };

  return (
    <div className="billing-management">
      <Card title="当前套餐">
        <PlanCard current plan={tenant.plan} usage={currentUsage} />
      </Card>

      <Card title="可升级套餐" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          {plans.map(plan => (
            <Col span={8} key={plan.id}>
              <PlanCard plan={plan} onUpgrade={() => handleUpgrade(plan.id)} />
            </Col>
          ))}
        </Row>
      </Card>

      <Card title="使用统计" style={{ marginTop: 16 }}>
        <UsageChart data={currentUsage} />
      </Card>
    </div>
  );
};
```

## 📊 使用统计仪表板

### 统计组件
```typescript
// src/components/UsageDashboard.tsx
export const UsageDashboard = () => {
  const { tenant } = useTenant();
  const [metrics, setMetrics] = useState<Metrics>();

  const { data } = useQuery(
    ['usage', tenant?.id],
    () => fetchUsageMetrics(tenant!.id),
    { refetchInterval: 30000 }
  );

  return (
    <Row gutter={[16, 16]}>
      <Col span={6}>
        <Card>
          <Statistic
            title="API调用"
            value={metrics?.apiCalls?.count || 0}
            suffix="/月"
            valueStyle={{ color: '#3f8600' }}
          />
          <Progress percent={metrics?.apiCalls?.usagePercent || 0} />
        </Card>
      </Col>

      <Col span={6}>
        <Card>
          <Statistic
            title="存储使用"
            value={formatBytes(metrics?.storage?.used || 0)}
            suffix={`/ ${formatBytes(metrics?.storage?.limit || 0)}`}
          />
          <Progress percent={metrics?.storage?.usagePercent || 0} />
        </Card>
      </Col>

      <Col span={12}>
        <Card title="API调用趋势">
          <LineChart data={metrics?.apiCalls?.timeline || []} />
        </Card>
      </Col>
    </Row>
  );
};
```

## 🔧 团队协作

### 用户管理
```typescript
// src/components/UserManagement.tsx
export const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  const columns = [
    { title: '姓名', dataIndex: 'name' },
    { title: '邮箱', dataIndex: 'email' },
    { title: '角色', dataIndex: 'role' },
    { title: '状态', dataIndex: 'status' },
    {
      title: '操作',
      render: (_, record) => (
        <Space>
          <Button onClick={() => editUser(record)}>编辑</Button>
          <Popconfirm
            title="确定要删除该用户吗？"
            onConfirm={() => deleteUser(record.id)}
          >
            <Button danger>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Button type="primary" onClick={() => setModalVisible(true)}>
        邀请用户
      </Button>

      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        style={{ marginTop: 16 }}
      />

      <InviteUserModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </div>
  );
};
```

## 🎨 UI/UX设计

### 租户品牌定制
```css
/* 主题定制 */
:root {
  --primary-color: #1890ff;
  --layout-header-bg: #001529;
  --menu-bg: #001529;
}

/* 租户Logo */
.tenant-logo {
  height: 32px;
  margin: 16px;
  background: rgba(255, 255, 255, 0.3);
}

/* 自定义主题 */
[data-tenant-theme="dark"] {
  --primary-color: #52c41a;
}

[data-tenant-theme="purple"] {
  --primary-color: #722ed1;
}
```

### 响应式布局
```typescript
// src/components/Layout/SaaSLayout.tsx
export const SaaSLayout = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div className="tenant-logo" />
        <Menu
          theme="dark"
          mode="inline"
          items={[
            { key: 'dashboard', icon: <DashboardOutlined />, label: '仪表板' },
            { key: 'videos', icon: <VideoCameraOutlined />, label: '视频管理' },
            { key: 'memories', icon: <DatabaseOutlined />, label: '记忆系统' },
            { key: 'analytics', icon: <BarChartOutlined />, label: '数据分析' },
            { key: 'settings', icon: <SettingOutlined />, label: '设置' }
          ]}
        />
      </Sider>

      <Layout>
        <Header style={{ padding: '0 16px', background: '#fff' }}>
          <TenantSwitcher />
          <UserMenu />
        </Header>

        <Content style={{ margin: '16px' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};
```

## 🧪 测试策略

### 单元测试
```typescript
// src/components/__tests__/TenantSelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { TenantSelector } from '../TenantSelector';

test('切换租户', async () => {
  render(<TenantSelector />);

  const selector = screen.getByRole('combobox');
  fireEvent.click(selector);

  const option = screen.getByText('租户A');
  fireEvent.click(option);

  expect(screen.getByText('已切换到：租户A')).toBeInTheDocument();
});
```

### E2E测试
```typescript
// e2e/billing.spec.ts
import { test, expect } from '@playwright/test';

test('升级套餐流程', async ({ page }) => {
  await page.goto('/billing');
  await expect(page.locator('text=当前套餐：Free')).toBeVisible();

  await page.click('text=升级到Pro');
  await expect(page).toHaveURL(/.*checkout.*/);

  await page.fill('[data-testid=card-number]', '4242424242424242');
  await page.click('button:has-text="确认支付")');

  await expect(page.locator('text=升级成功')).toBeVisible();
});
```

## 📱 移动端适配

### 响应式设计
```css
/* 移动端适配 */
@media (max-width: 768px) {
  .ant-layout-sider {
    position: fixed;
    height: 100vh;
    left: -200px;
    z-index: 1000;
  }

  .ant-layout-sider.mobile-open {
    left: 0;
  }

  .usage-dashboard .ant-col {
    margin-bottom: 16px;
  }
}

/* 触摸优化 */
@media (hover: none) {
  .ant-btn {
    min-height: 44px;
  }
}
```

## ✅ 实施清单
- [ ] 搭建React + TypeScript项目
- [ ] 集成Auth0认证
- [ ] 实现租户管理页面
- [ ] 开发计费与订阅功能
- [ ] 创建使用统计仪表板
- [ ] 实现团队协作功能
- [ ] 设计响应式UI
- [ ] 编写测试用例
- [ ] 性能优化
- [ ] 无障碍访问优化
- [ ] 移动端适配
- [ ] 部署到CDN
