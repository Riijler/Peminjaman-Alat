import jwt from 'jsonwebtoken';
import { unauthorized, forbidden } from '../lib/errors.js';

export function authenticate({ db, config }) {
  return async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized('Token tidak ada');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw unauthorized('Token tidak valid atau kedaluwarsa');
    }
    const user = await db.one('SELECT id, name, username, role FROM users WHERE id = ?', [Number(payload.sub)]);
    if (!user) throw unauthorized('Akun tidak ditemukan');
    req.user = user;
    next();
  };
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw forbidden('Role kamu tidak punya akses ke fitur ini');
  next();
};
