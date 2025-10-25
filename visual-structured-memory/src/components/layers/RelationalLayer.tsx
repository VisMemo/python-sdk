import React from 'react';
import { LayerContainer } from '../base';
import { SVGIcon } from '../base/Icons';
import { LayerData } from '../../types';

interface RelationalLayerProps {
  data: LayerData;
}

/**
 * 关系层组件 - 重构版
 * 清晰展示：三元组表达 → 场景图构建的关系建模
 * 
 * 设计原则：
 * 1. 符号化的实体-关系-实体表达
 * 2. 图结构的可视化呈现
 * 3. 学术化的标注和排版
 */
export const RelationalLayer: React.FC<RelationalLayerProps> = ({ data }) => {
  
  /**
   * 1. 谓词三元组 (Subject-Predicate-Object)
   */
  const renderTriples = () => (
    <g transform="translate(0, 0)">
      {/* 模块标题 */}
      <text x="0" y="0" fontSize="11" fontWeight="600" fill="#2C3E50" fontFamily="Monaco, Menlo, Consolas, monospace">
        谓词化关系表达
      </text>
      <text x="0" y="14" fontSize="9" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
        Predicate Triples (S, P, O)
      </text>
      
      {/* 三元组容器 */}
      <rect x="0" y="24" width="300" height="180" rx="8"
            fill="#FFFFFF" stroke="#E69F00" strokeWidth="1.5"/>
      
      {/* 三元组列表 */}
      <g transform="translate(16, 42)">
        {[
          { subj: 'Person_A', pred: 'holds', obj: 'Cup', subjType: 'users', objType: 'box' },
          { subj: 'Person_B', pred: 'sits_on', obj: 'Sofa', subjType: 'users', objType: 'box' },
          { subj: 'Cup', pred: 'on_top_of', obj: 'Table', subjType: 'box', objType: 'box' },
          { subj: 'Person_A', pred: 'talks_to', obj: 'Person_B', subjType: 'users', objType: 'users' },
          { subj: 'Event_1', pred: 'before', obj: 'Event_2', subjType: 'clock', objType: 'clock' }
        ].map((triple, i) => (
          <g key={i} transform={`translate(0, ${i * 30})`}>
            {/* 主体图标 */}
            <circle cx="8" cy="4" r="6" fill="#FFF4E6" stroke="#E69F00" strokeWidth="1"/>
            <SVGIcon type={triple.subjType as any} x="5" y="1" size="6" color="#E69F00" strokeWidth="1"/>
            
            {/* 主体标签 */}
            <text x="20" y="8" fontSize="9" fontWeight="500" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
              {triple.subj}
            </text>
            
            {/* 谓词 */}
            <text x="90" y="8" fontSize="8" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
              {triple.pred}
            </text>
            
            {/* 箭头 */}
            <path d="M 82 4 L 88 4" stroke="#CBD5E1" strokeWidth="1"/>
            <polygon points="88,4 85,2 85,6" fill="#CBD5E1"/>
            
            {/* 客体图标 */}
            <circle cx="180" cy="4" r="6" fill="#FFF4E6" stroke="#E69F00" strokeWidth="1"/>
            <SVGIcon type={triple.objType as any} x="177" y="1" size="6" color="#E69F00" strokeWidth="1"/>
            
            {/* 客体标签 */}
            <text x="192" y="8" fontSize="9" fontWeight="500" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
              {triple.obj}
            </text>
          </g>
        ))}
      </g>
    </g>
  );

  /**
   * 2. 场景图可视化
   */
  const renderSceneGraph = () => (
    <g transform="translate(0, 224)">
      {/* 模块标题 */}
      <text x="0" y="0" fontSize="11" fontWeight="600" fill="#2C3E50" fontFamily="Monaco, Menlo, Consolas, monospace">
        场景图结构
      </text>
      <text x="0" y="14" fontSize="9" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">
        Scene Graph (Who-Where-What)
      </text>
      
      {/* 场景图容器 */}
      <rect x="0" y="24" width="300" height="196" rx="8"
            fill="#FFFFFF" stroke="#E69F00" strokeWidth="1.5"/>
      
      {/* 节点定义 */}
      <defs>
        <marker id="arrow-orange" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <polygon points="0,0 6,3 0,6" fill="#94A3B8"/>
        </marker>
      </defs>
      
      {/* 图结构 */}
      <g transform="translate(150, 130)">
        {/* 连接边 */}
        <g stroke="#94A3B8" strokeWidth="1.5" fill="none" markerEnd="url(#arrow-orange)">
          <path d="M -60 -30 L -20 -10"/>
          <path d="M 20 -10 L 50 10"/>
          <path d="M -60 -30 L -30 20"/>
        </g>
        
        {/* 边标签 */}
        <text x="-40" y="-25" fontSize="8" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">holds</text>
        <text x="35" y="-5" fontSize="8" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">on</text>
        <text x="-50" y="0" fontSize="8" fill="#64748B" fontFamily="Monaco, Menlo, Consolas, monospace">talks_to</text>
        
        {/* 节点 */}
        {/* Person A */}
        <g transform="translate(-60, -30)">
          <circle r="18" fill="#E8F4F8" stroke="#0072B2" strokeWidth="2"/>
          <SVGIcon type="users" x="-6" y="-6" size="12" color="#0072B2" strokeWidth="1.5"/>
          <text y="30" textAnchor="middle" fontSize="9" fontWeight="500" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
            Person_A
          </text>
        </g>
        
        {/* Cup */}
        <g transform="translate(-20, -10)">
          <circle r="14" fill="#FFF4E6" stroke="#E69F00" strokeWidth="2"/>
          <SVGIcon type="box" x="-5" y="-5" size="10" color="#E69F00" strokeWidth="1.5"/>
          <text y="24" textAnchor="middle" fontSize="9" fontWeight="500" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
            Cup
          </text>
        </g>
        
        {/* Table */}
        <g transform="translate(50, 10)">
          <circle r="16" fill="#FCF0F7" stroke="#CC79A7" strokeWidth="2"/>
          <SVGIcon type="box" x="-5" y="-5" size="10" color="#CC79A7" strokeWidth="1.5"/>
          <text y="28" textAnchor="middle" fontSize="9" fontWeight="500" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
            Table
          </text>
        </g>
        
        {/* Person B */}
        <g transform="translate(-30, 20)">
          <circle r="15" fill="#E8F4F8" stroke="#0072B2" strokeWidth="2"/>
          <SVGIcon type="users" x="-5" y="-5" size="10" color="#0072B2" strokeWidth="1.5"/>
          <text y="26" textAnchor="middle" fontSize="9" fontWeight="500" fill="#1E293B" fontFamily="Monaco, Menlo, Consolas, monospace">
            Person_B
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
      {renderTriples()}
      {renderSceneGraph()}
    </LayerContainer>
  );
};