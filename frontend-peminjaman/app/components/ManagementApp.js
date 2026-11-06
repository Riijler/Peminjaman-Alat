"use client";

import { useEffect, useState } from "react";
import { formatToday, requestApi, roleLabel } from "../lib/api";
import DashboardPage from "./DashboardPage";
import UserModal from "./UserModal";
import UsersPage from "./UsersPage";
import styles from "../dashboard.module.css";

const navigation = [
  { label: "Dashboard", available: true },
  { label: "Data User", available: true },
  { label: "Data Alat" },
  { label: "Data Kategori" },
  { label: "Data Peminjaman" },
  { label: "Data Pengembalian" },
  { label: "Log Aktivitas" },
];

export default function ManagementApp({ session, onLogout }) {
  const [activePage, setActivePage] = useState("Dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [recentLoans, setRecentLoans] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [userRole, setUserRole] = useState("semua");
  const [modalUser, setModalUser] = useState(null);
  const [refreshUsers, setRefreshUsers] = useState(0);

  useEffect(() => {
    if (activePage !== "Dashboard") return undefined;
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const [summary, loansResponse] = await Promise.all([
          requestApi("/dashboard", session.token),
          requestApi("/loans?limit=5", session.token),
        ]);
        if (!active) return;
        setDashboard(summary);
        setRecentLoans(loansResponse);
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      active = false;
    };
  }, [activePage, session.token]);

  useEffect(() => {
    if (activePage !== "Data User") return undefined;
    let active = true;

    async function loadUsers() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ limit: "100" });
      if (search.trim()) params.set("q", search.trim());
      if (userRole !== "semua") params.set("role", userRole);

      try {
        const data = await requestApi(`/users?${params}`, session.token);
        if (active) setUsers(data);
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadUsers();
    return () => {
      active = false;
    };
  }, [activePage, refreshUsers, search, session.token, userRole]);

  async function handleDeleteUser(user) {
    if (!window.confirm(`Hapus akun ${user.name} (${user.username})?`)) return;

    setError("");
    try {
      await requestApi(`/users/${user.id}`, session.token, { method: "DELETE" });
      setRefreshUsers((value) => value + 1);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function handleLogoutClick() {
    let message = "";
    try {
      await requestApi("/auth/logout", session.token, { method: "POST" });
    } catch (logoutError) {
      message = `Sesi lokal diakhiri. ${logoutError.message}`;
    }
    onLogout(message);
  }

  const isAdmin = session.user.role === "admin";
  const pageTitle = activePage === "Dashboard" ? "Ringkasan" : "Data User";
  const filteredUsers = users.filter((user) => {
    const term = search.trim().toLowerCase();
    return (
      !term ||
      user.name.toLowerCase().includes(term) ||
      user.username.toLowerCase().includes(term)
    );
  });

  return (
    <main className={styles.app}>
      <header className={styles.topbar}>
        <a
          className={styles.brand}
          href="#dashboard"
          onClick={(event) => {
            event.preventDefault();
            setActivePage("Dashboard");
          }}
        >
          <span className={styles.brandMark} aria-hidden="true">
            <span />
          </span>
          <span className={styles.brandName}>
            Aplikasi <span className={styles.brandAccent}>Peminjaman Alat</span>
          </span>
        </a>

        <div className={styles.account}>
          <div className={styles.accountText}>
            <strong>{session.user.name}</strong>
            <span>{roleLabel(session.user.role)}</span>
          </div>
          <span className={styles.avatar} aria-hidden="true">
            {session.user.name?.charAt(0).toUpperCase()}
          </span>
          <button className={styles.logoutButton} onClick={handleLogoutClick}>
            Keluar
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="Menu utama">
          <nav>
            {navigation.map((item) => {
              const isAvailable =
                item.available && (item.label !== "Data User" || isAdmin);
              return (
                <button
                  aria-current={activePage === item.label ? "page" : undefined}
                  className={`${styles.navItem} ${
                    activePage === item.label ? styles.navItemActive : ""
                  }`}
                  disabled={!isAvailable}
                  key={item.label}
                  onClick={() => setActivePage(item.label)}
                  title={isAvailable ? undefined : "Halaman ini belum tersedia"}
                  type="button"
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className={styles.content}>
          <div className={styles.pageHeading}>
            <div>
              <h1>{pageTitle}</h1>
              <p>
                {activePage === "Dashboard"
                  ? `${roleLabel(session.user.role)} · ${formatToday()}`
                  : "Kelola akun admin, petugas, dan peminjam."}
              </p>
            </div>
            {activePage === "Data User" && isAdmin && (
              <button
                className={styles.primaryButton}
                onClick={() => setModalUser({ mode: "create" })}
                type="button"
              >
                <span aria-hidden="true">＋</span> Tambah pengguna
              </button>
            )}
          </div>

          {error && (
            <p className={styles.errorBanner} role="alert">
              {error}
            </p>
          )}

          {activePage === "Dashboard" ? (
            <DashboardPage
              dashboard={dashboard}
              isLoading={loading}
              loans={recentLoans}
            />
          ) : activePage === "Data User" ? (
            <UsersPage
              isLoading={loading}
              onDelete={handleDeleteUser}
              onEdit={(user) => setModalUser({ mode: "edit", user })}
              onRoleChange={setUserRole}
              onSearch={setSearch}
              role={userRole}
              search={search}
              users={filteredUsers}
            />
          ) : (
            <div className={styles.placeholder}>
              <span className={styles.placeholderIcon} aria-hidden="true">
                ◈
              </span>
              <h2>{activePage}</h2>
              <p>Halaman ini belum tersedia.</p>
            </div>
          )}
        </section>
      </div>

      {modalUser && (
        <UserModal
          mode={modalUser.mode}
          onClose={() => setModalUser(null)}
          onSaved={() => {
            setModalUser(null);
            setRefreshUsers((value) => value + 1);
          }}
          session={session}
          user={modalUser.user}
        />
      )}
    </main>
  );
}
