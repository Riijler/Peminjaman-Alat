import { Router } from 'express';
import { z } from 'zod';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { today } from '../lib/dates.js';
import { dateStr, opt, pageFields, offsetOf, pageMeta, idParam, updateRow } from '../lib/validators.js';
import { requireRole } from '../middleware/auth.js';

const statusEnum = z.enum(['pending', 'approved', 'rejected', 'returned']);

const createSchema = z.object({
  user_id: z.coerce.number().int().min(1).optional(), // hanya dipakai admin
  tool_id: z.coerce.number().int().min(1),
  quantity: z.coerce.number().int().min(1).max(1000).default(1),
  loan_date: dateStr.optional(),
  due_date: dateStr,
  note: z.string().trim().max(500).nullable().optional(),
});
const updateSchema = createSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'Tidak ada data yang diubah' });
const rejectSchema = z.object({ reason: z.string().trim().max(500).optional() });
const listSchema = z.object({
  q: opt(z.string().trim()),
  status: opt(statusEnum),
  user_id: opt(z.coerce.number().int().min(1)),
  overdue: opt(z.enum(['true'])),
  ...pageFields,
});

const FROM = `FROM loans l
  JOIN users u ON u.id = l.user_id
  JOIN tools t ON t.id = l.tool_id
  LEFT JOIN users p ON p.id = l.processed_by
  LEFT JOIN returns r ON r.loan_id = l.id`;
const SELECT = `SELECT l.*, u.name AS borrower_name, u.username AS borrower_username, t.name AS tool_name,
  p.name AS processed_by_name, r.id AS return_id, r.status AS return_status,
  CASE WHEN l.status = 'approved' AND l.due_date < CURRENT_DATE THEN 1 ELSE 0 END AS is_overdue
  ${FROM}`;

