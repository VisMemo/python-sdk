import React, { useState } from 'react';
import { SVGCanvas, GradientDefs } from './base';
import { PerceptionLayer, RelationalLayer, ReasoningLayer } from './layers';
import { ConnectionLine } from './base/ConnectionLine';
import { enhancedAcademicConfig } from '../data/enhancedAcademicTheme';
import { ArchitectureConfig } from '../types';
import { exportHighResolution, getSVGElement, quickExportPresets } from '../utils/highResolutionExport';

/**
 * 增强版主架构图组件
 *
 * 特点：
 * 1. 保持学术严谨性，增强视觉表现力
 * 2. 突出理论创新点
 * 3. 增加应用场景展示
 * 4. 提供高分辨率导出功能
 */
export const EnhancedVisualStructuredMemoryFigure: React.FC<{
  config?: ArchitectureConfig;
}> = ({ config = enhancedAcademicConfig }) => {
  const [showInnovations, setShowInnovations] = useState(true);
  const { title, subtitle, dimensions, layers, connections, legend, comparison, innovations, applications } = config;

  /**
   * 渲染标题区域 - 增强版
   */
  const renderHeader = () => (
    <g className="text-center">
      {/* 标题背景 - 增强视觉层次 */}
      <defs>
        <linearGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{stopColor: '#F8FAFC', stopOpacity: 1}} />
          <stop offset="100%" style={{stopColor: '#E2E8F0', stopOpacity: 1}} />
        </linearGradient>
      </defs>

      <rect x="180" y="20" width="920" height="70" rx="12"
            fill="url(#headerGradient)" stroke="#CBD5E1" strokeWidth="2"/>

      {/* 主标题 */}
      <text x="640" y="48" textAnchor="middle" fontSize="24" fontWeight="700" fill="#1E293B"
            fontFamily="Monaco, Menlo, Consolas, monospace">
        {title}
      </text>

      {/* 副标题 */}
      <text x="640" y="70" textAnchor="middle" fontSize="14" fill="#64748B"
            fontFamily="Monaco, Menlo, Consolas, monospace">
        {subtitle}
      </text>
    </g>
  );

  /**
   * 渲染理论创新点 - 新增
   */
  const renderInnovations = () => {
    if (!showInnovations || !innovations) return null;

    return (
      <g>
        {innovations.map((innovation, index) => (
          <g key={index} transform={`translate(${innovation.position.x}, ${innovation.position.y})`}>
            {/* 创新点背景 */}
            <rect x="-60" y="-15" width="120" height="30" rx="15"
                  fill="#FFD60A" fillOpacity="0.15" stroke="#FFD60A" strokeWidth="1.5"/>

            {/* 闪电图标 */}
            <text x="-45" y="5" fontSize="16">⚡</text>

            {/* 创新点文字 */}
            <text x="-25" y="5" fontSize="11" fontWeight="600" fill="#1E293B"
                  fontFamily="Monaco, Menlo, Consolas, monospace">
              {innovation.title}
            </text>
          </g>
        ))}
      </g>
    );
  };

  /**
   * 渲染系统对比 - 增强版
   */
  const renderComparison = () => (
    <g transform="translate(40, 650)">
      {/* 背景框 - 增强视觉层次 */}
      <defs>
        <linearGradient id="comparisonGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{stopColor: '#F8FAFC', stopOpacity: 1}} />
          <stop offset="100%" style={{stopColor: '#F1F5F9', stopOpacity: 1}} />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="1200" height="60" rx="10"
            fill="url(#comparisonGradient)" stroke="#E2E8F0" strokeWidth="1.5"/>

      {/* 对比标签 */}
      <text x="24" y="22" fontSize="13" fill="#1E293B" fontWeight="700"
            fontFamily="Monaco, Menlo, Consolas, monospace">
        系统对比 | System Comparison
      </text>

      {/* 被动记忆 */}
      <g transform="translate(120, 8)">
        <rect x="0" y="0" width="4" height="24" rx="2" fill="#94A3B8"/>
        <text x="12" y="12" fontSize="12" fill="#475569" fontWeight="500" fontFamily="Monaco, Menlo, Consolas, monospace">
          传统被动记忆 | Traditional
        </text>
        <text x="12" y="26" fontSize="10" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
          {comparison.passive}
        </text>
      </g>

      {/* 主动记忆 */}
      <g transform="translate(600, 8)">
        <rect x="0" y="0" width="4" height="24" rx="2" fill="#009E73"/>
        <text x="12" y="12" fontSize="12" fill="#1E293B" fontWeight="600" fontFamily="Monaco, Menlo, Consolas, monospace">
          视觉结构化记忆 | VSM
        </text>
        <text x="12" y="26" fontSize="10" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
          {comparison.active}
        </text>
      </g>
    </g>
  );

  /**
   * 渲染图例 - 增强版
   */
  const renderLegend = () => (
    <g transform="translate(40, 730)">
      {/* 图例背景 */}
      <rect x="0" y="0" width="1200" height="50" rx="10"
            fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5"/>

      {/* 图例标题 */}
      <text x="24" y="20" fontSize="12" fontWeight="700" fill="#1E293B"
            fontFamily="Monaco, Menlo, Consolas, monospace">
        核心机制 | Core Mechanisms
      </text>

      {/* 图例项 - 紧凑布局 */}
      {legend.map((item, index) => (
        <g key={index} transform={`translate(${150 + index * 220}, 8)`}>
          <text x="0" y="12" fontSize="16">{item.icon}</text>
          <text x="20" y="12" fontSize="10" fontWeight="500" fill="#1E293B"
                fontFamily="Monaco, Menlo, Consolas, monospace">
            {item.label}
          </text>
        </g>
      ))}
    </g>
  );

  /**
   * 渲染应用场景 - 新增
   */
  const renderApplications = () => {
    if (!applications) return null;

    return (
      <g transform="translate(900, 735)">
        <text x="0" y="12" fontSize="10" fontWeight="600" fill="#64748B"
              fontFamily="Monaco, Menlo, Consolas, monospace">
          {applications.title}:
        </text>
        <text x="0" y="28" fontSize="9" fill="#94A3B8"
              fontFamily="Monaco, Menlo, Consolas, monospace">
          {applications.items.join(' · ')}
        </text>
      </g>
    );
  };

  /**
   * 高分辨率导出功能
   */
  const handleExport = async (format: 'svg' | 'png', preset: 'academic' | 'presentation' | 'web' = 'academic') => {
    try {
      const svgElement = getSVGElement('#enhanced-architecture-svg svg');
      if (!svgElement) {
        alert('未找到SVG元素，请确保架构图已加载');
        return;
      }

      const exportOptions = quickExportPresets[preset][format];
      await exportHighResolution(svgElement, exportOptions);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请查看控制台了解详情');
    }
  };

  return (
    <div className="w-full p-8 bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl">
      {/* 控制面板 */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-4">
          <button
            onClick={() => setShowInnovations(!showInnovations)}
            className="px-4 py-2 bg-white rounded-lg shadow-sm border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            {showInnovations ? '隐藏' : '显示'}创新点
          </button>
        </div>

        <div className="flex gap-2">
          {/* SVG导出 */}
          <div className="relative group">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
              导出 SVG
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
              <button
                onClick={() => handleExport('svg', 'academic')}
                className="block w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
              >
                期刊投稿 (300dpi)
              </button>
              <button
                onClick={() => handleExport('svg', 'presentation')}
                className="block w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
              >
                演示文稿 (150dpi)
              </button>
              <button
                onClick={() => handleExport('svg', 'web')}
                className="block w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
              >
                网页显示 (72dpi)
              </button>
            </div>
          </div>

          {/* PNG导出 */}
          <div className="relative group">
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg shadow-sm hover:bg-green-700 transition-colors">
              导出 PNG
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
              <button
                onClick={() => handleExport('png', 'academic')}
                className="block w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
              >
                期刊投稿 (300dpi)
              </button>
              <button
                onClick={() => handleExport('png', 'presentation')}
                className="block w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
              >
                演示文稿 (150dpi)
              </button>
              <button
                onClick={() => handleExport('png', 'web')}
                className="block w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
              >
                网页显示 (72dpi)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 主SVG画布 - 增强版 */}
      <div className="w-full overflow-x-auto rounded-xl border bg-white shadow-lg">
        <SVGCanvas dimensions={dimensions} className="transition-all duration-300">
          <g id="enhanced-architecture-svg">
            {/* 渐变定义 */}
            <GradientDefs gradients={layers.map(layer => layer.gradient)} />

            {/* 标题 */}
            {renderHeader()}

            {/* 理论创新点 */}
            {renderInnovations()}

            {/* 三个核心层次 */}
            <PerceptionLayer data={layers[0]} />
            <RelationalLayer data={layers[1]} />
            <ReasoningLayer data={layers[2]} />

            {/* 层间连接 */}
            {connections.map(connection => (
              <ConnectionLine key={connection.id} connection={connection} />
            ))}

            {/* 对比说明 */}
            {renderComparison()}

            {/* 图例 */}
            {renderLegend()}

            {/* 应用场景 */}
            {renderApplications()}
          </g>
        </SVGCanvas>
      </div>

      {/* 版本说明 */}
      <div className="mt-4 text-center text-sm text-gray-500">
        增强学术版 · Enhanced Academic Edition | 保留学术严谨性，增强视觉表现力
      </div>
    </div>
  );
};

export default EnhancedVisualStructuredMemoryFigure;