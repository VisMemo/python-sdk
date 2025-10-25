# 视觉结构化记忆架构图

基于Linus架构哲学设计的模块化React组件，展示从感知到推理的视觉记忆系统架构。

## 🎯 设计理念

**"数据结构先行，消除特殊情况"**

- **模块化架构**: 遵循"模块是上下文唯一单元"原则
- **数据驱动**: 配置与渲染逻辑完全分离
- **零依赖**: 纯SVG实现，无需外部图表库
- **学术风格**: 保持科研严谨性的同时提升视觉表现

## 🏗️ 架构设计

```
src/
├── components/
│   ├── base/           # 基础SVG���件
│   │   ├── SVGCanvas.tsx
│   │   ├── LayerContainer.tsx
│   │   └── ConnectionLine.tsx
│   ├── layers/         # 核心层次组件
│   │   ├── PerceptionLayer.tsx
│   │   ├── RelationalLayer.tsx
│   │   └── ReasoningLayer.tsx
│   └── VisualStructuredMemoryFigure.tsx  # 主组件
├── types/              # TypeScript类型定义
├── data/               # 架构配置数据
└── styles/             # 动画和样式
```

## 🚀 快速开始

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run dev
```

### 构建生产版本
```bash
npm run build
```

### 预览构建结果
```bash
npm run preview
```

## 📊 功能特性

### 三个核心层次
- **感知层 (Perception)**: 关键帧提取 → 对象槽 → 元数据
- **关系层 (Relational)**: 谓词化关系 → 场景图
- **推理层 (Reasoning)**: 情节记忆图 → 自学习机制

### 交互功能
- ✅ SVG/PNG格式导出
- ✅ 响应式设计
- ✅ 流畅动画效果
- ✅ 主题定制支持

## 🎨 视觉设计

### 颜色方案
- **感知层**: 蓝色系 (#3b82f6 → #e0f2fe)
- **关系层**: 绿色系 (#84cc16 → #ecfccb)
- **推理层**: 紫色系 (#6366f1 → #e9d5ff)

### 动画效果
- 渐入动画: 淡入 + 上滑
- 连接线动画: 路径绘制
- 悬停效果: 发光 + 微位移
- 响应式: 移动端优化

## 🔧 技术栈

- **框架**: React 18 + TypeScript
- **构建**: Vite
- **渲染**: SVG (零依赖)
- **样式**: CSS-in-JS + 动画

## 📝 使用示例

```tsx
import { VisualStructuredMemoryFigure } from './components';

function App() {
  return (
    <div className="app">
      <VisualStructuredMemoryFigure />
    </div>
  );
}
```

### 自定义配置
```tsx
import { VisualStructuredMemoryFigure, architectureConfig } from './components';

const customConfig = {
  ...architectureConfig,
  title: '自定义架构图',
  layers: [
    // 自定义层次配置
  ]
};

function App() {
  return (
    <VisualStructuredMemoryFigure config={customConfig} />
  );
}
```

## 🧪 开发指南

### 添加新层次
1. 在 `src/types/index.ts` 定义类型
2. 在 `src/components/layers/` 创建组件
3. 在 `src/data/architectureConfig.ts` 添加配置
4. 在主组件中注册使用

### 自定义主题
```tsx
const customTheme: VisualTheme = {
  name: 'dark',
  colors: {
    perception: { /* 颜色定义 */ },
    // 其他层次...
  },
  gradients: { /* 渐变定义 */ },
  typography: { /* 字体定义 */ }
};
```

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献指南

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 📧 Email: your-email@example.com
- 🐛 Issues: [GitHub Issues](https://github.com/your-repo/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/your-repo/discussions)

---

**基于Linus架构哲学 · 代码清晰 · 模块化 · 数据驱动**