# Backend Aplikasi Peminjaman Alat

Express 5 + MySQL (`mysql2`) + JWT. Frontend React menyusul di `../frontend`.

## Jalankan

```bash
cd backend
npm install
# Jalankan database.sql lewat phpMyAdmin atau mysql CLI
cp .env.example .env
# Atur DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, dan JWT_SECRET (min 16 karakter)
npm run seed
npm run dev
npm test
```

`database.sql` membuat database dan seluruh tabel aplikasi. Schema tabel juga dibuat otomatis saat server/seed berjalan; database MySQL harus sudah dibuat dan user MySQL harus memiliki hak akses untuk membuat tabel. Akun contoh (ganti password sebelum dipakai sungguhan): `admin/admin123`, `petugas/petugas123`, `peminjam/peminjam123`.

### Pengujian dengan Postman

1. Buka aplikasi **Postman**.
2. Klik tombol **Import** lalu pilih file `postman_collection.json` yang ada di folder `backend/` (atau di root proyek).
3. Jalankan request **Auth > Login Admin** (atau Login Petugas / Login Peminjam). Token JWT otomatis tersimpan ke variabel koleksi `{{token}}` dan dipakai di semua request berikutnya.
4. Pastikan backend sedang berjalan (`npm run dev`) di `http://localhost:4000`.

`npm test` memakai database terpisah yang ditentukan oleh `DB_TEST_NAME` (default `peminjaman_alat_test`) dan akan menghapus seluruh data pada database tersebut sebelum tes. Buat database tes terlebih dahulu di MySQL jika ingin menjalankan test otomatis.

Kirim token di header: `Authorization: Bearer <token>`.
Respon sukses `{ data, meta? }`, error `{ error: { message, details? } }`.

## Endpoint per role (sesuai tabel fitur)

| Fitur | Role | Endpoint |
|---|---|---|
| Login / Logout | semua | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Dashboard ringkasan | semua | `GET /dashboard` |
| CRUD user | admin | `/users` (GET, POST, PUT /:id, DELETE /:id) |
| CRUD kategori | admin (lihat: semua) | `/categories` |
| CRUD alat | admin (lihat: semua) | `/tools` (`?q&category_id&available=true&page&limit`) |
| CRUD data peminjaman | admin | `/loans` (POST, PUT /:id saat pending, DELETE /:id) |
| CRUD pengembalian | admin | `/returns` (POST, PUT /:id saat pending, DELETE /:id) |
| Log aktifitas | admin | `GET /logs` (`?q&user_id&action&entity&from&to`) |
| Menyetujui peminjaman | petugas | `PATCH /loans/:id/approve`, `PATCH /loans/:id/reject` `{reason}` |
| Memantau pengembalian | petugas | `GET /returns?status=pending`, `PATCH /returns/:id/confirm` |
| Mencetak laporan | petugas | `GET /reports/loans?from&to&status&format=json\|csv` |
| Melihat daftar alat | peminjam | `GET /tools` |
| Mengajukan peminjaman | peminjam | `POST /loans` `{tool_id, quantity, due_date, note}` |
| Peminjaman saya | peminjam | `GET /loans` (otomatis hanya milik sendiri) |
| Mengembalikan alat | peminjam | `POST /returns` `{loan_id, item_condition, note}` |

`GET /loans` dan `GET /returns` otomatis difilter ke milik sendiri untuk peminjam.

## Aturan bisnis

- Peminjaman: `pending` → `approved` / `rejected`; setelah pengembalian dikonfirmasi → `returned`.
- Stok (`available`) berkurang saat **disetujui**, bukan saat diajukan. Dicek ulang saat approval.
- Pengembalian: peminjam mengajukan (`pending`), petugas konfirmasi. Saat konfirmasi: stok kembali, denda = hari telat × `FINE_PER_DAY`.
- Kondisi `hilang`: stok total berkurang, tidak dikembalikan ke `available`.
- Hapus peminjaman yang sedang berjalan akan mengembalikan stok. Pengembalian yang sudah dikonfirmasi terkunci.
- Semua aksi penting (login, CRUD, setuju/tolak, konfirmasi, cetak laporan) masuk `activity_logs`.

## Catatan

- Logout memakai JWT stateless: server mencatat log, **frontend wajib menghapus token**.
- Mau Admin juga boleh setujui peminjaman / cetak laporan? Tambah `'admin'` di `requireRole(...)` pada `routes/loans.js`, `routes/returns.js`, dan `app.js`.
