import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createLogger } from './lib/activity.js';
import { authenticate, requireRole } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import categoriesRoutes from './routes/categories.js';
import toolsRoutes from './routes/tools.js';
import loansRoutes from './routes/loans.js';
import returnsRoutes from './routes/returns.js';
import logsRoutes from './routes/logs.js';
import reportsRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';

export function createApp({ db, config }) {
  const app = express();
  const ctx = { db, config, log: createLogger(db) };
  const auth = authenticate(ctx);

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', (req, res) => res.json({ data: { status: 'ok' } }));
  app.use('/api/auth', authRoutes(ctx, auth));

  // Akses per role mengikuti tabel fitur
  app.use('/api/dashboard', auth, dashboardRoutes(ctx));
  app.use('/api/users', auth, requireRole('admin'), usersRoutes(ctx));
  app.use('/api/categories', auth, categoriesRoutes(ctx));
  app.use('/api/tools', auth, toolsRoutes(ctx));
  app.use('/api/loans', auth, loansRoutes(ctx));
  app.use('/api/returns', auth, returnsRoutes(ctx));
  app.use('/api/logs', auth, requireRole('admin'), logsRoutes(ctx));
  app.use('/api/reports', auth, requireRole('petugas'), reportsRoutes(ctx));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
