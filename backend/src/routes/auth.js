import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { unauthorized } from '../lib/errors.js';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username wajib diisi'),
  password: z.string().min(1, 'Password wajib diisi'),
});

// Hash palsu supaya waktu respon sama untuk username yang tidak ada (cegah user enumeration)
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

export default function authRoutes({ db, config, log }, auth) {
  const router = Router();

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: 'Terlalu banyak percobaan login, coba lagi nanti' } },
  });

  router.post('/login', limiter, async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const row = await db.one('SELECT * FROM users WHERE username = ?', [username]);
    const ok = bcrypt.compareSync(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok) {
      await log(req, 'login_gagal', { entity: 'users', detail: `username: ${username}`, userId: null });
      throw unauthorized('Username atau password salah');
    }
    const token = jwt.sign({ role: row.role }, config.jwtSecret, {
      subject: String(row.id),
      expiresIn: config.jwtExpiresIn,
    });
    await log(req, 'login', { entity: 'users', entityId: row.id, userId: row.id });
    res.json({
      data: {
        token,
        user: { id: row.id, name: row.name, username: row.username, role: row.role },
      },
    });
  });

  router.post('/logout', auth, async (req, res) => {
    // JWT stateless: client wajib hapus token. Server mencatat aktivitas logout.
    await log(req, 'logout', { entity: 'users', entityId: req.user.id });
    res.json({ data: { message: 'Logout berhasil' } });
  });

  router.get('/me', auth, (req, res) => res.json({ data: req.user }));

  return router;
}
