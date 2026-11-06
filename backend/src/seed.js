import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { createDb } from './db.js';

export async function seedDatabase(db) {
  if ((await db.one('SELECT COUNT(*) c FROM users')).c > 0) return false;
  const hash = (p) => bcrypt.hashSync(p, 10);

  await db.transaction(async (tx) => {
    for (const [name, username, role, password] of [
      ['Administrator', 'admin', 'admin', 'admin123'],
      ['Petugas Satu', 'petugas', 'petugas', 'petugas123'],
      ['Peminjam Satu', 'peminjam', 'peminjam', 'peminjam123'],
    ]) {
      await tx.run('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)', [
        name,
        username,
        hash(password),
        role,
      ]);
    }

    const elektronik = (await tx.run('INSERT INTO categories (name, description) VALUES (?, ?)', [
      'Elektronik',
      'Perangkat elektronik',
    ])).insertId;
    const perkakas = (await tx.run('INSERT INTO categories (name, description) VALUES (?, ?)', [
      'Perkakas',
      'Alat bengkel dan perkakas tangan',
    ])).insertId;
    const olahraga = (await tx.run('INSERT INTO categories (name, description) VALUES (?, ?)', [
      'Olahraga',
      'Perlengkapan olahraga',
    ])).insertId;

    for (const [c, n, d, s] of [
      [elektronik, 'Proyektor', 'Proyektor HDMI', 3],
      [elektronik, 'Laptop', 'Laptop praktik', 5],
      [perkakas, 'Bor Listrik', 'Bor tangan + mata bor', 2],
      [perkakas, 'Tang Kombinasi', 'Tang serbaguna', 10],
      [olahraga, 'Bola Voli', 'Bola voli standar', 6],
      [olahraga, 'Raket Badminton', 'Raket + shuttlecock', 8],
    ]) {
      await tx.run(
        'INSERT INTO tools (category_id, name, description, stock, available) VALUES (?, ?, ?, ?, ?)',
        [c, n, d, s, s]
      );
    }
  });
  return true;
}

// Jalankan langsung: npm run seed
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = await createDb(config);
  try {
    if (await seedDatabase(db)) {
      console.log('Seed selesai. Akun contoh (GANTI password sebelum dipakai sungguhan):');
      console.log('  admin    / admin123');
      console.log('  petugas  / petugas123');
      console.log('  peminjam / peminjam123');
    } else {
      console.log('Database sudah berisi user, seed dilewati.');
    }
  } finally {
    await db.close();
  }
}
