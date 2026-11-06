import { roleLabel } from "../lib/api";
import styles from "../dashboard.module.css";

export default function UsersPage({
  users,
  search,
  onSearch,
  role,
  onRoleChange,
  onEdit,
  onDelete,
  isLoading,
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.userToolbar}>
        <label className={styles.searchField}>
          <span className={styles.visuallyHidden}>Cari pengguna</span>
          <span aria-hidden="true" className={styles.searchIcon}>
            ⌕
          </span>
          <input
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Cari nama atau username"
            type="search"
            value={search}
          />
        </label>
        <select
          aria-label="Filter peran"
          className={styles.filterSelect}
          onChange={(event) => onRoleChange(event.target.value)}
          value={role}
        >
          <option value="semua">Semua peran</option>
          <option value="admin">Admin</option>
          <option value="petugas">Petugas</option>
          <option value="peminjam">Peminjam</option>
        </select>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nama</th>
              <th>User</th>
              <th>Role</th>
              <th className={styles.actionsHeader}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.username}</td>
                <td>
                  <span className={`${styles.roleBadge} ${styles[user.role]}`}>
                    {roleLabel(user.role)}
                  </span>
                </td>
                <td className={styles.actions}>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => onEdit(user)}
                    type="button"
                  >
                    Ubah
                  </button>
                  <button
                    className={styles.deleteButton}
                    onClick={() => onDelete(user)}
                    type="button"
                  >
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && users.length === 0 && (
              <tr>
                <td className={styles.emptyCell} colSpan="4">
                  Tidak ada pengguna yang cocok.
                </td>
              </tr>
            )}
            {isLoading && (
              <tr>
                <td className={styles.emptyCell} colSpan="4">
                  Memuat data pengguna...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
