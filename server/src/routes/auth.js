import crypto from 'node:crypto';
import { Router } from 'express';
import { verifyAdmin, signToken, requireAdmin, hashKey } from '../auth.js';
import { AgentKey } from '../models/AgentKey.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'email+password required' });
  if (!(await verifyAdmin(email, password))) return res.status(401).json({ error: 'invalid credentials' });
  res.json({ token: signToken() });
});

// Create a long-lived key for local agents. The plaintext key is shown once.
authRouter.post('/agent-key', requireAdmin, async (req, res) => {
  try {
    const key = `amp_${crypto.randomBytes(32).toString('hex')}`;
    const doc = await AgentKey.create({
      keyHash: hashKey(key),
      prefix: key.slice(0, 12),
      label: String(req.body?.label || 'agent').slice(0, 60),
    });
    res.json({ id: doc.id, key, prefix: doc.prefix, label: doc.label });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

authRouter.get('/agent-key', requireAdmin, async (_req, res) => {
  try {
    res.json(await AgentKey.find().select('prefix label lastUsedAt createdAt'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

authRouter.delete('/agent-key/:id', requireAdmin, async (req, res) => {
  try {
    await AgentKey.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
