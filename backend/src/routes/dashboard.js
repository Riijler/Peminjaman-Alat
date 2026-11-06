import { Router } from 'express';

export default function dashboardRoutes({ db }) {
  const router = Router();
  const count = async (sql, params = []) => (await db.one(sql, params)).c;
  const NOW = 'CURRENT_DATE';

  // Ringkasan sesuai role (untuk kartu di halaman Dashboard)
  router.get('/', async (req, res) => {
    const { role, id } = req.user;

    if (role === 'admin') {
      const loans = Object.fromEntries(
        (await db.many('SELECT status, COUNT(*) c FROM loans GROUP BY status')).map((r) => [r.status, r.c])
      );
      return res.json({
        data: {
          users: {
            admin: await count("SELECT COUNT(*) c FROM users WHERE role='admin'"),
            petugas: await count("SELECT COUNT(*) c FROM users WHERE role='petugas'"),
            peminjam: await count("SELECT COUNT(*) c FROM users WHERE role='peminjam'"),
          },
          tools: await count('SELECT COUNT(*) c FROM tools'),
          categories: await count('SELECT COUNT(*) c FROM categories'),
          loans: { pending: 0, approved: 0, rejected: 0, returned: 0, ...loans },
          pending_returns: await count("SELECT COUNT(*) c FROM returns WHERE status='pending'"),
          recent_logs: await db.many(
            `SELECT a.id, a.action, a.detail, a.created_at, u.name AS user_name
             FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 5`
          ),
        },
      });
    }

    if (role === 'petugas') {
      return res.json({
        data: {
          pending_loans: await count("SELECT COUNT(*) c FROM loans WHERE status='pending'"),
          active_loans: await count("SELECT COUNT(*) c FROM loans WHERE status='approved'"),
          overdue_loans: await count(`SELECT COUNT(*) c FROM loans WHERE status='approved' AND due_date < ${NOW}`),
          pending_returns: await count("SELECT COUNT(*) c FROM returns WHERE status='pending'"),
          recent_pending: await db.many(
            `SELECT l.id, u.name AS borrower_name, t.name AS tool_name, l.quantity, l.loan_date, l.due_date
             FROM loans l JOIN users u ON u.id = l.user_id JOIN tools t ON t.id = l.tool_id
             WHERE l.status='pending' ORDER BY l.id DESC LIMIT 5`
          ),
        },
      });
    }

    res.json({
      data: {
        pending_loans: await count("SELECT COUNT(*) c FROM loans WHERE user_id=? AND status='pending'", [id]),
        active_loans: await count("SELECT COUNT(*) c FROM loans WHERE user_id=? AND status='approved'", [id]),
        overdue_loans: await count(
          `SELECT COUNT(*) c FROM loans WHERE user_id=? AND status='approved' AND due_date < ${NOW}`,
          [id]
        ),
        total_loans: await count('SELECT COUNT(*) c FROM loans WHERE user_id=?', [id]),
        due_soon: await db.many(
          `SELECT l.id, t.name AS tool_name, l.quantity, l.due_date,
                  CASE WHEN l.due_date < ${NOW} THEN 1 ELSE 0 END AS is_overdue
           FROM loans l JOIN tools t ON t.id = l.tool_id
           WHERE l.user_id=? AND l.status='approved' ORDER BY l.due_date LIMIT 5`,
          [id]
        ),
      },
    });
  });

  return router;
}
