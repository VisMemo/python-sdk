/**
 * SVG导出工具
 * 提供纯矢量格式的SVG文件导出功能
 */

/**
 * 导出SVG为文件
 * @param svgElement - SVG DOM元素
 * @param filename - 导出文件名
 */
export const exportSVGAsFile = (svgElement: SVGSVGElement, filename: string = 'architecture-diagram.svg') => {
  // 克隆SVG元素，避免影响页面显示
  const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
  
  // 移除可能导致栅格化的属性
  clonedSvg.removeAttribute('class');
  
  // 设置独立的命名空间和版本
  clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clonedSvg.setAttribute('version', '1.1');
  
  // 内联样式（确保字体等样式被保留）
  inlineStyles(clonedSvg);
  
  // 序列化SVG
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(clonedSvg);
  
  // 添加XML声明
  svgString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + svgString;
  
  // 创建Blob并下载
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // 清理
  URL.revokeObjectURL(url);
};

/**
 * 内联样式到SVG元素
 * 确保导出的SVG包含所有必要的样式信息
 */
const inlineStyles = (svgElement: SVGSVGElement) => {
  // 获取所有text元素
  const textElements = svgElement.querySelectorAll('text');
  textElements.forEach(text => {
    // 确保字体属性被内联
    const fontFamily = text.getAttribute('font-family') || 'Monaco, Menlo, Consolas, monospace';
    const fontSize = text.getAttribute('font-size') || '12';
    const fontWeight = text.getAttribute('font-weight') || 'normal';
    const fill = text.getAttribute('fill') || '#000000';
    
    text.setAttribute('font-family', fontFamily);
    text.setAttribute('font-size', fontSize);
    text.setAttribute('font-weight', fontWeight);
    text.setAttribute('fill', fill);
  });
  
  // 确保所有路径和形状都有fill/stroke属性
  const shapes = svgElement.querySelectorAll('rect, circle, path, line, polyline, polygon');
  shapes.forEach(shape => {
    if (!shape.getAttribute('fill') && !shape.getAttribute('stroke')) {
      shape.setAttribute('fill', 'none');
    }
  });
};

/**
 * 复制SVG到剪贴板
 */
export const copySVGToClipboard = async (svgElement: SVGSVGElement) => {
  const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
  clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clonedSvg);
  
  try {
    await navigator.clipboard.writeText(svgString);
    return true;
  } catch (err) {
    console.error('Failed to copy SVG:', err);
    return false;
  }
};

/**
 * 导出为PNG（高分辨率）
 * 注意：这会产生位图，但可用于某些特殊场景
 */
export const exportSVGAsPNG = (svgElement: SVGSVGElement, filename: string = 'architecture-diagram.png', scale: number = 2) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const img = new Image();
  
  const bbox = svgElement.getBoundingClientRect();
  canvas.width = bbox.width * scale;
  canvas.height = bbox.height * scale;
  
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  };
  
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
};
