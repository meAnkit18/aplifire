import { Router } from 'express';
import { verifyAdmin, signToken } from '../auth.js';
export const authRouter = Router();
authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'email+password required' });
  if (!(await verifyAdmin(email, password))) return res.status(401).json({ error: 'invalid credentials' });
  res.json({ token: signToken() });
});
