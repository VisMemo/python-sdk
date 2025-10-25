# MOYAN AI Business Plan Presentation

基于React + Ant Design + Framer Motion的现代化商业计划书演示系统。

## 特性

- 15页完整BP内容，涵盖从市场分析到融资需求
- 16:9固定横屏布局，适配各种演示场景
- 基于Ant Design Charts的专业数据可视化
- Framer Motion提供流畅的页面切换动画
- 键盘快捷键支持（方向键、空格、Home/End）
- 点状导航器支持快速跳转
- 进度条实时显示演示进度

## 技术栈

- **React 18** - UI框架
- **Ant Design 5** - 企业级UI组件库
- **@ant-design/charts** - 数据可视化图表库
- **Framer Motion** - 动画库
- **Vite** - 构建工具

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

项目将在 `http://localhost:3000` 启动。

### 生产构建

```bash
npm run build
```

构建产物将输出到 `dist` 目录。

### 预览构建

```bash
npm run preview
```

## 页面结构

1. **Slide01Cover** - 封面页
2. **Slide02ExecutiveSummary** - 执行摘要
3. **Slide03MarketInsight** - 市场洞察
4. **Slide04ProblemDefinition** - 问题定义
5. **Slide05Solution** - 解决方案
6. **Slide06TechBarrier** - 技术壁垒
7. **Slide07KillerFeature** - 杀手功能
8. **Slide08Product** - 产品形态
9. **Slide09UnitEconomics** - 单位经济模型
10. **Slide10MarketSize** - 市场规模
11. **Slide11Progress** - 当前进展
12. **Slide12Competition** - 竞争分析
13. **Slide13Team** - 核心团队
14. **Slide14Funding** - 融资需求
15. **Slide15Vision** - 愿景使命

## 键盘快捷键

- `→` 或 `空格` - 下一页
- `←` - 上一页
- `Home` - 跳转到首页
- `End` - 跳转到末页

## 自定义配置

### 颜色主题

在 `src/styles/global.css` 中修改CSS变量：

```css
:root {
  --color-bone: #FDFBF7;
  --color-terracotta: #C96850;
  --color-moss: #2F4538;
  /* ... 更多颜色配置 */
}
```

### 添加新页面

1. 在 `src/pages/` 创建新的幻灯片组件
2. 在 `src/pages/AllSlides.jsx` 中导出
3. 在 `src/App.jsx` 的 `slideComponents` 数组中添加

## 项目结构

```
react-bp/
├── public/              # 静态资源
├── src/
│   ├── components/      # 可复用组件
│   │   ├── Navigation.jsx
│   │   └── Navigation.css
│   ├── pages/          # 幻灯片页面
│   │   ├── Slide01Cover.jsx
│   │   ├── Slide02ExecutiveSummary.jsx
│   │   ├── ...
│   │   ├── Slide15Vision.jsx
│   │   ├── AllSlides.jsx
│   │   └── Slides.css
│   ├── styles/         # 全局样式
│   │   └── global.css
│   ├── App.jsx         # 主应用组件
│   └── main.jsx        # 应用入口
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 数据填充

部分页面包含占位符数据（如团队信息、具体数字等），请根据实际情况在对应的组件文件中修改：

- 团队信息: `src/pages/Slide13Team.jsx`
- 联系方式: `src/pages/Slide01Cover.jsx` 和 `src/pages/Slide15Vision.jsx`
- 具体数据指标: 各相关页面组件

## 浏览器兼容性

- Chrome/Edge >= 90
- Firefox >= 88
- Safari >= 14

## License

MIT

## 作者

MOYAN AI Team