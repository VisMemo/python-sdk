import React from 'react';
import {
  Eye, Box, Users, MapPin, Clock, Image,
  Network, GitBranch, Zap, TrendingUp, TrendingDown,
  Play, Pause, RotateCcw, FileText, Database,
  Layers, Link2, ArrowRight, Circle, Square
} from 'lucide-react';

/**
 * 统一的图标系统
 * 提供语义化的图标组件，替代表情符号
 */

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

/**
 * 将 Lucide 图标转换为 SVG 路径，用于内联到主 SVG 中
 */
const IconWrapper: React.FC<IconProps & { children: React.ReactNode }> = ({
  children,
  size = 16,
  color = 'currentColor',
  strokeWidth = 2,
  className = ''
}) => {
  return (
    <g className={className}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, {
            width: size,
            height: size,
            stroke: color,
            strokeWidth: strokeWidth,
            fill: 'none'
          });
        }
        return child;
      })}
    </g>
  );
};

/**
 * 感知层图标
 */
export const PerceptionIcons = {
  Eye: (props: IconProps) => <Eye {...props} />,
  Camera: (props: IconProps) => <Image {...props} />,
  Object: (props: IconProps) => <Box {...props} />,
  Person: (props: IconProps) => <Users {...props} />,
  Location: (props: IconProps) => <MapPin {...props} />,
  Time: (props: IconProps) => <Clock {...props} />,
  Data: (props: IconProps) => <Database {...props} />
};

/**
 * 关系层图标
 */
export const RelationalIcons = {
  Network: (props: IconProps) => <Network {...props} />,
  Connection: (props: IconProps) => <Link2 {...props} />,
  Branch: (props: IconProps) => <GitBranch {...props} />,
  Node: (props: IconProps) => <Circle {...props} />
};

/**
 * 推理层图标
 */
export const ReasoningIcons = {
  Process: (props: IconProps) => <Zap {...props} />,
  Layers: (props: IconProps) => <Layers {...props} />,
  Document: (props: IconProps) => <FileText {...props} />,
  Reinforce: (props: IconProps) => <TrendingUp {...props} />,
  Decay: (props: IconProps) => <TrendingDown {...props} />,
  Flow: (props: IconProps) => <ArrowRight {...props} />
};

/**
 * 通用图标组件（用于 SVG 内部渲染）
 */
export const SVGIcon: React.FC<{
  type: 'eye' | 'camera' | 'box' | 'users' | 'clock' | 'map' | 'database' | 'network' | 'zap' | 'trending-up' | 'trending-down';
  x: string | number;
  y: string | number;
  size?: string | number;
  color?: string;
  strokeWidth?: string | number;
}> = ({ type, x, y, size = 16, color = '#64748b', strokeWidth = 2 }) => {
  const numX = typeof x === 'string' ? parseFloat(x) : x;
  const numY = typeof y === 'string' ? parseFloat(y) : y;
  const numSize = typeof size === 'string' ? parseFloat(size) : size;
  const numStrokeWidth = typeof strokeWidth === 'string' ? parseFloat(strokeWidth) : strokeWidth;
  const iconMap = {
    eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
    camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
    box: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12',
    users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
    clock: 'M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0 M12 6v6l4 2',
    map: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
    database: 'M12 2C6.5 2 2 3.79 2 6v12c0 2.21 4.5 4 10 4s10-1.79 10-4V6c0-2.21-4.5-4-10-4z M2 12c0 2.21 4.5 4 10 4s10-1.79 10-4 M2 18c0 2.21 4.5 4 10 4s10-1.79 10-4',
    network: 'M16 16m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M6 16m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M13 16h-5 M12 6m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M12 10v3',
    zap: 'M13 2L3 14h8l-1 8l10-12h-8l1-8z',
    'trending-up': 'M23 6l-9.5 9.5l-5-5L1 18 M17 6h6v6',
    'trending-down': 'M23 18l-9.5-9.5l-5 5L1 6 M17 18h6v-6'
  };

  return (
    <g transform={`translate(${numX}, ${numY})`}>
      <path
        d={iconMap[type]}
        fill="none"
        stroke={color}
        strokeWidth={numStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={`scale(${numSize / 24})`}
      />
    </g>
  );
};

export default SVGIcon;
