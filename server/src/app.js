import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authRouter } from './routes/auth.js';
import { channelsRouter } from './routes/channels.js';
import { videosRouter } from './routes/videos.js';
import { publicationsRouter } from './routes/publications.js';
import { importsRouter } from './routes/imports.js';
import { analyticsRouter } from './routes/analytics.js';
export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.FRONTEND_URL?.split(',') ?? true }));
  app.use(express.json({ limit: '10mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/channels', channelsRouter);
  app.use('/api/videos', videosRouter);
  app.use('/api/publications', publicationsRouter);
  app.use('/api/imports', importsRouter);
  app.use('/api/analytics', analyticsRouter);

  // Serve the built React client from the same origin as the API. This gives a
  // deployment URL that works on networks where *.vercel.app is blocked, and
  // removes CORS from the browser flow entirely.
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  }
  return app;
}
