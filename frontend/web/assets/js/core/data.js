import { CONFIG } from "./config.js";

let cache = null;

// Mengambil daftar posisi dan pertanyaan aktif langsung dari backend/Supabase.
export async function loadRoles() {
  if (!cache) {
    const res = await fetch(`${CONFIG.apiBase}/api/roles`);
    if (!res.ok) {
      throw new Error(`Gagal memuat posisi dari server (${res.status})`);
    }

    const payload = await res.json();
    if (!payload.success || !Array.isArray(payload.data)) {
      throw new Error("Format data posisi dari server tidak sesuai");
    }

    cache = payload.data;
  }

  return cache;
}

export const findRole = async (id) =>
  (await loadRoles()).find((role) => role.id === id);
