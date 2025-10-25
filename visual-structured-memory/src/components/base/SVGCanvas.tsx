import React from 'react';
import { Dimension } from '../../types';

interface SVGCanvasProps {
  dimensions: Dimension;
  children: React.ReactNode;
  className?: string;
}

/**
 * 基础SVG画布组件
 * 提供统一的画布设置和网格背景
 */
export const SVGCanvas: React.FC<SVGCanvasProps> = ({
  dimensions,
  children,
  className = ''
}) => {
  const { width, height } = dimensions;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full h-auto ${className}`}
    >
      {/* 定义可复用的资源 */}
      <defs>
        {/* 网格背景 */}
        <pattern
          id="grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="#f8fafc"
            strokeWidth="1"
          />
        </pattern>

        {/* 阴影滤镜 */}
        <filter
          id="softShadow"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur"/>
          <feOffset in="blur" dx="0" dy="2" result="offset"/>
          <feMerge>
            <feMergeNode in="offset"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        {/* 箭头标记 */}
        <marker
          id="arrow"
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill="#64748b" />
        </marker>

        {/* 发光效果 */}
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* 背景网格 */}
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        fill="url(#grid)"
      />

      {/* 子内容 */}
      {children}
    </svg>
  );
};