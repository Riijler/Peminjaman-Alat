import { Router } from 'express';
import { z } from 'zod';
import { today } from '../lib/dates.js';
import { dateStr, opt } from '../lib/validators.js';

const listSchema = z.object({
  from: opt(dateStr),
  to: opt(dateStr),
  status: opt(z.enum(['pending', 'approved', 'rejected', 'returned'])),
  format: z.enum(['json', 'csv']).default('json'),
});

// Cegah CSV injection (sel diawali = + - @ dibaca Excel sebagai rumus)
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function reportsRoutes({ db, log }) {
  const router = Router();

  // Mencetak laporan peminjaman (petugas): JSON untuk tampilan cetak, atau CSV untuk unduhan
  router.get('/loans', async (req, res) => {
    const q = listSchema.parse(req.query);
    const where = [];
    const params = [];
    if (q.from) {
      where.push('l.loan_date >= ?');
      params.push(q.from);
    }
    if (q.to) {
      where.push('l.loan_date <= ?');
      params.push(q.to);
    }
    if (q.status) {
      where.push('l.status = ?');
      params.push(q.status);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await db.many(
        `SELECT l.id, u.name AS peminjam, t.name AS alat, c.name AS kategori, l.quantity AS jumlah,
                l.loan_date AS tanggal_pinjam, l.due_date AS batas_kembali, l.status,
                r.returned_at AS tanggal_kembali, r.item_condition AS kondisi, COALESCE(r.fine, 0) AS denda,
                p.name AS diproses_oleh
         FROM loans l
         JOIN users u ON u.id = l.user_id
         JOIN tools t ON t.id = l.tool_id
         JOIN categories c ON c.id = t.category_id
         LEFT JOIN returns r ON r.loan_id = l.id
         LEFT JOIN users p ON p.id = l.processed_by
         ${w} ORDER BY l.loan_date DESC, l.id DESC LIMIT 5000`,
      params
    );

    await log(req, 'cetak_laporan', { entity: 'loans', detail: { ...q, rows: rows.length } });

    if (q.format === 'csv') {
      const cols = Object.keys(rows[0] ?? { id: 0, peminjam: 0, alat: 0, kategori: 0, jumlah: 0, tanggal_pinjam: 0, batas_kembali: 0, status: 0, tanggal_kembali: 0, kondisi: 0, denda: 0, diproses_oleh: 0 });
      const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="laporan-peminjaman-${today()}.csv"`);
      return res.send(`\uFEFF${csv}`);
    }

    const byStatus = { pending: 0, approved: 0, rejected: 0, returned: 0 };
    let totalFines = 0;
    for (const r of rows) {
      byStatus[r.status] += 1;
      totalFines += r.denda;
    }
    res.json({
      data: rows,
      summary: { total: rows.length, by_status: byStatus, total_fines: totalFines },
      filter: { from: q.from ?? null, to: q.to ?? null, status: q.status ?? null },
      printed_by: req.user.name,
      printed_at: new Date().toISOString(),
    });
  });

  return router;
}
