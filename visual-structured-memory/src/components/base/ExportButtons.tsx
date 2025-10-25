import React, { useRef } from 'react';
import { Download, Copy } from 'lucide-react';
import { exportSVGAsFile, copySVGToClipboard } from '../../utils/exportSVG';

interface ExportButtonsProps {
  svgRef: React.RefObject<SVGSVGElement>;
}

/**
 * SVG导出按钮组件
 * 提供下载和复制功能
 */
export const ExportButtons: React.FC<ExportButtonsProps> = ({ svgRef }) => {
  const [copied, setCopied] = React.useState(false);

  const handleDownload = () => {
    if (svgRef.current) {
      exportSVGAsFile(svgRef.current, 'visual-structured-memory.svg');
    }
  };

  const handleCopy = async () => {
    if (svgRef.current) {
      const success = await copySVGToClipboard(svgRef.current);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <div className="flex gap-2 mb-4">
      <button
        onClick={handleDownload}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Download size={16} />
        <span>下载 SVG 矢量图</span>
      </button>
      
      <button
        onClick={handleCopy}
        className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
      >
        <Copy size={16} />
        <span>{copied ? '已复制！' : '复制 SVG 代码'}</span>
      </button>
      
      <div className="flex items-center text-sm text-gray-600 ml-4">
        <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
        <span>纯矢量格式，无限放大不失真</span>
      </div>
    </div>
  );
};
