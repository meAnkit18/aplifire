importScripts('api.js');
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'AMP_UPLOAD') return;
  (async () => {
    const got = await chrome.storage.local.get('token');
    if (!got.token) return { ok: false, error: 'not logged in — open the extension popup and log in' };
    try {
      const r = await globalThis.AmplifyApi.uploadReel(got.token, msg.url);
      return { ok: true, videoId: r.videoId, channelCount: r.channelCount };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  })().then(sendResponse);
  return true;
});
