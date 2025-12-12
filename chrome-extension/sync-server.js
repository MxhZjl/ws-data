/**
 * DevSync 通用同步服务器
 * 可以同步任意本地前端项目的修改
 */
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log('═══════════════════════════════════════════');
  console.log('  🔧 DevSync 同步服务器已启动');
  console.log('  📡 WebSocket: ws://localhost:' + PORT);
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('使用方法:');
  console.log('  1. 保持此窗口运行');
  console.log('  2. 在 Chrome 中打开本地 HTML 文件');
  console.log('  3. 点击 DevSync 插件启用编辑模式');
  console.log('  4. 拖拽/缩放元素，修改会自动同步到文件');
  console.log('');
});

wss.on('connection', (ws) => {
  console.log('[连接] 新的浏览器连接');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      const { type, selector, position, size, filePath } = data;

      if (!filePath) {
        console.log('[警告] 未提供文件路径，无法同步');
        return;
      }

      // 将 file:// URL 转换为本地路径
      let localPath = filePath;
      if (filePath.startsWith('file:///')) {
        localPath = decodeURIComponent(filePath.replace('file:///', ''));
        // Windows 路径处理
        if (process.platform === 'win32' && !localPath.match(/^[A-Za-z]:/)) {
          localPath = '/' + localPath;
        }
      } else if (filePath.startsWith('file://')) {
        localPath = decodeURIComponent(filePath.replace('file://', ''));
      }

      console.log(`[同步] ${type} - ${selector}`);
      console.log(`       文件: ${localPath}`);

      if (!fs.existsSync(localPath)) {
        console.log('[错误] 文件不存在:', localPath);
        return;
      }

      let html = fs.readFileSync(localPath, 'utf8');
      let updated = false;

      if (type === 'drag' && position) {
        html = updateElementStyle(html, selector, {
          position: 'relative',
          left: position.left,
          top: position.top
        });
        updated = true;
        console.log(`       位置: left=${position.left}, top=${position.top}`);
      } else if (type === 'resize' && size) {
        html = updateElementStyle(html, selector, {
          width: size.width,
          height: size.height
        });
        updated = true;
        console.log(`       大小: ${size.width} x ${size.height}`);
      }

      if (updated) {
        fs.writeFileSync(localPath, html, 'utf8');
        console.log('       ✅ 已同步到文件');
      }
    } catch (e) {
      console.error('[错误]', e.message);
    }
  });

  ws.on('close', () => {
    console.log('[断开] 浏览器连接已断开');
  });
});

/**
 * 更新元素的 style 属性
 */
function updateElementStyle(html, selector, styles) {
  // 支持 #id 选择器
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    const pattern = new RegExp(
      '(<[^>]*\\bid=["\']' + escapeRegex(id) + '["\'][^>]*?)(?:\\s+style=["\']([^"\']*)["\'])?([^>]*>)',
      'i'
    );

    return html.replace(pattern, (match, before, existingStyle, after) => {
      let styleObj = parseStyle(existingStyle || '');
      Object.assign(styleObj, styles);
      const newStyle = stringifyStyle(styleObj);
      return before + ' style="' + newStyle + '"' + after;
    });
  }

  // 支持标签名选择器（只匹配第一个）
  const tagMatch = selector.match(/^([a-z]+)/i);
  if (tagMatch) {
    const tag = tagMatch[1];
    const pattern = new RegExp(
      '(<' + tag + '\\b[^>]*?)(?:\\s+style=["\']([^"\']*)["\'])?([^>]*>)',
      'i'
    );

    return html.replace(pattern, (match, before, existingStyle, after) => {
      let styleObj = parseStyle(existingStyle || '');
      Object.assign(styleObj, styles);
      const newStyle = stringifyStyle(styleObj);
      return before + ' style="' + newStyle + '"' + after;
    });
  }

  return html;
}

function parseStyle(styleStr) {
  const obj = {};
  styleStr.split(';').forEach(part => {
    const [key, value] = part.split(':').map(s => s?.trim());
    if (key && value) obj[key] = value;
  });
  return obj;
}

function stringifyStyle(obj) {
  return Object.entries(obj)
    .filter(([k, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ') + ';';
}

function escapeRegex(str) {
  return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}