export default function loansRoutes({ db, log }) {
  const router = Router();
  const find = (id) => db.one(`${SELECT} WHERE l.id = ?`, [id]);
  const getTool = (id) => db.one('SELECT * FROM tools WHERE id = ?', [id]);

  function checkDates(loanDate, dueDate) {
    if (dueDate < loanDate) throw badRequest('Tanggal kembali tidak boleh sebelum tanggal pinjam');
  }
  function checkStock(tool, qty) {
    if (!tool) throw notFound('Alat tidak ditemukan');
    if (qty > tool.available) throw badRequest(`Stok tidak cukup (tersedia ${tool.available})`);
  }
  async function checkBorrower(id) {
    const u = await db.one('SELECT role FROM users WHERE id = ?', [id]);
    if (!u || u.role !== 'peminjam') throw badRequest('user_id harus user dengan role peminjam');
  }

  // Admin & petugas: semua data. Peminjam: hanya milik sendiri ("Peminjaman Saya").
  router.get('/', async (req, res) => {
    const q = listSchema.parse(req.query);
    const where = [];
    const params = [];
    if (req.user.role === 'peminjam') {
      where.push('l.user_id = ?');
      params.push(req.user.id);
    } else if (q.user_id) {
      where.push('l.user_id = ?');
      params.push(q.user_id);
    }
    if (q.status) {
      where.push('l.status = ?');
      params.push(q.status);
    }
    if (q.overdue) where.push("l.status = 'approved' AND l.due_date < CURRENT_DATE");
    if (q.q) {
      where.push('(u.name LIKE ? OR t.name LIKE ?)');
      params.push(`%${q.q}%`, `%${q.q}%`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await db.one(`SELECT COUNT(*) c ${FROM} ${w}`, params)).c;
    const rows = await db.many(`${SELECT} ${w} ORDER BY l.id DESC LIMIT ? OFFSET ?`, [...params, q.limit, offsetOf(q)]);
    res.json({ data: rows, meta: pageMeta(q, total) });
  });

  router.get('/:id', async (req, res) => {
    const row = await find(idParam(req));
    if (!row || (req.user.role === 'peminjam' && row.user_id !== req.user.id)) {
      throw notFound('Peminjaman tidak ditemukan');
    }
    res.json({ data: row });
  });

  // Mengajukan peminjaman (peminjam) / tambah data peminjaman (admin)
  router.post('/', requireRole('peminjam', 'admin'), async (req, res) => {
    const input = createSchema.parse(req.body);
    let userId = req.user.id;
    if (req.user.role === 'admin') {
      if (!input.user_id) throw badRequest('user_id peminjam wajib diisi');
      await checkBorrower(input.user_id);
      userId = input.user_id;
    } else if (input.user_id !== undefined && input.user_id !== req.user.id) {
      throw forbidden('Tidak boleh mengajukan peminjaman atas nama user lain');
    }
    const loanDate = input.loan_date ?? today();
    checkDates(loanDate, input.due_date);
    checkStock(await getTool(input.tool_id), input.quantity);

    const info = await db.run(
      `INSERT INTO loans (user_id, tool_id, quantity, loan_date, due_date, note) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, input.tool_id, input.quantity, loanDate, input.due_date, input.note ?? null]
    );
    await log(req, 'ajukan_peminjaman', {
      entity: 'loans',
      entityId: info.insertId,
      detail: { tool_id: input.tool_id, quantity: input.quantity, user_id: userId },
    });
    res.status(201).json({ data: await find(info.insertId) });
  });

  // Edit data peminjaman (admin) - hanya selama masih pending
  router.put('/:id', requireRole('admin'), async (req, res) => {
    const id = idParam(req);
    const input = updateSchema.parse(req.body);
    const cur = await db.one('SELECT * FROM loans WHERE id = ?', [id]);
    if (!cur) throw notFound('Peminjaman tidak ditemukan');
    if (cur.status !== 'pending') throw conflict('Hanya peminjaman berstatus pending yang bisa diubah');
    const next = { ...cur, ...input };
    if (input.user_id !== undefined) await checkBorrower(input.user_id);
    checkDates(next.loan_date, next.due_date);
    checkStock(await getTool(next.tool_id), next.quantity);
    await updateRow(db, 'loans', id, input);
    await log(req, 'ubah_peminjaman', { entity: 'loans', entityId: id, detail: Object.keys(input).join(', ') });
    res.json({ data: await find(id) });
  });

  // Menyetujui peminjaman (petugas)
  router.patch('/:id/approve', requireRole('petugas'), async (req, res) => {
    const id = idParam(req);
    await db.transaction(async (tx) => {
      const loan = await tx.one('SELECT * FROM loans WHERE id = ? FOR UPDATE', [id]);
      if (!loan) throw notFound('Peminjaman tidak ditemukan');
      if (loan.status !== 'pending') throw conflict(`Peminjaman sudah berstatus ${loan.status}`);
      const upd = await tx.run(
        `UPDATE tools SET available = available - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND available >= ?`,
        [loan.quantity, loan.tool_id, loan.quantity]
      );
      if (upd.changes === 0) throw conflict('Stok alat tidak mencukupi untuk disetujui');
      await tx.run(
        `UPDATE loans SET status = 'approved', processed_by = ?, processed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [req.user.id, id]
      );
    });
    await log(req, 'setujui_peminjaman', { entity: 'loans', entityId: id });
    res.json({ data: await find(id) });
  });

  // Menolak peminjaman (petugas)
  router.patch('/:id/reject', requireRole('petugas'), async (req, res) => {
    const id = idParam(req);
    const { reason } = rejectSchema.parse(req.body ?? {});
    const loan = await db.one('SELECT * FROM loans WHERE id = ?', [id]);
    if (!loan) throw notFound('Peminjaman tidak ditemukan');
    if (loan.status !== 'pending') throw conflict(`Peminjaman sudah berstatus ${loan.status}`);
    await db.run(
      `UPDATE loans SET status = 'rejected', reject_reason = ?, processed_by = ?, processed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reason ?? null, req.user.id, id]
    );
    await log(req, 'tolak_peminjaman', { entity: 'loans', entityId: id, detail: reason ?? null });
    res.json({ data: await find(id) });
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    const id = idParam(req);
    const loan = await db.one('SELECT * FROM loans WHERE id = ?', [id]);
    if (!loan) throw notFound('Peminjaman tidak ditemukan');
    await db.transaction(async (tx) => {
      // Peminjaman yang masih berjalan: kembalikan stok yang sempat dikurangi
      if (loan.status === 'approved') {
        await tx.run(`UPDATE tools SET available = available + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
          loan.quantity,
          loan.tool_id,
        ]);
      }
      await tx.run('DELETE FROM loans WHERE id = ?', [id]); // returns ikut terhapus (CASCADE)
    });
    await log(req, 'hapus_peminjaman', { entity: 'loans', entityId: id, detail: `status ${loan.status}` });
    res.json({ data: { message: 'Peminjaman dihapus' } });
  });

  return router;
}
