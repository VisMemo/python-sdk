import React from 'react';
import { Box, ColorScheme, ComponentStyle } from '../../types';

interface LayerContainerProps {
  position: Box;
  colorScheme: ColorScheme;
  gradient: string;
  title: string;
  titleStyle?: ComponentStyle;
  children: React.ReactNode;
  borderRadius?: number;
}

/**
 * 通用层次容器组件
 * 提供统一的层次视觉效果
 */
export const LayerContainer: React.FC<LayerContainerProps> = ({
  position,
  colorScheme,
  gradient,
  title,
  titleStyle,
  children,
  borderRadius = 18
}) => {
  const { x, y, width, height } = position;
  const { fontSize = 20, fontWeight = 'bold' } = titleStyle || {};

  return (
    <g transform={`translate(${x}, ${y})`} filter="url(#softShadow)">
      {/* 主容器 - 使用浅色背景 */}
      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        rx={borderRadius}
        fill={colorScheme.accent}
        stroke={colorScheme.border}
        strokeWidth="2"
      />

      {/* 标题 */}
      <text
        x="20"
        y="36"
        fontSize={fontSize}
        fontWeight={fontWeight}
        fill={colorScheme.primary}
        fontFamily="Monaco, Menlo, Consolas, monospace"
      >
        {title}
      </text>

      {/* 子内容容器 */}
      <g transform="translate(20, 60)">
        {children}
      </g>
    </g>
  );
};