import React from 'react';
import { SVGCanvas, GradientDefs } from './base';
import { PerceptionLayer, RelationalLayer, ReasoningLayer } from './layers';
import { ConnectionLine } from './base/ConnectionLine';
import { architectureConfig } from '../data/architectureConfig';
import { ArchitectureConfig } from '../types';

/**
 * 主架构图组件
 * 数据驱动的视觉化展示
 */
export const VisualStructuredMemoryFigure: React.FC<{
  config?: ArchitectureConfig;
}> = ({ config = architectureConfig }) => {
  const { title, subtitle, dimensions, layers, connections, legend, comparison } = config;

  const renderHeader = () => (
    <g className="text-center">
      {/* 标题背景 - 移除装饰性渐变 */}
      <rect x="200" y="20" width="880" height="56" rx="8"
            fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1"/>

      {/* 主标题 */}
      <text x="640" y="46" textAnchor="middle" fontSize="22" fontWeight="600" fill="#1E293B"
            fontFamily="Monaco, Menlo, Consolas, monospace">
        {title}
      </text>

      {/* 副标题 */}
      <text x="640" y="64" textAnchor="middle" fontSize="13" fill="#64748B"
            fontFamily="Monaco, Menlo, Consolas, monospace">
        {subtitle}
      </text>
    </g>
  );

  const renderComparison = () => (
    <g transform="translate(40, 680)">
      {/* 背景框 - 学术风格，降低视觉噪音 */}
      <rect x="0" y="0" width="1200" height="50" rx="8"
            fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1"/>

      {/* 对比标签 */}
      <text x="24" y="22" fontSize="12" fill="#1E293B" fontWeight="600"
            fontFamily="Monaco, Menlo, Consolas, monospace">
        系统对比
      </text>

      {/* 被动记忆 */}
      <g transform="translate(120, 10)">
        <rect x="0" y="0" width="4" height="24" rx="2" fill="#94A3B8"/>
        <text x="12" y="12" fontSize="12" fill="#475569" fontFamily="Monaco, Menlo, Consolas, monospace">
          传统文本记忆
        </text>
        <text x="12" y="26" fontSize="10" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
          被动存储 → 关键词检索
        </text>
      </g>

      {/* 主动记忆 */}
      <g transform="translate(580, 10)">
        <rect x="0" y="0" width="4" height="24" rx="2" fill="#009E73"/>
        <text x="12" y="12" fontSize="12" fill="#1E293B" fontWeight="500" fontFamily="Monaco, Menlo, Consolas, monospace">
          视觉结构化记忆
        </text>
        <text x="12" y="26" fontSize="10" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
          主动感知 → 场景图 → 情节记忆 → 推理强化
        </text>
      </g>
    </g>
  );

  const renderLegend = () => (
    <g transform="translate(40, 750)">
      {/* 图例背景 */}
      <rect x="0" y="0" width="1200" height="110" rx="8"
            fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1"/>

      {/* 图例标题 */}
      <text x="24" y="28" fontSize="13" fontWeight="600" fill="#1E293B"
            fontFamily="Monaco, Menlo, Consolas, monospace">
        核心机制
      </text>

      {/* 图例项 - 使用色块代替表情 */}
      <g transform="translate(24, 48)">
        {/* 感知层 */}
        <g transform="translate(0, 0)">
          <rect x="0" y="-8" width="12" height="12" rx="2" fill="#0072B2"/>
          <text x="20" y="2" fontSize="11" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
            感知层：视觉输入 → 对象检测 → 特征提取
          </text>
        </g>

        {/* 关系层 */}
        <g transform="translate(320, 0)">
          <rect x="0" y="-8" width="12" height="12" rx="2" fill="#E69F00"/>
          <text x="20" y="2" fontSize="11" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
            关系层：三元组表达 → 场景图构建
          </text>
        </g>

        {/* 推理层 */}
        <g transform="translate(620, 0)">
          <rect x="0" y="-8" width="12" height="12" rx="2" fill="#CC79A7"/>
          <text x="20" y="2" fontSize="11" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
            推理层：情节记忆 → 推理查询 → 权重强化
          </text>
        </g>

        {/* 数据流 */}
        <g transform="translate(980, 0)">
          <line x1="0" y1="-2" x2="12" y2="-2" stroke="#64748B" strokeWidth="2"/>
          <polygon points="12,-2 9,-4 9,0" fill="#64748B"/>
          <text x="20" y="2" fontSize="11" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
            信息流向
          </text>
        </g>
      </g>

      {/* 核心原则 */}
      <g transform="translate(24, 78)">
        <text fontSize="11" fontWeight="600" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
          设计原则：
        </text>
        <text x="90" y="0" fontSize="10" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
          结构化优先（Who-Where-What）· 持续感知与写入 · 基于反馈的动态权重调整 · 自学习记忆生态
        </text>
      </g>
    </g>
  );

  return (
    <div className="w-full p-8 bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl">
      {/* 主SVG画布 */}
      <div className="w-full overflow-x-auto rounded-xl border bg-white shadow-lg">
        <SVGCanvas dimensions={dimensions} className="transition-all duration-300">
          {/* 渐变定义 */}
          <GradientDefs gradients={layers.map(layer => layer.gradient)} />

          {/* 标题 */}
          {renderHeader()}

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
        </SVGCanvas>
      </div>
    </div>
  );
};

export default VisualStructuredMemoryFigure;