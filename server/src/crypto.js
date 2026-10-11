import crypto from 'node:crypto';
export function encrypt(plain, hexKey) {
  const key = Buffer.from(hexKey, 'hex');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}
export function decrypt(payload, hexKey) {
  const [ivH, tagH, encH] = payload.split(':');
  const key = Buffer.from(hexKey, 'hex');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivH, 'hex'));
  d.setAuthTag(Buffer.from(tagH, 'hex'));
  return d.update(Buffer.from(encH, 'hex'), null, 'utf8') + d.final('utf8');
}
