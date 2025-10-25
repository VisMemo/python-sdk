import React from 'react';
import { ConnectionData } from '../../types';

interface ConnectionLineProps {
  connection: ConnectionData;
}

/**
 * 连接线组件
 * 支持直线、曲线、箭头等多种连接样式
 */
export const ConnectionLine: React.FC<ConnectionLineProps> = ({ connection }) => {
  const { from, to, type, style } = connection;
  const {
    stroke = '#64748b',
    strokeWidth = 3,
    dashArray = '',
    marker = 'arrow'
  } = style || {};

  const getPath = () => {
    switch (type) {
      case 'curve':
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2 - 30; // 向上弯曲
        return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
      case 'line':
        return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
      default:
        return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }
  };

  return (
    <path
      d={getPath()}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={dashArray}
      fill="none"
      markerEnd={marker ? `url(#${marker})` : undefined}
      className="transition-all duration-300"
    />
  );
};