const KEY = { set: "semraut.settings", rep: "semraut.reports", pid: "semraut.pid" };
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const DEFAULTS = { theme: "langit", mirror: true, bahasa: "id" };

export const settings = {
  get: () => ({ ...DEFAULTS, ...read(KEY.set, {}) }),
  set: (patch) => write(KEY.set, { ...settings.get(), ...patch }),
};

// ID anonim per browser; tidak memuat nama atau identitas
export function pid() {
  let v = null;
  try { v = localStorage.getItem(KEY.pid); } catch {}
  if (!v) {
    v = "P-" + Math.random().toString(36).slice(2, 7).toUpperCase();
    try { localStorage.setItem(KEY.pid, v); } catch {}
  }
  return v;
}

export const reports = {
  all: () => read(KEY.rep, []),
  get: (id) => reports.all().find((r) => r.id === id),
  add: (r) => write(KEY.rep, [r, ...reports.all()].slice(0, 50)),
  clear: () => write(KEY.rep, []),
  nextAttempt: (role) => reports.all().filter((r) => r.role === role).length + 1,
  previous: (rep) => reports.all()
    .filter((r) => r.role === rep.role && r.attempt < rep.attempt)
    .sort((a, b) => b.attempt - a.attempt)[0],
};