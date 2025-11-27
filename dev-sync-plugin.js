// dev-sync-plugin.js
(function () {
  const WS_URL = 'ws://localhost:8080';
  const CSS_POLL_INTERVAL = 500; // 每 500ms 检查一次 CSS 规则变化

  let ws = null;

  function connectWebSocket() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[DevSync] WebSocket 已连接:', WS_URL);
    };

    ws.onclose = () => {
      console.log('[DevSync] WebSocket 已关闭，稍后重连...');
      setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = (err) => {
      console.error('[DevSync] WebSocket 错误:', err);
    };
  }

  connectWebSocket();

  // 简单生成唯一 CSS 选择器（示例版，只处理有 id 的元素）
  function getSimpleSelector(el) {
    if (el.id) {
      return `#${el.id}`;
    }
    const tag = el.tagName.toLowerCase();
    const cls = (el.className || '')
      .toString()
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((c) => '.' + c)
      .join('');
    return `${tag}${cls}`;
  }

  // ========== 1. 行内 style 属性监听（原有功能）==========
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.type === 'attributes' && m.attributeName === 'style') {
        const el = m.target;
        if (!el.hasAttribute('data-dev-sync')) return;

        const selector = getSimpleSelector(el);
        const styleText = el.getAttribute('style') || '';

        const payload = {
          type: 'inline',
          selector,
          style: styleText
        };

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(payload));
          console.log('[DevSync] 已发送行内样式更新:', payload);
        }
      }
    });
  });

  observer.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ['style']
  });

  // ========== 2. CSS 规则监听（新增功能）==========
  // 存储上一次的 CSS 规则快照，用于对比变化
  let lastCssSnapshot = {};
  // 需要监听的选择器列表
  let watchedSelectors = new Set();

  // 获取页面内所有 <style> 标签里的 CSS 规则
  function getCssRulesSnapshot() {
    const snapshot = {};
    try {
      for (const sheet of document.styleSheets) {
        // 只处理内联 <style> 标签（同源）
        if (!sheet.href) {
          try {
            for (const rule of sheet.cssRules) {
              if (rule.type === CSSRule.STYLE_RULE) {
                const selector = rule.selectorText;
                // 只关注我们监听的选择器
                if (watchedSelectors.has(selector)) {
                  snapshot[selector] = rule.style.cssText;
                }
              }
            }
          } catch (e) {
            // 跨域样式表会报错，忽略
          }
        }
      }
    } catch (e) {
      console.error('[DevSync] 读取 styleSheets 出错:', e);
    }
    return snapshot;
  }

  // 对比快照，找出变化的规则
  function detectCssChanges() {
    const currentSnapshot = getCssRulesSnapshot();

    for (const selector of watchedSelectors) {
      const oldStyle = lastCssSnapshot[selector] || '';
      const newStyle = currentSnapshot[selector] || '';

      if (oldStyle !== newStyle && newStyle) {
        // 发送变化
        const payload = {
          type: 'cssRule',
          selector,
          style: newStyle
        };

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(payload));
          console.log('[DevSync] 已发送 CSS 规则更新:', payload);
        }
      }
    }

    lastCssSnapshot = currentSnapshot;
  }

  // 轮询定时器（不再自动启动，改为点击按钮后触发一次检测）
  let pollTimer = null;

  // ========== 3. 创建浮动按钮 ==========
  function createSyncButton() {
    const btn = document.createElement('button');
    btn.id = 'dev-sync-btn';
    btn.textContent = '✓ 完成修改';
    btn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      padding: 12px 20px;
      background: #4caf50;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: all 0.2s;
    `;

    btn.onmouseenter = () => {
      btn.style.background = '#43a047';
      btn.style.transform = 'scale(1.05)';
    };
    btn.onmouseleave = () => {
      btn.style.background = '#4caf50';
      btn.style.transform = 'scale(1)';
    };

    btn.onclick = () => {
      console.log('[DevSync] 点击"完成修改"，开始检测变化...');
      detectCssChanges();
      // 显示反馈
      btn.textContent = '✓ 已同步';
      btn.style.background = '#2196f3';
      setTimeout(() => {
        btn.textContent = '✓ 完成修改';
        btn.style.background = '#4caf50';
      }, 1500);
    };

    document.body.appendChild(btn);
    console.log('[DevSync] 浮动按钮已创建，修改完成后点击"完成修改"按钮同步到本地');
  }

  // 页面加载完成后创建按钮
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createSyncButton);
  } else {
    createSyncButton();
  }

  // ========== 对外暴露接口 ==========
  window.DevSync = {
    /**
     * 启用行内样式同步（原有功能）
     * @param {Element|string} target - DOM 元素或 CSS 选择器
     */
    enable(target) {
      let el = target;
      if (typeof target === 'string') {
        el = document.querySelector(target);
      }
      if (!el) {
        console.warn('[DevSync] 找不到元素:', target);
        return;
      }
      el.setAttribute('data-dev-sync', '1');
      console.log('[DevSync] 已启用行内样式同步:', el);
    },

    /**
     * 启用 CSS 规则同步（新增功能）
     * @param {string} selector - CSS 选择器，例如 '#box' 或 '.my-class'
     */
    watchCss(selector) {
      if (!selector || typeof selector !== 'string') {
        console.warn('[DevSync] watchCss 需要传入有效的选择器字符串');
        return;
      }
      watchedSelectors.add(selector);
      // 立即记录当前快照
      lastCssSnapshot = getCssRulesSnapshot();
      console.log('[DevSync] 已启用 CSS 规则监听:', selector);
    },

    /**
     * 停止监听某个 CSS 规则
     * @param {string} selector
     */
    unwatchCss(selector) {
      watchedSelectors.delete(selector);
      console.log('[DevSync] 已停止 CSS 规则监听:', selector);
    }
  };

  console.log('[DevSync] 插件已加载。');
  console.log('  - DevSync.enable("#id") 启用行内样式同步');
  console.log('  - DevSync.watchCss("#id") 启用 CSS 规则同步');
})();