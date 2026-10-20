import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { AgentKey } from './models/AgentKey.js';

export async function verifyAdmin(email, password) {
  if (email !== (process.env.ADMIN_EMAIL || config.adminEmail)) return false;
  const hash = process.env.ADMIN_PASSWORD_HASH || config.adminPasswordHash;
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
export function signToken() { return jwt.sign({ sub: 'admin' }, process.env.JWT_SECRET || config.jwtSecret, { expiresIn: '7d' }); }

export const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function verifyJwt(token) {
  try { jwt.verify(token, process.env.JWT_SECRET || config.jwtSecret); return true; }
  catch { return false; }
}

// Admin-only: accepts the login JWT, never an agent key.
export function requireAdmin(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  if (!verifyJwt(token)) return res.status(401).json({ error: 'invalid token' });
  next();
}

// Admin JWT, the PIPELINE_API_KEY env var, or a DB-stored agent key (amp_...).
export async function requireAuth(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  if (process.env.PIPELINE_API_KEY && token === process.env.PIPELINE_API_KEY) return next();
  if (token.startsWith('amp_')) {
    try {
      const doc = await AgentKey.findOne({ keyHash: hashKey(token) });
      if (doc) {
        AgentKey.updateOne({ _id: doc._id }, { lastUsedAt: new Date() }).catch(() => {});
        return next();
      }
    } catch { /* fall through to invalid */ }
    return res.status(401).json({ error: 'invalid token' });
  }
  if (verifyJwt(token)) return next();
  return res.status(401).json({ error: 'invalid token' });
}
