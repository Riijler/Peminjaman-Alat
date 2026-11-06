import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { opt, idParam, updateRow } from '../lib/validators.js';
import { requireRole } from '../middleware/auth.js';

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
});
const updateSchema = schema.partial().refine((o) => Object.keys(o).length > 0, { message: 'Tidak ada data yang diubah' });
const listSchema = z.object({ q: opt(z.string().trim()) });

export default function categoriesRoutes({ db, log }) {
  const router = Router();
  const find = (id) =>
    db.one(
        `SELECT c.*, (SELECT COUNT(*) FROM tools t WHERE t.category_id = c.id) AS tools_count
         FROM categories c WHERE c.id = ?`,
      [id]
    );

  // Semua user login boleh lihat (dipakai filter daftar alat)
  router.get('/', async (req, res) => {
    const q = listSchema.parse(req.query);
    const params = [];
    let w = '';
    if (q.q) {
      w = 'WHERE c.name LIKE ?';
      params.push(`%${q.q}%`);
    }
    const rows = await db.many(
        `SELECT c.*, (SELECT COUNT(*) FROM tools t WHERE t.category_id = c.id) AS tools_count
         FROM categories c ${w} ORDER BY c.name`,
      params
    );
    res.json({ data: rows });
  });

  router.get('/:id', async (req, res) => {
    const row = await find(idParam(req));
    if (!row) throw notFound('Kategori tidak ditemukan');
    res.json({ data: row });
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    const input = schema.parse(req.body);
    const info = await db.run('INSERT INTO categories (name, description) VALUES (?, ?)', [input.name, input.description ?? null]);
    await log(req, 'tambah_kategori', { entity: 'categories', entityId: info.insertId, detail: input.name });
    res.status(201).json({ data: await find(info.insertId) });
  });

  router.put('/:id', requireRole('admin'), async (req, res) => {
    const id = idParam(req);
    const input = updateSchema.parse(req.body);
    if (!await find(id)) throw notFound('Kategori tidak ditemukan');
    await updateRow(db, 'categories', id, input);
    await log(req, 'ubah_kategori', { entity: 'categories', entityId: id, detail: Object.keys(input).join(', ') });
    res.json({ data: await find(id) });
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    const id = idParam(req);
    const row = await find(id);
    if (!row) throw notFound('Kategori tidak ditemukan');
    await db.run('DELETE FROM categories WHERE id = ?', [id]); // FK RESTRICT -> 409 jika masih dipakai alat
    await log(req, 'hapus_kategori', { entity: 'categories', entityId: id, detail: row.name });
    res.json({ data: { message: 'Kategori dihapus' } });
  });

  return router;
}
