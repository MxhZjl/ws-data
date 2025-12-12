// server.js
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// 输出 CSS 文件路径
const CSS_OUTPUT = path.join(__dirname, 'synced-styles.css');

// 简单内存缓存，避免重复写入
let rules = {}; // key: selector, value: styleText

// 从已有文件加载（可选）
if (fs.existsSync(CSS_OUTPUT)) {
  console.log('已有 CSS 文件:', CSS_OUTPUT);
}

// 启动 WebSocket 服务器
const wss = new WebSocket.Server({ port: 8080 }, () => {
  console.log('WebSocket 服务已启动 ws://localhost:8080');
});

// 接收前端发来的修改
wss.on('connection', (ws) => {
  console.log('前端已连接');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      const { type, selector, style } = data;

      if (!selector) return;
      if (type !== 'drag' && type !== 'resize' && !style) return;

      console.log('收到更新:', type, selector, style);

      // 更新内存中的规则
      rules[selector] = style;

      if (type === 'cssRule') {
        // CSS 规则变化 -> 修改 <style> 标签里的规则
        updateCssRuleInHtml(selector, style);
      } else if (type === 'drag') {
        // 拖拽位置变化 -> 修改元素的 style 属性
        const { position } = data;
        if (position) {
          updateDragPositionInHtml(selector, position);
        }
      } else if (type === 'resize') {
        // 调整大小 -> 修改元素的 style 属性
        const { size } = data;
        if (size) {
          updateResizeInHtml(selector, size);
        }
      } else {
        // 行内样式变化 -> 修改元素的 style 属性
        updateInlineStyleInHtml(selector, style);
      }
    } catch (e) {
      console.error('解析消息出错:', e);
    }
  });
});

function updateCssRuleInHtml(selector, style) {
  const htmlPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('index.html 不存在，无法同步样式');
    return;
  }

  let html = fs.readFileSync(htmlPath, 'utf8');

  // 转义选择器用于正则
  const escapedSelector = selector.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

  // 匹配 <style> 标签里的对应规则，例如：#box { ... }
  // 正则：选择器 + 空白 + { + 内容 + }
  const rulePattern = new RegExp(
    '(' + escapedSelector + '\\s*\\{)([^}]*)(\\})',
    'g'
  );

  let found = false;
  const replaced = html.replace(rulePattern, (match, open, oldStyle, close) => {
    found = true;
    // 格式化新样式：每个属性一行
    const formattedStyle = '\n      ' + style.split(';').filter(s => s.trim()).join(';\n      ') + ';\n    ';
    return open + formattedStyle + close;
  });

  if (!found) {
    console.warn('未在 index.html 的 <style> 中找到规则:', selector);
    return;
  }

  fs.writeFileSync(htmlPath, replaced, 'utf8');
  console.log('已更新 index.html 中 CSS 规则:', selector);
}

function updateInlineStyleInHtml(selector, style) {
  const htmlPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('index.html 不存在，无法同步样式');
    return;
  }

  const ori = fs.readFileSync(htmlPath, 'utf8');

  // 目前仅支持 #id 选择器
  if (!selector.startsWith('#')) {
    console.warn('当前只支持 #id 选择器，同步被忽略:', selector);
    return;
  }

  const id = selector.slice(1);

  // 匹配包含该 id 的起始标签，并更新或添加 style 属性
  const pattern = new RegExp(
    '(<' +
      '[^>]*\\bid="' +
      id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') +
      '"' +
      '[^>]*)(style="[^"]*")?([^>]*>)',
    'i'
  );

  const replaced = ori.replace(pattern, (match, before, styleAttr, after) => {
    const newStyleAttr = 'style="' + style + '"';
    if (styleAttr) {
      return before + ' ' + newStyleAttr + after;
    }
    return before + ' ' + newStyleAttr + after;
  });

  if (replaced === ori) {
    console.warn('未在 index.html 中找到匹配的元素 id:', id);
    return;
  }

  fs.writeFileSync(htmlPath, replaced, 'utf8');
  console.log('已更新 index.html 中元素', selector, '的 style');
}

// 更新拖拽位置到 HTML
function updateDragPositionInHtml(selector, position) {
  const htmlPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('index.html 不存在，无法同步位置');
    return;
  }

  // 目前仅支持 #id 选择器
  if (!selector.startsWith('#')) {
    console.warn('当前只支持 #id 选择器，同步被忽略:', selector);
    return;
  }

  const id = selector.slice(1);
  let html = fs.readFileSync(htmlPath, 'utf8');

  const { left, top } = position;
  const positionStyles = `position: relative; left: ${left}; top: ${top};`;

  // 匹配包含该 id 的起始标签，捕获所有 style 属性
  const pattern = new RegExp(
    '(<[^>]*\\bid="' +
      id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') +
      '")((?:\\s+style="[^"]*")*)(\\s*[^>]*>)',
    'i'
  );
  
  const replaced = html.replace(pattern, (match, beforeId, allStyles, afterStyles) => {
    // 直接用新的 style 替换所有旧的 style 属性
    return beforeId + ` style="${positionStyles}"` + afterStyles;
  });

  if (replaced === html) {
    console.warn('未在 index.html 中找到匹配的元素 id:', id);
    return;
  }

  fs.writeFileSync(htmlPath, replaced, 'utf8');
  console.log('已更新 index.html 中元素', selector, '的位置:', position);
}

// 更新元素大小到 HTML
function updateResizeInHtml(selector, size) {
  const htmlPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('index.html 不存在，无法同步大小');
    return;
  }

  if (!selector.startsWith('#')) {
    console.warn('当前只支持 #id 选择器，同步被忽略:', selector);
    return;
  }

  const id = selector.slice(1);
  let html = fs.readFileSync(htmlPath, 'utf8');

  const { width, height } = size;

  // 匹配包含该 id 的起始标签
  const pattern = new RegExp(
    '(<[^>]*\\bid="' +
      id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') +
      '")((?:\\s+style="[^"]*")*)(\\s*[^>]*>)',
    'i'
  );

  const replaced = html.replace(pattern, (match, beforeId, allStyles, afterStyles) => {
    // 提取现有样式中的非 width/height 属性
    let existingStyle = '';
    if (allStyles) {
      const styleMatch = allStyles.match(/style="([^"]*)"/);
      if (styleMatch) {
        existingStyle = styleMatch[1]
          .replace(/width\s*:\s*[^;]+;?/gi, '')
          .replace(/height\s*:\s*[^;]+;?/gi, '')
          .trim();
      }
    }
    
    const sizeStyles = `width: ${width}; height: ${height};`;
    const newStyle = existingStyle ? `${sizeStyles} ${existingStyle}` : sizeStyles;
    
    return beforeId + ` style="${newStyle}"` + afterStyles;
  });

  if (replaced === html) {
    console.warn('未在 index.html 中找到匹配的元素 id:', id);
    return;
  }

  fs.writeFileSync(htmlPath, replaced, 'utf8');
  console.log('已更新 index.html 中元素', selector, '的大小:', size);
}