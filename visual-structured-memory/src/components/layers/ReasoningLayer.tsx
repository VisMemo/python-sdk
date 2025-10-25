import React from 'react';
import { LayerContainer } from '../base';
import { SVGIcon } from '../base/Icons';
import { LayerData } from '../../types';

interface ReasoningLayerProps {
  data: LayerData;
}

/**
 * 推理层组件 - 重构版
 * 清晰展示：情节记忆 → 推理查询 → 权重强化的认知循环
 * 
 * 设计原则：
 * 1. 时序性的事件链表达
 * 2. 推理过程的可视化
 * 3. 强化学习的反馈机制
 */
export const ReasoningLayer: React.FC<ReasoningLayerProps> = ({ data }) => {
  
  /**
   * 1. 情节记忆图 (Episodic Memory Graph)
   */
  const renderEpisodicMemory = () => (
    <g transform="translate(0, 0)">
      {/* 模块标题 */}
      <text x="0" y="0" fontSize="11" fontWeight="600" fill="#2C3E50" fontFamily="Monaco, Menlo, Consolas, monospace">
        情节记忆图
      </text>
      <text x="0" y="14" fontSize="9" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
        Episodic Memory Graph
      </text>
      
      {/* 记忆容器 */}
      <rect x="0" y="24" width="300" height="180" rx="8"
            fill="#FFFFFF" stroke="#CC79A7" strokeWidth="1.5"/>
      
      {/* 事件时间线 */}
      <g transform="translate(20, 50)">
        {/* 时间轴 */}
        <line x1="0" y1="24" x2="260" y2="24" stroke="#E2E8F0" strokeWidth="1"/>
        
        {/* 事件节点 */}
        {[
          { id: 'E₁', x: 0, label: 'Event 1' },
          { id: 'E₂', x: 100, label: 'Event 2' },
          { id: 'E₃', x: 200, label: 'Event 3' }
        ].map((event, i) => (
          <g key={i} transform={`translate(${event.x + 30}, 0)`}>
            {/* 事件卡片 */}
            <rect x="-28" y="0" width="56" height="48" rx="6"
                  fill="#FCF0F7" stroke="#CC79A7" strokeWidth="1.5"/>
            
            {/* 事件标识 */}
            <text x="0" y="18" textAnchor="middle" fontSize="11" fontWeight="600" fill="#CC79A7" fontFamily="Monaco, Menlo, Consolas, monospace">
              {event.id}
            </text>
            <text x="0" y="32" textAnchor="middle" fontSize="8" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
              {event.label}
            </text>
            
            {/* 时间点标记 */}
            <circle cx="0" cy="48" r="4" fill="#CC79A7"/>
            
            {/* 箭头 */}
            {i < 2 && (
              <>
                <line x1="28" y1="24" x2="70" y2="24" stroke="#CBD5E1" strokeWidth="1.5"/>
                <polygon points="70,24 65,21 65,27" fill="#CBD5E1"/>
              </>
            )}
          </g>
        ))}
      </g>
      
      {/* 推理查询 */}
      <g transform="translate(20, 130)">
        <text x="0" y="0" fontSize="10" fontWeight="600" fill="#2C3E50" fontFamily="Monaco, Menlo, Consolas, monospace">
          推理查询 (Reasoning Queries)
        </text>
        
        {/* 因果查询 */}
        <g transform="translate(0, 16)">
          <SVGIcon type="zap" x="0" y="0" size="12" color="#0072B2" strokeWidth="1.5"/>
          <text x="18" y="6" fontSize="9" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
            Why: 因果推理
          </text>
          <text x="18" y="18" fontSize="8" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
            E₂ ∧ E₁ → causal_link
          </text>
        </g>
        
        {/* 预测查询 */}
        <g transform="translate(150, 16)">
          <SVGIcon type="trending-up" x="0" y="0" size="12" color="#009E73" strokeWidth="1.5"/>
          <text x="18" y="6" fontSize="9" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
            Next: 预测推理
          </text>
          <text x="18" y="18" fontSize="8" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
            E₃ | E₁, E₂ → predict
          </text>
        </g>
      </g>
    </g>
  );

  /**
   * 2. 权重强化与遗忘机制
   */
  const renderWeightReinforcement = () => (
    <g transform="translate(0, 224)">
      {/* 模块标题 */}
      <text x="0" y="0" fontSize="11" fontWeight="600" fill="#2C3E50" fontFamily="Monaco, Menlo, Consolas, monospace">
        动态权重强化
      </text>
      <text x="0" y="14" fontSize="9" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
        Dynamic Weight Reinforcement
      </text>
      
      {/* 强化容器 */}
      <rect x="0" y="24" width="300" height="196" rx="8"
            fill="#FFFFFF" stroke="#CC79A7" strokeWidth="1.5"/>
      
      {/* 强化循环 */}
      <g transform="translate(150, 90)">
        {/* 循环箭头路径 */}
        <defs>
          <marker id="arrow-reinforce" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <polygon points="0,0 5,3 0,6" fill="#E69F00"/>
          </marker>
        </defs>
        
        <path 
          d="M -90 30 C -60 -20, 60 -20, 90 30"
          stroke="#E69F00" 
          strokeWidth="2.5" 
          fill="none"
          markerEnd="url(#arrow-reinforce)"
        />
        
        {/* 强化节点 */}
        <g transform="translate(-80, 30)">
          <circle r="16" fill="#E8F9F3" stroke="#009E73" strokeWidth="2"/>
          <SVGIcon type="trending-up" x="-6" y="-6" size="12" color="#009E73" strokeWidth="2"/>
          <text y="-24" textAnchor="middle" fontSize="9" fontWeight="500" fill="#009E73" fontFamily="Monaco, Menlo, Consolas, monospace">
            Reinforce
          </text>
          <text y="-12" textAnchor="middle" fontSize="8" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
            w ← w + η·δ
          </text>
        </g>
        
        {/* 遗忘节点 */}
        <g transform="translate(80, 30)">
          <circle r="16" fill="#FEF2F2" stroke="#D55E00" strokeWidth="2"/>
          <SVGIcon type="trending-down" x="-6" y="-6" size="12" color="#D55E00" strokeWidth="2"/>
          <text y="-24" textAnchor="middle" fontSize="9" fontWeight="500" fill="#D55E00" fontFamily="Monaco, Menlo, Consolas, monospace">
            Decay
          </text>
          <text y="-12" textAnchor="middle" fontSize="8" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
            w ← (1-λ)w
          </text>
        </g>
        
        {/* 中心记忆 */}
        <g transform="translate(0, -30)">
          <rect x="-32" y="-16" width="64" height="32" rx="4" fill="#FCF0F7" stroke="#CC79A7" strokeWidth="1.5"/>
          <text y="0" textAnchor="middle" fontSize="10" fontWeight="600" fill="#CC79A7" fontFamily="Monaco, Menlo, Consolas, monospace">
            Memory
          </text>
          <text y="12" textAnchor="middle" fontSize="8" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
            Weight: w
          </text>
        </g>
      </g>
      
      {/* 触发条件 */}
      <g transform="translate(20, 168)">
        <text x="0" y="0" fontSize="9" fontWeight="600" fill="#2C3E50" fontFamily="Monaco, Menlo, Consolas, monospace">
          触发条件
        </text>
        
        <g transform="translate(0, 14)">
          <circle cx="4" cy="0" r="3" fill="#009E73"/>
          <text x="12" y="4" fontSize="8" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
            查询命中 / 行为反馈成功 → 权重增强
          </text>
        </g>
        
        <g transform="translate(0, 28)">
          <circle cx="4" cy="0" r="3" fill="#D55E00"/>
          <text x="12" y="4" fontSize="8" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
            长期未使用 / 冲突矛盾 → 权重衰减
          </text>
        </g>
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
      {renderEpisodicMemory()}
      {renderWeightReinforcement()}
    </LayerContainer>
  );
};