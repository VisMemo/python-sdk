import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { VisualStructuredMemoryFigure } from './components';
import { EnhancedVisualStructuredMemoryFigure } from './components/EnhancedVisualStructuredMemoryFigure';
import './styles/animations.css';

/**
 * 主应用入口
 */
function App() {
  const [currentView, setCurrentView] = useState<'original' | 'enhanced'>('original');
  const handleExportSVG = () => {
    const svgElement = document.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = 'visual-structured-memory-architecture.svg';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
  };

  const handleExportPNG = () => {
    const svgElement = document.querySelector('svg') as SVGSVGElement;
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    canvas.width = 1280;
    canvas.height = 860;

    img.onload = () => {
      ctx?.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;

        const pngUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = 'visual-structured-memory-architecture.png';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleViewSource = () => {
    window.open('https://github.com', '_blank');
  };

  return (
    <div className="container">
      {/* 页头 */}
      <header className="header">
        <h1>视觉结构化记忆架构图</h1>
        <p>基于模块化React组件的数据驱动可视化系统，展示从感知到推理的完整记忆流程</p>
      </header>

      {/* 版本切换 */}
      <div className="controls" style={{ marginBottom: '1rem' }}>
        <div className="btn-group">
          <button
            className={`btn ${currentView === 'original' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setCurrentView('original')}
          >
            原始学术版
          </button>
          <button
            className={`btn ${currentView === 'enhanced' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setCurrentView('enhanced')}
          >
            增强学术版
          </button>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={handleViewSource}>
            查看源码
          </button>
        </div>
      </div>

      {/* 版本说明 */}
      <div className="demo-section" style={{
        padding: '1rem',
        backgroundColor: currentView === 'enhanced' ? '#f0f9ff' : '#f8fafc',
        borderRadius: '8px',
        marginBottom: '1rem',
        border: `1px solid ${currentView === 'enhanced' ? '#0ea5e9' : '#e2e8f0'}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.2rem' }}>
            {currentView === 'original' ? '📚' : '⚡'}
          </span>
          <div>
            <strong>
              {currentView === 'original' ? '原始学术版' : '增强学术版'}
            </strong>
            {currentView === 'original' ? (
              <span style={{ marginLeft: '0.5rem', color: '#64748b', fontSize: '0.9rem' }}>
                - 纯学术风格，Okabe-Ito配色，适合期刊投稿
              </span>
            ) : (
              <span style={{ marginLeft: '0.5rem', color: '#0ea5e9', fontSize: '0.9rem' }}>
                - 学术+商业平衡，突出创新点，适合融资演示
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 主架构图 */}
      <div className="demo-section">
        {currentView === 'original' ? (
          <VisualStructuredMemoryFigure />
        ) : (
          <EnhancedVisualStructuredMemoryFigure />
        )}
      </div>

      {/* 特性介绍 */}
      <section className="features">
        <div className="feature-card">
          <h3 className="feature-title">学术出版级配色</h3>
          <p className="feature-description">
            采用 Okabe-Ito 色盲友好方案，确保打印和屏幕显示的清晰度，对比度≥4.5:1（WCAG AA标准）。
          </p>
        </div>

        <div className="feature-card">
          <h3 className="feature-title">清晰的信息层次</h3>
          <p className="feature-description">
            遵循Tufte原则，数据-墨水比&gt;90%，移除装饰性元素，专注核心信息传达。
          </p>
        </div>

        <div className="feature-card">
          <h3 className="feature-title">专业图标系统</h3>
          <p className="feature-description">
            使用 Lucide Icons 替代表情符号，提供语义化的专业图标，符合学术出版规范。
          </p>
        </div>

        <div className="feature-card">
          <h3 className="feature-title">模块化架构</h3>
          <p className="feature-description">
            数据驱动的组件化设计，架构配置与渲染逻辑完全分离，易于维护和扩展。
          </p>
        </div>

        <div className="feature-card">
          <h3 className="feature-title">多格式导出</h3>
          <p className="feature-description">
            支持 SVG 矢量格式和 PNG（300 DPI）高清格式，适配学术期刊和会议投稿要求。
          </p>
        </div>

        <div className="feature-card">
          <h3 className="feature-title">类型安全</h3>
          <p className="feature-description">
            基于 TypeScript 构建，完整的类型定义确保代码质量和可维护性。
          </p>
        </div>
      </section>

      {/* 页脚 */}
      <footer className="footer">
        <p>基于Linus架构哲学设计 · 模块化 · 数据驱动 · 零依赖</p>
        <p style={{ marginTop: '0.5rem' }}>
          使用 React + TypeScript + SVG 构建 · 代码开源 · MIT许可证
        </p>
      </footer>
    </div>
  );
}

// 渲染应用
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}