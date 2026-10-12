;(function () {
  const BTN_ID = 'amp-upload-reel-btn';
  let busy = false;
  let doneFor = '';
  function currentUrl() {
    try { return globalThis.AmplifyApi.findReelUrl(location.href); } catch (e) { return null; }
  }
  function ensureButton() {
    let btn = document.getElementById(BTN_ID);
    if (btn) return btn;
    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.setAttribute('type', 'button');
    btn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:999999;padding:10px 16px;border:0;border-radius:10px;background:#5b6cff;color:#fff;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.4);';
    btn.onclick = async () => {
      if (busy) return;
      const url = currentUrl();
      if (!url) { flash(btn, 'open a reel first'); return; }
      busy = true;
      const idle = 'Upload reel';
      btn.disabled = true;
      btn.textContent = '…';
      let res;
      try {
        res = await chrome.runtime.sendMessage({ type: 'AMP_UPLOAD', url });
      } catch (e) { res = { ok: false, error: String((e && e.message) || e) }; }
      busy = false;
      btn.disabled = false;
      if (res && res.ok) {
        doneFor = url;
        btn.textContent = '✓ ' + res.channelCount + ' channels';
      } else {
        btn.title = (res && res.error) || 'failed';
        flash(btn, '⚠ retry');
      }
      function flash(b, t) { b.textContent = t; setTimeout(() => { if (!busy) b.textContent = idle; }, 4000); }
    };
    document.documentElement.appendChild(btn);
    return btn;
  }
  function tick() {
    const btn = ensureButton();
    const url = currentUrl();
    if (!busy && url !== doneFor && btn.textContent !== 'Upload reel' && !btn.textContent.startsWith('⚠')) {
      btn.textContent = 'Upload reel';
      btn.title = '';
    }
    if (!busy && !url && btn.textContent === 'Upload reel') {
      btn.title = 'open a reel first';
    }
  }
  new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 2000);
  tick();
})();
