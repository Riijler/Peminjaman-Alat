const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export async function requestApi(path, token, options = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${apiUrl}${path}`, { ...options, headers });
  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("Respons server tidak valid. Coba lagi beberapa saat.");
  }

  if (!response.ok) {
    throw new Error(result.error?.message || `Permintaan gagal (${response.status}).`);
  }

  return result.data;
}

export function roleLabel(role) {
  return { admin: "Admin", petugas: "Petugas", peminjam: "Peminjam" }[role] || role;
}

export function formatDate(value) {
  return value ? String(value).slice(0, 10) : "—";
}

export function formatToday() {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function loanStatus(status) {
  return {
    approved: "Dipinjam",
    pending: "Menunggu",
    returned: "Selesai",
    rejected: "Ditolak",
  }[status] || status;
}
