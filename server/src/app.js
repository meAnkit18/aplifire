import express from 'express';
import cors from 'cors';
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
  return app;
}
