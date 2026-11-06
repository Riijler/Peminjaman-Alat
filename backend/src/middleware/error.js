import { ZodError } from 'zod';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: 'Endpoint tidak ditemukan' } });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        message: 'Validasi gagal',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Body bukan JSON yang valid' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { message: 'Body terlalu besar' } });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: { message: 'Data sudah dipakai' } });
  }
  if (['ER_NO_REFERENCED_ROW_2', 'ER_ROW_IS_REFERENCED_2'].includes(err.code)) {
    return res.status(409).json({ error: { message: 'Data tidak bisa dihapus/diubah karena masih dipakai data lain' } });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: { message: err.message, details: err.details } });
  }
  console.error(err);
  res.status(500).json({ error: { message: 'Terjadi kesalahan pada server' } });
}
