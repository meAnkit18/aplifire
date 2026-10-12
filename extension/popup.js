;(function () {
  const $ = (id) => document.getElementById(id);
  async function refresh() {
    const got = await chrome.storage.local.get(['token', 'email']);
    const logged = !!got.token;
    $('login').style.display = logged ? 'none' : '';
    $('status').style.display = logged ? '' : 'none';
    if (logged) $('who').textContent = got.email || '';
  }
  $('go').onclick = async () => {
    $('msg').textContent = 'Logging in…';
    try {
      const token = await globalThis.AmplifyApi.login($('email').value.trim(), $('password').value);
      await chrome.storage.local.set({ token, email: $('email').value.trim() });
      $('password').value = '';
      $('msg').textContent = '';
      refresh();
    } catch (e) { $('msg').textContent = String((e && e.message) || e); }
  };
  $('out').onclick = async () => { await chrome.storage.local.remove(['token', 'email']); refresh(); };
  refresh();
})();
