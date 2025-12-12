document.getElementById('inject').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['content.css']
  });
  window.close();
};

document.getElementById('disable').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const panel = document.getElementById('dev-sync-panel');
      if (panel) panel.remove();
      document.querySelectorAll('[data-draggable]').forEach(el => {
        el.removeAttribute('data-draggable');
        el.style.cursor = '';
      });
      document.querySelectorAll('[data-resizable]').forEach(el => {
        el.removeAttribute('data-resizable');
        el.querySelector('.dev-sync-resize-handle')?.remove();
      });
      document.querySelectorAll('.ds-select-overlay, .ds-highlight').forEach(el => el.remove());
      window.__devSyncEnabled = false;
    }
  });
  window.close();
};
