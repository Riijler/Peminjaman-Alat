import { Router } from 'express';
import { z } from 'zod';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { today, daysBetween } from '../lib/dates.js';
import { dateStr, opt, pageFields, offsetOf, pageMeta, idParam } from '../lib/validators.js';
import { requireRole } from '../middleware/auth.js';

const conditionEnum = z.enum(['baik', 'rusak', 'hilang']);
const createSchema = z.object({
  loan_id: z.coerce.number().int().min(1),
  item_condition: conditionEnum.default('baik'),
  returned_at: dateStr.optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
const updateSchema = createSchema
  .omit({ loan_id: true })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'Tidak ada data yang diubah' });
const listSchema = z.object({
  q: opt(z.string().trim()),
  status: opt(z.enum(['pending', 'confirmed'])),
  ...pageFields,
});

const FROM = `FROM returns r
  JOIN loans l ON l.id = r.loan_id
  JOIN users u ON u.id = l.user_id
  JOIN tools t ON t.id = l.tool_id
  LEFT JOIN users c ON c.id = r.received_by`;
const SELECT = `SELECT r.*, l.user_id, l.tool_id, l.quantity, l.loan_date, l.due_date,
  u.name AS borrower_name, t.name AS tool_name, c.name AS received_by_name ${FROM}`;

export default function returnsRoutes({ db, config, log }) {
  const router = Router();
  const find = (id) => db.one(`${SELECT} WHERE r.id = ?`, [id]);

  // Admin & petugas: semua (pantau pengembalian). Peminjam: milik sendiri.
  router.get('/', async (req, res) => {
    const q = listSchema.parse(req.query);
    const where = [];
    const params = [];
    if (req.user.role === 'peminjam') {
      where.push('l.user_id = ?');
      params.push(req.user.id);
    }
    if (q.status) {
      where.push('r.status = ?');
      params.push(q.status);
    }
    if (q.q) {
      where.push('(u.name LIKE ? OR t.name LIKE ?)');
      params.push(`%${q.q}%`, `%${q.q}%`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await db.one(`SELECT COUNT(*) c ${FROM} ${w}`, params)).c;
    const rows = await db.many(`${SELECT} ${w} ORDER BY r.id DESC LIMIT ? OFFSET ?`, [...params, q.limit, offsetOf(q)]);
    res.json({ data: rows, meta: pageMeta(q, total) });
  });

  router.get('/:id', async (req, res) => {
    const row = await find(idParam(req));
    if (!row || (req.user.role === 'peminjam' && row.user_id !== req.user.id)) {
      throw notFound('Pengembalian tidak ditemukan');
    }
    res.json({ data: row });
  });

  // Mengembalikan alat (peminjam) / tambah data pengembalian (admin). Status awal: pending.
  router.post('/', requireRole('peminjam', 'admin'), async (req, res) => {
    const input = createSchema.parse(req.body);
    const loan = await db.one('SELECT * FROM loans WHERE id = ?', [input.loan_id]);
    if (!loan || (req.user.role === 'peminjam' && loan.user_id !== req.user.id)) {
      throw notFound('Peminjaman tidak ditemukan');
    }
    if (loan.status !== 'approved') throw conflict('Hanya peminjaman yang disetujui yang bisa dikembalikan');
    if (await db.one('SELECT 1 FROM returns WHERE loan_id = ?', [loan.id])) {
      throw conflict('Pengembalian untuk peminjaman ini sudah diajukan');
    }
    const returnedAt = input.returned_at ?? today();
    if (returnedAt < loan.loan_date) throw badRequest('Tanggal kembali tidak boleh sebelum tanggal pinjam');
    const info = await db.run('INSERT INTO returns (loan_id, returned_at, item_condition, note) VALUES (?, ?, ?, ?)', [
      loan.id,
      returnedAt,
      input.item_condition,
      input.note ?? null,
    ]);
    await log(req, 'ajukan_pengembalian', { entity: 'returns', entityId: info.insertId, detail: { loan_id: loan.id } });
    res.status(201).json({ data: await find(info.insertId) });
  });

  // Edit data pengembalian (admin) - hanya selama pending
  router.put('/:id', requireRole('admin'), async (req, res) => {
    const id = idParam(req);
    const input = updateSchema.parse(req.body);
    const cur = await find(id);
    if (!cur) throw notFound('Pengembalian tidak ditemukan');
    if (cur.status !== 'pending') throw conflict('Pengembalian yang sudah dikonfirmasi tidak bisa diubah');
    if (input.returned_at && input.returned_at < cur.loan_date) {
      throw badRequest('Tanggal kembali tidak boleh sebelum tanggal pinjam');
    }
    const keys = Object.keys(input).filter((k) => input[k] !== undefined);
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    await db.run(`UPDATE returns SET ${sets} WHERE id = ?`, [...keys.map((k) => input[k]), id]);
    await log(req, 'ubah_pengembalian', { entity: 'returns', entityId: id, detail: keys.join(', ') });
    res.json({ data: await find(id) });
  });

  // Konfirmasi pengembalian (petugas): stok kembali, denda dihitung
  router.patch('/:id/confirm', requireRole('petugas'), async (req, res) => {
    const id = idParam(req);
    await db.transaction(async (tx) => {
      const ret = await tx.one('SELECT * FROM returns WHERE id = ? FOR UPDATE', [id]);
      if (!ret) throw notFound('Pengembalian tidak ditemukan');
      if (ret.status !== 'pending') throw conflict('Pengembalian sudah dikonfirmasi');
      const loan = await tx.one('SELECT * FROM loans WHERE id = ?', [ret.loan_id]);

      const lateDays = Math.max(0, daysBetween(loan.due_date, ret.returned_at));
      const fine = lateDays * config.finePerDay;

      await tx.run(
        `UPDATE returns SET status = 'confirmed', fine = ?, received_by = ?, confirmed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [fine, req.user.id, id]
      );
      await tx.run(`UPDATE loans SET status = 'returned', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [loan.id]);

      if (ret.item_condition === 'hilang') {
        // Alat hilang: stok total berkurang, tidak dikembalikan ke available
        await tx.run(`UPDATE tools SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
          loan.quantity,
          loan.tool_id,
        ]);
      } else {
        await tx.run(`UPDATE tools SET available = available + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
          loan.quantity,
          loan.tool_id,
        ]);
      }
    });
    await log(req, 'konfirmasi_pengembalian', { entity: 'returns', entityId: id });
    res.json({ data: await find(id) });
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    const id = idParam(req);
    const cur = await find(id);
    if (!cur) throw notFound('Pengembalian tidak ditemukan');
    if (cur.status !== 'pending') throw conflict('Pengembalian yang sudah dikonfirmasi tidak bisa dihapus');
    await db.run('DELETE FROM returns WHERE id = ?', [id]);
    await log(req, 'hapus_pengembalian', { entity: 'returns', entityId: id });
    res.json({ data: { message: 'Pengembalian dihapus' } });
  });

  return router;
}
