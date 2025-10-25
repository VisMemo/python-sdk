/**
 * 核心数据类型定义
 * 遵循"数据结构先行"原则
 */

// 基础几何类型
export interface Point {
  x: number;
  y: number;
}

export interface Dimension {
  width: number;
  height: number;
}

export interface Box extends Point, Dimension {}

// 颜色和样式
export interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  border: string;
}

export interface GradientDef {
  id: string;
  type: 'linear';
  colors: string[];
  angle?: number;  // 渐变角度，增强版支持
  direction?: string;
}

// 层次架构数据
export interface LayerData {
  id: string;
  title: string;
  subtitle: string;
  position: Box;
  colorScheme: ColorScheme;
  gradient: GradientDef;
  components: ComponentData[];
}

export interface ComponentData {
  id: string;
  type: 'keyframes' | 'objectSlots' | 'metadata' | 'triples' | 'graph' | 'episodic' | 'weights';
  position: Box;
  title: string;
  content: string | string[];
  style?: ComponentStyle;
}

export interface ComponentStyle {
  borderRadius?: number;
  padding?: number;
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  letterSpacing?: string;
}

// 连接数据
export interface ConnectionData {
  id: string;
  from: Point;
  to: Point;
  type: 'arrow' | 'line' | 'curve' | 'enhanced-arrow' | 'flow-arrow';  // 增强版支持新类型
  label?: string;  // 增强版支持标签
  style?: ConnectionStyle;
}

export interface ConnectionStyle {
  stroke?: string;
  strokeWidth?: number;
  dashArray?: string;
  marker?: string;
  opacity?: number;  // 增强版支持透明度
  animation?: 'flow' | 'pulse';  // 增强版支持动画
}

// 图例数据
export interface LegendItem {
  icon: string;
  label: string;
  color: string;
}

// 创新点数据 - 增强版新增
export interface InnovationPoint {
  title: string;
  description: string;
  icon: string;
  position: Point;
}

// 应用场景数据 - 增强版新增
export interface Applications {
  title: string;
  items: string[];
}

// 完整架构图配置
export interface ArchitectureConfig {
  title: string;
  subtitle: string;
  dimensions: Dimension;
  layers: LayerData[];
  connections: ConnectionData[];
  legend: LegendItem[];
  comparison: {
    passive: string;
    active: string;
  };
  // 增强版新增字段
  innovations?: InnovationPoint[];
  applications?: Applications;
}

// 视觉主题配置
export interface VisualTheme {
  name: string;
  colors: {
    perception: ColorScheme;
    relational: ColorScheme;
    reasoning: ColorScheme;
    neutral?: {
      gray50: string;
      gray100: string;
      gray200: string;
      gray300: string;
      gray400: string;
      gray500: string;
      gray600: string;
      gray700: string;
      gray800: string;
      gray900: string;
    };
    semantic?: {
      success: string;
      warning: string;
      error: string;
      info: string;
    };
  };
  gradients: {
    perception: GradientDef;
    relational: GradientDef;
    reasoning: GradientDef;
  };
  typography: {
    title: ComponentStyle;
    subtitle: ComponentStyle;
    body: ComponentStyle;
    caption: ComponentStyle;
    mono?: ComponentStyle;
  };
  spacing?: {
    unit: number;
    small: number;
    medium: number;
    large: number;
    xlarge: number;
  };
  borderRadius?: {
    small: number;
    medium: number;
    large: number;
  };
  strokeWidth?: {
    thin: number;
    normal: number;
    thick: number;
    bold: number;
  };
}