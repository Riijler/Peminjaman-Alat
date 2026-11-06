"use client";

import { useState, useSyncExternalStore } from "react";
import LoginScreen from "./components/LoginScreen";
import ManagementApp from "./components/ManagementApp";

function getSessionSnapshot() {
  const token = localStorage.getItem("peminjaman_token");
  const storedUser = localStorage.getItem("peminjaman_user");
  return token && storedUser ? `${token}\n${storedUser}` : "";
}

function parseSession(snapshot) {
  if (!snapshot) return null;

  const separator = snapshot.indexOf("\n");
  try {
    return {
      token: snapshot.slice(0, separator),
      user: JSON.parse(snapshot.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

function subscribeToSession(callback) {
  window.addEventListener("storage", callback);
  window.addEventListener("peminjaman-session-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("peminjaman-session-change", callback);
  };
}

export default function Home() {
  const sessionSnapshot = useSyncExternalStore(
    subscribeToSession,
    getSessionSnapshot,
    () => "",
  );
  const session = parseSession(sessionSnapshot);
  const [loginMessage, setLoginMessage] = useState("");

  function handleLogin(nextSession) {
    localStorage.setItem("peminjaman_token", nextSession.token);
    localStorage.setItem("peminjaman_user", JSON.stringify(nextSession.user));
    setLoginMessage("");
    window.dispatchEvent(new Event("peminjaman-session-change"));
  }

  function handleLogout(message = "") {
    localStorage.removeItem("peminjaman_token");
    localStorage.removeItem("peminjaman_user");
    window.dispatchEvent(new Event("peminjaman-session-change"));
    setLoginMessage(message);
  }

  return session ? (
    <ManagementApp session={session} onLogout={handleLogout} />
  ) : (
    <LoginScreen onLogin={handleLogin} initialMessage={loginMessage} />
  );
}
