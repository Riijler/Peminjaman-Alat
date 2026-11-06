export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function isRealDate(s) {
  try {
    return new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  } catch {
    return false;
  }
}
