export function pickOAuthUrl(res) {
  if (res?.url) return res.url;
  throw new Error(res?.error || 'Google sign-in is not configured on the server');
}
