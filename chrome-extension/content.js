(function() {
  // 防止重复注入
  if (window.__devSyncEnabled) return;
  window.__devSyncEnabled = true;

  // WebSocket 连接
  const WS_URL = 'ws://localhost:8080';
  let ws = null;

  function connectWebSocket() {
    try {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => console.log('[DevSync] WebSocket 已连接');
      ws.onclose = () => setTimeout(connectWebSocket, 3000);
      ws.onerror = () => {};
    } catch (e) {}
  }
  connectWebSocket();

  function getSimpleSelector(el) {
    if (el.id) return '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\s+/).filter(c => !c.startsWith('ds-') && !c.startsWith('dev-sync')).join('.');
      if (cls) return el.tagName.toLowerCase() + '.' + cls;
    }
    return el.tagName.toLowerCase();
  }

  // ========== 拖拽功能 ==========
  const draggableElements = new Set();
  let dragState = { isDragging: false, element: null, startX: 0, startY: 0, initialLeft: 0, initialTop: 0 };

  function enableDrag(el) {
    if (draggableElements.has(el)) return;
    draggableElements.add(el);
    el.style.cursor = 'move';
    if (!el.style.position || el.style.position === 'static') {
      el.style.position = 'relative';
    }
    el.setAttribute('data-draggable', '1');
  }

  function handleDragMouseDown(e) {
    if (e.target.classList.contains('dev-sync-resize-handle')) return;
    if (e.target.closest('#dev-sync-panel')) return;
    const el = e.target.closest('[data-draggable]');
    if (!el) return;
    e.preventDefault();
    dragState.isDragging = true;
    dragState.element = el;
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    const cs = getComputedStyle(el);
    dragState.initialLeft = parseInt(cs.left) || 0;
    dragState.initialTop = parseInt(cs.top) || 0;
    el.style.opacity = '0.8';
    el.style.zIndex = '10000';
  }

  function handleDragMouseMove(e) {
    if (!dragState.isDragging || !dragState.element) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    dragState.element.style.left = (dragState.initialLeft + dx) + 'px';
    dragState.element.style.top = (dragState.initialTop + dy) + 'px';
  }

  function handleDragMouseUp() {
    if (!dragState.isDragging || !dragState.element) return;
    const el = dragState.element;
    el.style.opacity = '1';
    el.style.zIndex = '';
    
    // 发送到服务器
    const selector = getSimpleSelector(el);
    const payload = { 
      type: 'drag', 
      selector, 
      position: { left: el.style.left, top: el.style.top },
      filePath: window.location.href
    };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      console.log('[DevSync] 位置已同步:', selector);
    }
    
    dragState.isDragging = false;
    dragState.element = null;
  }

  document.addEventListener('mousedown', handleDragMouseDown);
  document.addEventListener('mousemove', handleDragMouseMove);
  document.addEventListener('mouseup', handleDragMouseUp);

  // ========== 调整大小功能 ==========
  const resizableElements = new Set();
  let resizeState = { isResizing: false, element: null, startX: 0, startY: 0, initialWidth: 0, initialHeight: 0 };

  function enableResize(el) {
    if (resizableElements.has(el)) return;
    resizableElements.add(el);
    if (!el.style.position || el.style.position === 'static') {
      el.style.position = 'relative';
    }
    el.setAttribute('data-resizable', '1');
    
    // 添加边框提示
    el.style.outline = '2px solid #3182ce';
    el.style.outlineOffset = '2px';
    
    // 设置初始宽高（如果没有）
    const cs = getComputedStyle(el);
    if (!el.style.width) el.style.width = cs.width;
    if (!el.style.height) el.style.height = cs.height;
    
    // 创建右下角缩放手柄
    const handle = document.createElement('div');
    handle.className = 'dev-sync-resize-handle';
    handle.style.cssText = 'position:absolute;right:-6px;bottom:-6px;width:12px;height:12px;background:#3182ce;border-radius:50%;cursor:se-resize;z-index:10001;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3);';
    handle.addEventListener('mousedown', handleResizeStart);
    el.appendChild(handle);
    
    console.log('[DevSync] 已启用缩放:', getSimpleSelector(el));
  }

  function handleResizeStart(e) {
    e.stopPropagation();
    e.preventDefault();
    const el = e.target.parentElement;
    resizeState.isResizing = true;
    resizeState.element = el;
    resizeState.startX = e.clientX;
    resizeState.startY = e.clientY;
    const cs = getComputedStyle(el);
    resizeState.initialWidth = parseInt(cs.width) || el.offsetWidth;
    resizeState.initialHeight = parseInt(cs.height) || el.offsetHeight;
    el.style.opacity = '0.8';
  }

  function handleResizeMove(e) {
    if (!resizeState.isResizing || !resizeState.element) return;
    const dx = e.clientX - resizeState.startX;
    const dy = e.clientY - resizeState.startY;
    resizeState.element.style.width = Math.max(20, resizeState.initialWidth + dx) + 'px';
    resizeState.element.style.height = Math.max(20, resizeState.initialHeight + dy) + 'px';
  }

  function handleResizeEnd() {
    if (!resizeState.isResizing || !resizeState.element) return;
    const el = resizeState.element;
    el.style.opacity = '1';
    
    const selector = getSimpleSelector(el);
    const payload = { 
      type: 'resize', 
      selector, 
      size: { width: el.style.width, height: el.style.height },
      filePath: window.location.href
    };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      console.log('[DevSync] 大小已同步:', selector);
    }
    
    resizeState.isResizing = false;
    resizeState.element = null;
  }

  document.addEventListener('mousemove', handleResizeMove);
  document.addEventListener('mouseup', handleResizeEnd);

  // ========== 控制面板 ==========
  let isSelectMode = false;
  let selectModeAction = null;

  function createPanel() {
    if (document.getElementById('dev-sync-panel')) return;
    
    const panel = document.createElement('div');
    panel.id = 'dev-sync-panel';
    panel.innerHTML = `
      <div class="ds-header">
        <span>🔧 DevSync</span>
        <button class="ds-toggle">−</button>
      </div>
      <div class="ds-body">
        <div class="ds-section">
          <div class="ds-title">点击元素启用</div>
          <button class="ds-btn" data-action="drag">📍 启用拖拽</button>
          <button class="ds-btn" data-action="resize">↔️ 启用缩放</button>
        </div>
        <div class="ds-section">
          <div class="ds-title">已启用</div>
          <div class="ds-list" id="ds-enabled-list">
            <div class="ds-empty">暂无</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // 折叠
    const toggle = panel.querySelector('.ds-toggle');
    const body = panel.querySelector('.ds-body');
    toggle.onclick = () => {
      body.classList.toggle('collapsed');
      toggle.textContent = body.classList.contains('collapsed') ? '+' : '−';
    };

    // 面板拖拽
    let panelDrag = { active: false, x: 0, y: 0 };
    const header = panel.querySelector('.ds-header');
    header.addEventListener('mousedown', (e) => {
      if (e.target === toggle) return;
      panelDrag.active = true;
      panelDrag.x = e.clientX - panel.offsetLeft;
      panelDrag.y = e.clientY - panel.offsetTop;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!panelDrag.active) return;
      panel.style.left = (e.clientX - panelDrag.x) + 'px';
      panel.style.top = (e.clientY - panelDrag.y) + 'px';
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { panelDrag.active = false; });

    // 按钮事件
    panel.querySelectorAll('.ds-btn[data-action]').forEach(btn => {
      btn.onclick = () => startSelectMode(btn.dataset.action, btn);
    });
  }

  function startSelectMode(action, btn) {
    if (isSelectMode) return;
    isSelectMode = true;
    selectModeAction = action;
    btn.classList.add('active');

    const overlay = document.createElement('div');
    overlay.className = 'ds-select-overlay';
    document.body.appendChild(overlay);

    let hoveredEl = null;

    const handleMove = (e) => {
      // 临时隐藏遮罩层以获取下面的元素
      overlay.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      overlay.style.pointerEvents = 'auto';
      
      if (el && el !== overlay && !el.closest('#dev-sync-panel') && !el.classList.contains('ds-select-overlay')) {
        if (hoveredEl && hoveredEl !== el) hoveredEl.classList.remove('ds-highlight');
        hoveredEl = el;
        hoveredEl.classList.add('ds-highlight');
      }
    };

    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // 获取点击位置下的真实元素
      overlay.style.pointerEvents = 'none';
      const clickedEl = document.elementFromPoint(e.clientX, e.clientY);
      overlay.style.pointerEvents = 'auto';
      
      if (clickedEl && !clickedEl.closest('#dev-sync-panel')) {
        clickedEl.classList.remove('ds-highlight');
        applyAction(clickedEl, selectModeAction);
      }

      // 清理高亮
      if (hoveredEl) hoveredEl.classList.remove('ds-highlight');
      
      overlay.remove();
      btn.classList.remove('active');
      isSelectMode = false;
      selectModeAction = null;
    };

    overlay.addEventListener('mousemove', handleMove);
    overlay.addEventListener('click', handleClick);
  }

  function applyAction(el, action) {
    const selector = getSimpleSelector(el);
    if (action === 'drag') {
      enableDrag(el);
      addToList(selector, 'drag');
    } else if (action === 'resize') {
      enableResize(el);
      addToList(selector, 'resize');
    }
  }

  function addToList(selector, type) {
    const list = document.getElementById('ds-enabled-list');
    if (!list) return;
    const empty = list.querySelector('.ds-empty');
    if (empty) empty.remove();

    if (list.querySelector(`[data-selector="${selector}"][data-type="${type}"]`)) return;

    const item = document.createElement('div');
    item.className = 'ds-list-item';
    item.dataset.selector = selector;
    item.dataset.type = type;
    item.innerHTML = `
      <span>${selector}<span class="ds-tag ${type}">${type === 'drag' ? '拖拽' : '缩放'}</span></span>
      <button class="ds-remove">×</button>
    `;

    item.querySelector('.ds-remove').onclick = () => {
      const el = document.querySelector(selector);
      if (el) {
        if (type === 'drag') {
          draggableElements.delete(el);
          el.style.cursor = '';
          el.removeAttribute('data-draggable');
        } else {
          resizableElements.delete(el);
          el.removeAttribute('data-resizable');
          el.style.outline = '';
          el.style.outlineOffset = '';
          el.querySelector('.dev-sync-resize-handle')?.remove();
        }
      }
      item.remove();
      if (!list.querySelector('.ds-list-item')) {
        list.innerHTML = '<div class="ds-empty">暂无</div>';
      }
    };

    list.appendChild(item);
  }

  createPanel();
  console.log('[DevSync] 插件已启用');
})();
