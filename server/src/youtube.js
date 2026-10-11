import { google } from 'googleapis';
export function oauthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}
export function oauthUrl() {
  return oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'] });
}
export function authedYoutube(refreshToken) {
  const o = oauthClient(); o.setCredentials({ refresh_token: refreshToken });
  return google.youtube({ version: 'v3', auth: o });
}
