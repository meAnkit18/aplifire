;(function () {
  const DONE = 'data-amp-upload';
  function style(btn, text, disabled) {
    btn.textContent = text;
    btn.disabled = !!disabled;
  }
  function addButton(article, url) {
    article.setAttribute(DONE, 'pending');
    const btn = document.createElement('button');
    btn.setAttribute('type', 'button');
    btn.style.cssText = 'position:absolute;top:8px;right:8px;z-index:9999;padding:6px 10px;border:0;border-radius:8px;background:#5b6cff;color:#fff;font-weight:700;cursor:pointer;';
    style(btn, 'Upload', false);
    btn.onclick = async () => {
      if (article.getAttribute(DONE) === 'busy' || article.getAttribute(DONE) === 'done') return;
      article.setAttribute(DONE, 'busy');
      style(btn, '…', true);
      let res;
      try {
        res = await chrome.runtime.sendMessage({ type: 'AMP_UPLOAD', url });
      } catch (e) { res = { ok: false, error: String((e && e.message) || e) }; }
      if (res && res.ok) {
        article.setAttribute(DONE, 'done');
        style(btn, '✓ ' + res.channelCount + ' channels', true);
      } else {
        article.setAttribute(DONE, 'pending');
        btn.title = (res && res.error) || 'failed';
        style(btn, '⚠ retry', false);
      }
    };
    article.appendChild(btn);
  }
  function scan() {
    document.querySelectorAll('article:not([' + DONE + '])').forEach((a) => {
      let url = null;
      try { url = globalThis.AmplifyApi.findReelUrl(a); } catch (e) { url = null; }
      if (url) addButton(a, url);
      else a.setAttribute(DONE, 'skip');
    });
  }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
