import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../lib/errors.js';
import { opt, pageFields, offsetOf, pageMeta, idParam, updateRow } from '../lib/validators.js';
import { requireRole } from '../middleware/auth.js';

const imageUrl = z.string().trim().url().max(500).nullable().optional();
const schema = z.object({
  category_id: z.coerce.number().int().min(1),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).nullable().optional(),
  image_url: imageUrl,
  stock: z.coerce.number().int().min(0).max(100000),
});
const updateSchema = schema.partial().refine((o) => Object.keys(o).length > 0, { message: 'Tidak ada data yang diubah' });
const listSchema = z.object({
  q: opt(z.string().trim()),
  category_id: opt(z.coerce.number().int().min(1)),
  available: opt(z.enum(['true', 'false'])),
  ...pageFields,
});

const SELECT = `SELECT t.*, c.name AS category_name FROM tools t JOIN categories c ON c.id = t.category_id`;

export default function toolsRoutes({ db, log }) {
  const router = Router();
  const find = (id) => db.one(`${SELECT} WHERE t.id = ?`, [id]);
  const categoryExists = async (id) => !!(await db.one('SELECT 1 FROM categories WHERE id = ?', [id]));

  // Semua user login boleh lihat daftar alat
  router.get('/', async (req, res) => {
    const q = listSchema.parse(req.query);
    const where = [];
    const params = [];
    if (q.q) {
      where.push('(t.name LIKE ? OR t.description LIKE ?)');
      params.push(`%${q.q}%`, `%${q.q}%`);
    }
    if (q.category_id) {
      where.push('t.category_id = ?');
      params.push(q.category_id);
    }
    if (q.available === 'true') where.push('t.available > 0');
    if (q.available === 'false') where.push('t.available = 0');
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await db.one(`SELECT COUNT(*) c FROM tools t JOIN categories c ON c.id = t.category_id ${w}`, params)).c;
    const rows = await db.many(`${SELECT} ${w} ORDER BY t.name LIMIT ? OFFSET ?`, [...params, q.limit, offsetOf(q)]);
    res.json({ data: rows, meta: pageMeta(q, total) });
  });

  router.get('/:id', async (req, res) => {
    const row = await find(idParam(req));
    if (!row) throw notFound('Alat tidak ditemukan');
    res.json({ data: row });
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    const input = schema.parse(req.body);
    if (!await categoryExists(input.category_id)) throw badRequest('Kategori tidak ditemukan');
    const info = await db.run(
      'INSERT INTO tools (category_id, name, description, image_url, stock, available) VALUES (?, ?, ?, ?, ?, ?)',
      [input.category_id, input.name, input.description ?? null, input.image_url ?? null, input.stock, input.stock]
    );
    await log(req, 'tambah_alat', { entity: 'tools', entityId: info.insertId, detail: input.name });
    res.status(201).json({ data: await find(info.insertId) });
  });

  router.put('/:id', requireRole('admin'), async (req, res) => {
    const id = idParam(req);
    const input = updateSchema.parse(req.body);
    const cur = await find(id);
    if (!cur) throw notFound('Alat tidak ditemukan');
    if (input.category_id !== undefined && !await categoryExists(input.category_id)) {
      throw badRequest('Kategori tidak ditemukan');
    }
    const data = { ...input };
    if (input.stock !== undefined) {
      const newAvailable = cur.available + (input.stock - cur.stock);
      if (newAvailable < 0) {
        throw badRequest(`Stok tidak boleh kurang dari jumlah yang sedang dipinjam (${cur.stock - cur.available})`);
      }
      data.available = newAvailable;
    }
    await updateRow(db, 'tools', id, data);
    await log(req, 'ubah_alat', { entity: 'tools', entityId: id, detail: Object.keys(input).join(', ') });
    res.json({ data: await find(id) });
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    const id = idParam(req);
    const row = await find(id);
    if (!row) throw notFound('Alat tidak ditemukan');
    await db.run('DELETE FROM tools WHERE id = ?', [id]); // FK RESTRICT -> 409 jika pernah dipinjam
    await log(req, 'hapus_alat', { entity: 'tools', entityId: id, detail: row.name });
    res.json({ data: { message: 'Alat dihapus' } });
  });

  return router;
}
