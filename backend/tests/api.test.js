import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/seed.js';
import { config as appConfig } from '../src/config.js';

const config = {
  ...appConfig,
  jwtSecret: 'test-secret-test-secret',
  jwtExpiresIn: '1h',
  clientOrigin: 'http://localhost:5173',
  finePerDay: 1000,
  loginRateLimit: 1000,
};

let server, base, db;
const tokens = {};

async function api(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data, headers: res.headers };
}

before(async () => {
  if (config.dbTestName.toLowerCase() === config.dbName.toLowerCase()) {
    throw new Error('DB_TEST_NAME harus berbeda dari DB_NAME agar database aplikasi tidak terhapus oleh tes.');
  }
  db = await createDb({ ...config, dbName: config.dbTestName });
  for (const table of ['activity_logs', 'returns', 'loans', 'tools', 'categories', 'users']) {
    await db.run(`DELETE FROM ${table}`);
    await db.run(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
  }
  await seedDatabase(db);
  server = createApp({ db, config }).listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
  for (const [u, p] of [['admin', 'admin123'], ['petugas', 'petugas123'], ['peminjam', 'peminjam123']]) {
    const r = await api('POST', '/auth/login', { body: { username: u, password: p } });
    assert.equal(r.status, 200);
    tokens[u] = r.data.data.token;
  }
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) await db.close();
});

test('login gagal & tanpa token ditolak', async () => {
  const bad = await api('POST', '/auth/login', { body: { username: 'admin', password: 'salah' } });
  assert.equal(bad.status, 401);
  const none = await api('GET', '/tools');
  assert.equal(none.status, 401);
  const invalid = await api('POST', '/auth/login', { body: {} });
  assert.equal(invalid.status, 422);
});

test('hak akses per role sesuai tabel fitur', async () => {
  assert.equal((await api('GET', '/users', { token: tokens.peminjam })).status, 403);
  assert.equal((await api('GET', '/users', { token: tokens.petugas })).status, 403);
  assert.equal((await api('GET', '/users', { token: tokens.admin })).status, 200);
  assert.equal((await api('GET', '/logs', { token: tokens.petugas })).status, 403);
  assert.equal((await api('GET', '/reports/loans', { token: tokens.admin })).status, 403);
  assert.equal((await api('GET', '/reports/loans', { token: tokens.petugas })).status, 200);
  assert.equal(
    (await api('POST', '/tools', { token: tokens.petugas, body: { category_id: 1, name: 'X', stock: 1 } })).status,
    403
  );
  assert.equal((await api('GET', '/tools', { token: tokens.peminjam })).status, 200);
});

test('admin CRUD kategori, alat, user', async () => {
  const t = tokens.admin;
  const cat = await api('POST', '/categories', { token: t, body: { name: 'Lab' } });
  assert.equal(cat.status, 201);
  assert.equal((await api('POST', '/categories', { token: t, body: { name: 'lab' } })).status, 409);

  const tool = await api('POST', '/tools', { token: t, body: { category_id: cat.data.data.id, name: 'Mikroskop', stock: 4 } });
  assert.equal(tool.status, 201);
  assert.equal(tool.data.data.available, 4);
  // kategori dipakai alat -> tidak bisa dihapus
  assert.equal((await api('DELETE', `/categories/${cat.data.data.id}`, { token: t })).status, 409);
  const upd = await api('PUT', `/tools/${tool.data.data.id}`, { token: t, body: { stock: 6 } });
  assert.equal(upd.data.data.available, 6);
  assert.equal((await api('DELETE', `/tools/${tool.data.data.id}`, { token: t })).status, 200);
  assert.equal((await api('DELETE', `/categories/${cat.data.data.id}`, { token: t })).status, 200);

  const u = await api('POST', '/users', { token: t, body: { name: 'Budi', username: 'budi', password: 'rahasia1', role: 'peminjam' } });
  assert.equal(u.status, 201);
  assert.equal(u.data.data.password_hash, undefined);
  assert.equal((await api('DELETE', `/users/${u.data.data.id}`, { token: t })).status, 200);
  // admin terakhir / akun sendiri
  assert.equal((await api('DELETE', '/users/1', { token: t })).status, 400);
});

