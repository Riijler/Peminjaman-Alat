"use client";

import { useState } from "react";
import { requestApi } from "../lib/api";
import styles from "../dashboard.module.css";

export default function UserModal({ mode, user, session, onClose, onSaved }) {
  const [name, setName] = useState(user?.name || "");
  const [username, setUsername] = useState(user?.username || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(user?.role || "admin");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = mode === "edit";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    const body = { name, username, role };
    if (password) body.password = password;

    try {
      const path = isEditing ? `/users/${user.id}` : "/users";
      const data = await requestApi(path, session.token, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      if (!data?.id) throw new Error("Data pengguna tidak tersimpan dengan benar.");
      onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <section
        aria-labelledby="user-modal-title"
        aria-modal="true"
        className={styles.modal}
        role="dialog"
      >
        <header className={styles.modalHeader}>
          <h2 id="user-modal-title">
            {isEditing ? "Ubah pengguna" : "Tambah pengguna"}
          </h2>
          <button
            aria-label="Tutup dialog"
            className={styles.closeButton}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <label className={styles.modalField}>
            <span>Nama lengkap</span>
            <input
              autoFocus
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className={styles.modalField}>
            <span>Username</span>
            <input
              autoComplete="off"
              maxLength={50}
              minLength={3}
              onChange={(event) => setUsername(event.target.value)}
              pattern="[a-zA-Z0-9_.-]+"
              required
              value={username}
            />
          </label>
          <label className={styles.modalField}>
            <span>{isEditing ? "Kata sandi baru (opsional)" : "Kata sandi"}</span>
            <input
              autoComplete="new-password"
              minLength={isEditing && !password ? undefined : 6}
              onChange={(event) => setPassword(event.target.value)}
              required={!isEditing}
              type="password"
              value={password}
            />
          </label>
          <label className={styles.modalField}>
            <span>Peran</span>
            <select onChange={(event) => setRole(event.target.value)} value={role}>
              <option value="admin">Admin</option>
              <option value="petugas">Petugas</option>
              <option value="peminjam">Peminjam</option>
            </select>
          </label>

          {error && (
            <p className={styles.modalError} role="alert">
              {error}
            </p>
          )}

          <div className={styles.modalActions}>
            <button
              className={styles.secondaryButton}
              disabled={isSaving}
              onClick={onClose}
              type="button"
            >
              Batal
            </button>
            <button
              className={styles.primaryButton}
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
