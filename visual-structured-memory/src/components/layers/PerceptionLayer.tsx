import React from 'react';
import { LayerContainer } from '../base';
import { SVGIcon } from '../base/Icons';
import { LayerData } from '../../types';

interface PerceptionLayerProps {
  data: LayerData;
}

/**
 * 感知层组件 - 重构版
 * 清晰展示：视觉输入 → 特征提取 → 结构化存储的数据流
 * 
 * 设计原则：
 * 1. 从上到下的线性数据流
 * 2. 专业图标替代表情符号
 * 3. 统一的网格对齐和间距
 * 4. 学术级配色和排版
 */
export const PerceptionLayer: React.FC<PerceptionLayerProps> = ({ data }) => {
  
  /**
   * 1. 视觉输入模块
   */
  const renderVisualInput = () => (
    <g transform="translate(0, 0)">
      {/* 模块标题 */}
      <text x="0" y="0" fontSize="15" fontWeight="600" fill="#2C3E50" fontFamily="Monaco, Menlo, Consolas, monospace">
        视觉输入层
      </text>
      <text x="0" y="18" fontSize="12" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
        Visual Input Stream
      </text>
      
      {/* 输入卡片 */}
      <rect x="0" y="30" width="290" height="85" rx="8"
            fill="#FFFFFF" stroke="#0072B2" strokeWidth="2"/>
      
      {/* 视频流示意 - 改为帧序列，减少重复感 */}
      <g transform="translate(20, 50)">
        {/* 简化为单个视频流表示 + 文字说明 */}
        <SVGIcon type="camera" x="10" y="5" size="28" color="#0072B2" strokeWidth="2"/>
        
        <text x="50" y="20" fontSize="14" fontWeight="500" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
          视频帧序列
        </text>
        <text x="50" y="38" fontSize="12" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
          Frame: t_n-2 → t_n-1 → t_n
        </text>
      </g>
    </g>
  );

  /**
   * 2. 对象检测与分割
   */
  const renderObjectDetection = () => (
    <g transform="translate(0, 112)">
      {/* 模块标题 */}
      <text x="0" y="0" fontSize="11" fontWeight="600" fill="#2C3E50" fontFamily="Monaco, Menlo, Consolas, monospace">
        对象检测与分割
      </text>
      <text x="0" y="14" fontSize="9" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
        Object Detection & Segmentation
      </text>
      
      {/* 对象槽容器 */}
      <rect x="0" y="24" width="290" height="140" rx="8"
            fill="#FFFFFF" stroke="#0072B2" strokeWidth="1.5"/>
      
      {/* 槽位网格 */}
      <g transform="translate(14, 38)">
        {/* 标题行 */}
        <text x="0" y="0" fontSize="9" fontWeight="600" fill="#334155" fontFamily="Monaco, Menlo, Consolas, monospace">
          Object Slots
        </text>
        
        {/* 三类槽位 */}
        {[
          { label: 'Person', icon: 'users', x: 0 },
          { label: 'Object', icon: 'box', x: 90 },
          { label: 'Scene', icon: 'map', x: 180 }
        ].map((slot, i) => (
          <g key={i} transform={`translate(${slot.x}, 16)`}>
            {/* 槽位卡片 */}
            <rect x="0" y="0" width="78" height="88" rx="6"
                  fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1"/>
            
            {/* 图标区域 */}
            <rect x="8" y="8" width="62" height="46" rx="4"
                  fill="#E8F4F8" stroke="#56B4E9" strokeWidth="1"/>
            <SVGIcon type={slot.icon as any} x="27" y="20" size="24" color="#0072B2" strokeWidth="1.5"/>
            
            {/* 标签 */}
            <text x="39" y="68" textAnchor="middle" fontSize="9" fontWeight="500" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
              {slot.label}
            </text>
            
            {/* 状态指示 */}
            <circle cx="39" cy="78" r="3" fill="#009E73"/>
          </g>
        ))}
      </g>
    </g>
  );

  /**
   * 3. 特征向量化
   */
  const renderFeatureEmbedding = () => (
    <g transform="translate(0, 276)">
      {/* 模块标题 */}
      <text x="0" y="0" fontSize="11" fontWeight="600" fill="#2C3E50" fontFamily="Monaco, Menlo, Consolas, monospace">
        多模态特征提取
      </text>
      <text x="0" y="14" fontSize="9" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
        Multimodal Feature Extraction
      </text>
      
      {/* 特征容器 */}
      <rect x="0" y="24" width="290" height="156" rx="8"
            fill="#FFFFFF" stroke="#0072B2" strokeWidth="1.5"/>
      
      {/* 特征列表 */}
      <g transform="translate(16, 42)">
        {[
          { icon: 'clock', label: '时间戳', desc: 'Timestamp: t_i', color: '#0072B2' },
          { icon: 'map', label: '空间坐标', desc: 'Position: (x, y, z)', color: '#0072B2' },
          { icon: 'eye', label: '视角方向', desc: 'Viewpoint: (θ, φ, ψ)', color: '#0072B2' },
          { icon: 'database', label: '嵌入向量', desc: 'Embedding: ℝ^d', color: '#0072B2' }
        ].map((feature, i) => (
          <g key={i} transform={`translate(0, ${i * 32})`}>
            {/* 图标 */}
            <SVGIcon type={feature.icon as any} x="0" y="2" size="16" color={feature.color} strokeWidth="1.5"/>
            
            {/* 标签 */}
            <text x="22" y="6" fontSize="10" fontWeight="500" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
              {feature.label}
            </text>
            
            {/* 描述 */}
            <text x="22" y="18" fontSize="8" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
              {feature.desc}
            </text>
          </g>
        ))}
      </g>
    </g>
  );

  return (
    <LayerContainer
      position={data.position}
      colorScheme={data.colorScheme}
      gradient={data.gradient.id}
      title={data.title}
    >
      {renderVisualInput()}
      {renderObjectDetection()}
      {renderFeatureEmbedding()}
    </LayerContainer>
  );
};