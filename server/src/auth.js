import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
export async function verifyAdmin(email, password) {
  if (email !== (process.env.ADMIN_EMAIL || config.adminEmail)) return false;
  const hash = process.env.ADMIN_PASSWORD_HASH || config.adminPasswordHash;
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
export function signToken() { return jwt.sign({ sub: 'admin' }, process.env.JWT_SECRET || config.jwtSecret, { expiresIn: '7d' }); }
export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  // Allow machine/agent access via PIPELINE_API_KEY (same key used by /channels/:id/token).
  if (process.env.PIPELINE_API_KEY && token === process.env.PIPELINE_API_KEY) return next();
  try { jwt.verify(token, process.env.JWT_SECRET || config.jwtSecret); next(); }
  catch { return res.status(401).json({ error: 'invalid token' }); }
}
