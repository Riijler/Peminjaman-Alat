import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { badRequest, notFound } from '../lib/errors.js';
import { opt, pageFields, offsetOf, pageMeta, idParam, updateRow } from '../lib/validators.js';

const roleEnum = z.enum(['admin', 'petugas', 'peminjam']);

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Hanya huruf, angka, titik, strip, dan underscore'),
  password: z.string().min(6, 'Password minimal 6 karakter').max(100),
  role: roleEnum,
});
const updateSchema = createSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'Tidak ada data yang diubah' });
const listSchema = z.object({ q: opt(z.string().trim()), role: opt(roleEnum), ...pageFields });

const COLS = 'id, name, username, role, created_at, updated_at';

export default function usersRoutes({ db, log }) {
  const router = Router();
  const find = (id) => db.one(`SELECT ${COLS} FROM users WHERE id = ?`, [id]);
  const adminCount = async () => (await db.one("SELECT COUNT(*) c FROM users WHERE role = 'admin'")).c;

  router.get('/', async (req, res) => {
    const q = listSchema.parse(req.query);
    const where = [];
    const params = [];
    if (q.q) {
      where.push('(name LIKE ? OR username LIKE ?)');
      params.push(`%${q.q}%`, `%${q.q}%`);
    }
    if (q.role) {
      where.push('role = ?');
      params.push(q.role);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await db.one(`SELECT COUNT(*) c FROM users ${w}`, params)).c;
    const rows = await db.many(`SELECT ${COLS} FROM users ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, [
      ...params,
      q.limit,
      offsetOf(q),
    ]);
    res.json({ data: rows, meta: pageMeta(q, total) });
  });

  router.get('/:id', async (req, res) => {
    const user = await find(idParam(req));
    if (!user) throw notFound('User tidak ditemukan');
    res.json({ data: user });
  });

  router.post('/', async (req, res) => {
    const input = createSchema.parse(req.body);
    const info = await db.run('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)', [
      input.name,
      input.username,
      bcrypt.hashSync(input.password, 10),
      input.role,
    ]);
    const user = await find(info.insertId);
    await log(req, 'tambah_user', { entity: 'users', entityId: user.id, detail: `${user.username} (${user.role})` });
    res.status(201).json({ data: user });
  });

  router.put('/:id', async (req, res) => {
    const id = idParam(req);
    const input = updateSchema.parse(req.body);
    const target = await find(id);
    if (!target) throw notFound('User tidak ditemukan');
    if (input.role && input.role !== 'admin' && target.role === 'admin' && await adminCount() <= 1) {
      throw badRequest('Tidak bisa mengubah role admin terakhir');
    }
    const data = { ...input };
    if (data.password) {
      data.password_hash = bcrypt.hashSync(data.password, 10);
    }
    delete data.password;
    await updateRow(db, 'users', id, data);
    await log(req, 'ubah_user', { entity: 'users', entityId: id, detail: Object.keys(input).join(', ') });
    res.json({ data: await find(id) });
  });

  router.delete('/:id', async (req, res) => {
    const id = idParam(req);
    const target = await find(id);
    if (!target) throw notFound('User tidak ditemukan');
    if (id === req.user.id) throw badRequest('Tidak bisa menghapus akun sendiri');
    if (target.role === 'admin' && await adminCount() <= 1) throw badRequest('Tidak bisa menghapus admin terakhir');
    await db.run('DELETE FROM users WHERE id = ?', [id]);
    await log(req, 'hapus_user', { entity: 'users', entityId: id, detail: target.username });
    res.json({ data: { message: 'User dihapus' } });
  });

  return router;
}
