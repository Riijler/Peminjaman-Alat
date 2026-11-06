import { z } from 'zod';
import { isRealDate } from './dates.js';
import { badRequest } from './errors.js';

export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
  .refine(isRealDate, 'Tanggal tidak valid');

// Query string kosong ("?role=") dianggap tidak diisi
export const opt = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const pageFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const offsetOf = (q) => (q.page - 1) * q.limit;
export const pageMeta = (q, total) => ({
  page: q.page,
  limit: q.limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / q.limit)),
});

export function idParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw badRequest('ID tidak valid');
  return id;
}

export async function updateRow(db, table, id, data) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  await db.run(`UPDATE ${table} SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
    ...keys.map((k) => data[k]),
    id,
  ]);
}
