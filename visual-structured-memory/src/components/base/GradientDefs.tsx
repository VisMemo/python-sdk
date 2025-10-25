import React from 'react';
import { GradientDef } from '../../types';

interface GradientDefsProps {
  gradients: GradientDef[];
}

/**
 * SVG渐变和标记定义组件
 * 统一管理所有渐变效果、箭头标记等
 */
export const GradientDefs: React.FC<GradientDefsProps> = ({ gradients }) => {
  return (
    <defs>
      {/* 渐变定义 */}
      {gradients.map((gradient) => (
        <linearGradient
          key={gradient.id}
          id={gradient.id}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          {gradient.colors.map((color, index) => (
            <stop
              key={index}
              offset={`${(index / (gradient.colors.length - 1)) * 100}%`}
              stopColor={color}
            />
          ))}
        </linearGradient>
      ))}
      
      {/* 箭头标记定义 */}
      <marker
        id="arrow"
        markerWidth="10"
        markerHeight="10"
        refX="8"
        refY="3"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M0,0 L0,6 L9,3 z" fill="#64748B" />
      </marker>
      
      {/* 细微阴影效果（学术风格）*/}
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
        <feOffset dx="0" dy="1" result="offsetblur"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.1"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
  );
};