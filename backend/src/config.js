import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  port: num(process.env.PORT, 4000),
  dbHost: process.env.DB_HOST || '127.0.0.1',
  dbPort: num(process.env.DB_PORT, 3306),
  dbUser: process.env.DB_USER || 'root',
  dbPassword: process.env.DB_PASSWORD || '',
  dbName: process.env.DB_NAME || 'peminjaman_alat',
  dbTestName: process.env.DB_TEST_NAME || 'peminjaman_alat_test',
  dbConnectionLimit: num(process.env.DB_CONNECTION_LIMIT, 10),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000,http://localhost:5173',
  finePerDay: num(process.env.FINE_PER_DAY, 1000),
  loginRateLimit: num(process.env.LOGIN_RATE_LIMIT, 10),
};

export function assertConfig(c) {
  if (!c.jwtSecret || c.jwtSecret.length < 16) {
    throw new Error('JWT_SECRET wajib diisi (minimal 16 karakter). Salin .env.example ke .env lalu ubah nilainya.');
  }
  if (!c.dbHost || !c.dbName || !c.dbUser) {
    throw new Error('DB_HOST, DB_NAME, dan DB_USER wajib diisi.');
  }
}
