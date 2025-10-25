/**
 * 高分辨率导出工具
 * 支持300dpi+的SVG和PNG导出
 */

export interface ExportOptions {
  format: 'svg' | 'png';
  scale?: number;  // 缩放比例，默认4倍（相当于300dpi）
  quality?: number;  // PNG质量 0-1
  filename?: string;  // 自定义文件名
}

/**
 * 高分辨率导出架构图
 */
export const exportHighResolution = async (
  svgElement: SVGElement | null,
  options: ExportOptions
): Promise<void> => {
  if (!svgElement) {
    console.error('SVG element not found');
    return;
  }

  const {
    format,
    scale = 4,  // 4倍分辨率，相当于300dpi
    quality = 1,
    filename = `visual-structured-memory-hr.${format}`
  } = options;

  try {
    if (format === 'svg') {
      await exportSVG(svgElement, scale, filename);
    } else if (format === 'png') {
      await exportPNG(svgElement, scale, quality, filename);
    }
  } catch (error) {
    console.error('Export failed:', error);
  }
};

/**
 * 导出高分辨率SVG
 */
const exportSVG = async (
  svgElement: SVGElement,
  scale: number,
  filename: string
): Promise<void> => {
  // 克隆SVG元素
  const clone = svgElement.cloneNode(true) as SVGElement;

  // 获取原始尺寸
  const originalWidth = parseFloat(svgElement.getAttribute('width') || '1280');
  const originalHeight = parseFloat(svgElement.getAttribute('height') || '800');

  // 设置高分辨率属性
  const hrWidth = originalWidth * scale;
  const hrHeight = originalHeight * scale;

  clone.setAttribute('width', hrWidth.toString());
  clone.setAttribute('height', hrHeight.toString());
  clone.setAttribute('viewBox', `0 0 ${originalWidth} ${originalHeight}`);

  // 添加高分辨率样式
  const style = document.createElement('style');
  style.textContent = `
    svg {
      font-size: calc(1em * ${scale});
    }
    text {
      font-size: calc(1em * ${scale});
    }
    line, path, rect, circle, ellipse, polygon {
      stroke-width: calc(1px * ${scale});
    }
    .hr-export {
      transform: scale(${scale});
      transform-origin: 0 0;
    }
  `;
  clone.insertBefore(style, clone.firstChild);

  // 包装内容以应用缩放
  const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  wrapper.setAttribute('class', 'hr-export');

  // 将所有子元素移动到wrapper中
  while (clone.childNodes.length > 1) {  // 保留style元素
    wrapper.appendChild(clone.childNodes[1]);
  }
  clone.appendChild(wrapper);

  // 序列化并下载
  const svgData = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgData], {
    type: 'image/svg+xml;charset=utf-8'
  });

  downloadBlob(svgBlob, filename);
};

/**
 * 导出高分辨率PNG
 */
const exportPNG = async (
  svgElement: SVGElement,
  scale: number,
  quality: number,
  filename: string
): Promise<void> => {
  // 创建Canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // 获取原始尺寸
  const originalWidth = parseFloat(svgElement.getAttribute('width') || '1280');
  const originalHeight = parseFloat(svgElement.getAttribute('height') || '800');

  // 设置高分辨率Canvas尺寸
  const hrWidth = Math.ceil(originalWidth * scale);
  const hrHeight = Math.ceil(originalHeight * scale);

  canvas.width = hrWidth;
  canvas.height = hrHeight;

  // 设置高质量渲染
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 设置白色背景
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, hrWidth, hrHeight);

  // 创建高分辨率SVG
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([svgData], {
    type: 'image/svg+xml;charset=utf-8'
  });
  const svgUrl = URL.createObjectURL(svgBlob);

  // 创建图片对象
  const img = new Image();

  return new Promise((resolve, reject) => {
    img.onload = () => {
      try {
        // 绘制高分辨率图片
        ctx.drawImage(img, 0, 0, hrWidth, hrHeight);

        // 转换为Blob并下载
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to create PNG blob'));
            return;
          }

          URL.revokeObjectURL(svgUrl);
          downloadBlob(blob, filename);
          resolve();
        }, 'image/png', quality);
      } catch (error) {
        URL.revokeObjectURL(svgUrl);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('Failed to load SVG image'));
    };

    img.src = svgUrl;
  });
};

/**
 * 下载Blob文件
 */
const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = filename;
  downloadLink.style.display = 'none';

  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);

  // 延迟释放URL，确保下载开始
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
};

/**
 * 获取SVG元素的安全包装函数
 */
export const getSVGElement = (selector?: string): SVGElement | null => {
  const svgSelector = selector || '#enhanced-architecture-svg svg, svg';
  const element = document.querySelector(svgSelector);
  return element as SVGElement | null;
};

/**
 * 快速导出预设
 */
export const quickExportPresets = {
  // 期刊投稿标准
  academic: {
    svg: { format: 'svg' as const, scale: 4, filename: 'visual-structured-memory-academic.svg' },
    png: { format: 'png' as const, scale: 4, quality: 1, filename: 'visual-structured-memory-academic.png' }
  },

  // 演示文稿标准
  presentation: {
    svg: { format: 'svg' as const, scale: 2, filename: 'visual-structured-memory-presentation.svg' },
    png: { format: 'png' as const, scale: 2, quality: 0.9, filename: 'visual-structured-memory-presentation.png' }
  },

  // 网页显示标准
  web: {
    svg: { format: 'svg' as const, scale: 1, filename: 'visual-structured-memory-web.svg' },
    png: { format: 'png' as const, scale: 1, quality: 0.8, filename: 'visual-structured-memory-web.png' }
  }
};