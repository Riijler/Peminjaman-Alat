import { Router } from 'express';
import { z } from 'zod';
import { dateStr, opt, pageFields, offsetOf, pageMeta } from '../lib/validators.js';

const listSchema = z.object({
  q: opt(z.string().trim()),
  user_id: opt(z.coerce.number().int().min(1)),
  action: opt(z.string().trim()),
  entity: opt(z.string().trim()),
  from: opt(dateStr),
  to: opt(dateStr),
  ...pageFields,
});

export default function logsRoutes({ db }) {
  const router = Router();

  // Log aktifitas (admin)
  router.get('/', async (req, res) => {
    const q = listSchema.parse(req.query);
    const where = [];
    const params = [];
    if (q.q) {
      where.push('(a.detail LIKE ? OR a.action LIKE ? OR u.name LIKE ?)');
      params.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`);
    }
    if (q.user_id) {
      where.push('a.user_id = ?');
      params.push(q.user_id);
    }
    if (q.action) {
      where.push('a.action = ?');
      params.push(q.action);
    }
    if (q.entity) {
      where.push('a.entity = ?');
      params.push(q.entity);
    }
    if (q.from) {
      where.push('DATE(a.created_at) >= ?');
      params.push(q.from);
    }
    if (q.to) {
      where.push('DATE(a.created_at) <= ?');
      params.push(q.to);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = 'FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id';
    const total = (await db.one(`SELECT COUNT(*) c ${from} ${w}`, params)).c;
    const rows = await db.many(
      `SELECT a.*, u.name AS user_name, u.role AS user_role ${from} ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, q.limit, offsetOf(q)]
    );
    res.json({ data: rows, meta: pageMeta(q, total) });
  });

  return router;
}
