"use client";

import { useState } from "react";
import { requestApi } from "../lib/api";
import styles from "../page.module.css";

export default function LoginScreen({ onLogin, initialMessage }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [isError, setIsError] = useState(Boolean(initialMessage));
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setIsError(false);
    setIsLoading(true);

    try {
      const data = await requestApi("/auth/login", null, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      if (!data?.token || !data?.user) {
        throw new Error("Respons login tidak valid. Silakan coba lagi.");
      }

      onLogin(data);
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof TypeError
          ? "Tidak dapat menghubungi API. Pastikan backend aktif, NEXT_PUBLIC_API_URL benar, dan CLIENT_ORIGIN backend mengizinkan alamat frontend."
          : error.message,
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.ambientGlow} aria-hidden="true" />
      <section className={styles.loginCard} aria-labelledby="login-title">
        <div className={styles.brandMark} aria-hidden="true">
          <span />
        </div>

        <h1 id="login-title" className={styles.title}>
          Peminjaman Alat
        </h1>
        <p className={styles.subtitle}>
          Masuk untuk meminjam, menyetujui, atau mengelola alat.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Username</span>
            <input
              autoComplete="username"
              name="username"
              onChange={(event) => {
                setUsername(event.target.value);
                setMessage("");
              }}
              placeholder="Masukkan username"
              required
              value={username}
            />
          </label>

          <label className={styles.field}>
            <span>Password</span>
            <span className={styles.passwordInput}>
              <input
                autoComplete="current-password"
                name="password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setMessage("");
                }}
                placeholder="Masukkan password"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Sembunyikan password" : "Lihat password"}
                aria-pressed={showPassword}
                className={styles.passwordToggle}
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? "Sembunyikan" : "Lihat"}
              </button>
            </span>
          </label>

          <button className={styles.submitButton} disabled={isLoading} type="submit">
            {isLoading ? "Memverifikasi..." : "Masuk"}
          </button>

          <p
            aria-live="polite"
            className={`${styles.status} ${isError ? styles.statusError : ""}`}
            role={message ? "status" : undefined}
          >
            {message}
          </p>
        </form>
      </section>
    </main>
  );
}