test('alur peminjaman: ajukan -> setujui -> kembalikan -> konfirmasi (+denda & stok)', async () => {
  const stock = () => db.one("SELECT available, stock FROM tools WHERE name = 'Proyektor'");
  const toolId = (await db.one("SELECT id FROM tools WHERE name = 'Proyektor'")).id; // stok 3
  assert.equal((await stock()).available, 3);

  // validasi stok & tanggal
  const tooMany = await api('POST', '/loans', { token: tokens.peminjam, body: { tool_id: toolId, quantity: 9, due_date: '2030-01-01' } });
  assert.equal(tooMany.status, 400);
  const badDate = await api('POST', '/loans', { token: tokens.peminjam, body: { tool_id: toolId, loan_date: '2030-02-01', due_date: '2030-01-01' } });
  assert.equal(badDate.status, 400);
  assert.equal((await api('POST', '/loans', { token: tokens.petugas, body: { tool_id: toolId, due_date: '2030-01-01' } })).status, 403);

  const loan = await api('POST', '/loans', {
    token: tokens.peminjam,
    body: { tool_id: toolId, quantity: 2, loan_date: '2020-01-01', due_date: '2020-01-03' },
  });
  assert.equal(loan.status, 201);
  assert.equal(loan.data.data.status, 'pending');
  const id = loan.data.data.id;
  assert.equal((await stock()).available, 3); // belum dikurangi

  // admin tidak menyetujui (hanya petugas)
  assert.equal((await api('PATCH', `/loans/${id}/approve`, { token: tokens.admin })).status, 403);
  assert.equal((await api('PATCH', `/loans/${id}/approve`, { token: tokens.petugas })).status, 200);
  assert.equal((await stock()).available, 1);
  assert.equal((await api('PATCH', `/loans/${id}/approve`, { token: tokens.petugas })).status, 409);

  // belum disetujui / sudah diajukan
  const ret = await api('POST', '/returns', { token: tokens.peminjam, body: { loan_id: id, returned_at: '2020-01-10' } });
  assert.equal(ret.status, 201);
  assert.equal(ret.data.data.status, 'pending');
  assert.equal((await api('POST', '/returns', { token: tokens.peminjam, body: { loan_id: id } })).status, 409);

  const conf = await api('PATCH', `/returns/${ret.data.data.id}/confirm`, { token: tokens.petugas });
  assert.equal(conf.status, 200);
  assert.equal(conf.data.data.fine, 7000); // telat 7 hari x 1000
  assert.equal((await stock()).available, 3);
  const after = await api('GET', `/loans/${id}`, { token: tokens.peminjam });
  assert.equal(after.data.data.status, 'returned');
});

test('tolak peminjaman & alat hilang mengurangi stok', async () => {
  const toolId = (await db.one("SELECT id FROM tools WHERE name = 'Laptop'")).id; // stok 5
  const l1 = await api('POST', '/loans', { token: tokens.peminjam, body: { tool_id: toolId, due_date: '2030-01-01' } });
  const rej = await api('PATCH', `/loans/${l1.data.data.id}/reject`, { token: tokens.petugas, body: { reason: 'Sedang servis' } });
  assert.equal(rej.data.data.status, 'rejected');
  assert.equal(rej.data.data.reject_reason, 'Sedang servis');

  const l2 = await api('POST', '/loans', { token: tokens.peminjam, body: { tool_id: toolId, due_date: '2030-01-01' } });
  await api('PATCH', `/loans/${l2.data.data.id}/approve`, { token: tokens.petugas });
  const r = await api('POST', '/returns', { token: tokens.peminjam, body: { loan_id: l2.data.data.id, item_condition: 'hilang' } });
  await api('PATCH', `/returns/${r.data.data.id}/confirm`, { token: tokens.petugas });
  const t = await db.one('SELECT stock, available FROM tools WHERE id = ?', [toolId]);
  assert.deepEqual({ ...t }, { stock: 4, available: 4 });
});

test('peminjam hanya melihat data miliknya', async () => {
  const other = await api('POST', '/users', { token: tokens.admin, body: { name: 'Sari', username: 'sari', password: 'rahasia1', role: 'peminjam' } });
  const login = await api('POST', '/auth/login', { body: { username: 'sari', password: 'rahasia1' } });
  const list = await api('GET', '/loans', { token: login.data.data.token });
  assert.equal(list.data.data.length, 0);
  const someLoan = (await db.one('SELECT id FROM loans LIMIT 1')).id;
  assert.equal((await api('GET', `/loans/${someLoan}`, { token: login.data.data.token })).status, 404);
  assert.ok(other.data.data.id);
});

test('laporan JSON/CSV, dashboard, dan log aktifitas', async () => {
  const rep = await api('GET', '/reports/loans?status=returned', { token: tokens.petugas });
  assert.equal(rep.status, 200);
  assert.ok(rep.data.summary.total >= 2);
  assert.ok(rep.data.summary.total_fines >= 7000);
  const csv = await api('GET', '/reports/loans?format=csv', { token: tokens.petugas });
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.data, /peminjam,alat/);

  for (const role of ['admin', 'petugas', 'peminjam']) {
    assert.equal((await api('GET', '/dashboard', { token: tokens[role] })).status, 200);
  }
  const logs = await api('GET', '/logs?action=setujui_peminjaman', { token: tokens.admin });
  assert.ok(logs.data.meta.total >= 2);
  assert.equal((await api('POST', '/auth/logout', { token: tokens.peminjam })).status, 200);
});
