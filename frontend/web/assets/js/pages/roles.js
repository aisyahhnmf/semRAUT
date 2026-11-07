import { requireAuth } from "../core/auth.js";
await requireAuth();

import { mountShell } from "../core/shell.js";
import { loadRoles } from "../core/data.js";
import { reports } from "../core/store.js";
import { esc } from "../core/utils.js";

mountShell({ page: "roles", title: "Pilih Posisi", subtitle: "Pertanyaan dan rubrik mengikuti posisi yang Anda tuju" });

const grid = document.getElementById("roleGrid");
try {
  const roles = await loadRoles();
  grid.innerHTML = roles.map((r) => {
    const komp = [...new Set(r.soal.map((s) => s.kompetensi))];
    const n = reports.all().filter((x) => x.role === r.id).length;
    return `<article class="card role">
      <span class="chip">${esc(r.bidang)}</span>
      <h3>${esc(r.nama)}</h3>
      <p class="muted">${esc(r.deskripsi)}</p>
      <div class="chips">${komp.map((k) => `<span class="tag">${esc(k)}</span>`).join("")}</div>
      <p class="muted small">${r.soal.length} pertanyaan · ${n ? `${n} percobaan tersimpan` : "belum ada percobaan"}</p>
      <a class="btn primary" href="interview.html?role=${encodeURIComponent(r.id)}">Mulai latihan</a>
    </article>`;
  }).join("");
} catch (e) {
  grid.innerHTML = `<div class="card"><p class="muted">Gagal memuat daftar posisi: ${esc(e.message)}</p></div>`;
}