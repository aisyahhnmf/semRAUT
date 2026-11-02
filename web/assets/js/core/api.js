import { CONFIG } from "./config.js";
import { mockReport } from "./mock.js";

const mockJobs = {};

export async function createJob({ role, soal, blobs, bahasa = "id", attempt = 1 }) {
  if (CONFIG.mock) {
    const id = "demo" + Date.now().toString(36);
    mockJobs[id] = { t0: Date.now(), soal, attempt };
    return id;
  }
  const fd = new FormData();
  fd.append("meta", JSON.stringify({ pertanyaan: soal.map((s) => s.teks), bahasa, role }));
  blobs.forEach((b, i) => fd.append("videos", b, `q${i + 1}.webm`));
  const res = await fetch(`${CONFIG.apiBase}/api/jobs`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Gagal mengirim sesi (${res.status})`);
  return (await res.json()).id;
}

export async function getJob(id) {
  if (CONFIG.mock) {
    const m = mockJobs[id];
    if (!m) throw new Error("Sesi demo tidak ditemukan (halaman dimuat ulang?)");
    const p = Math.min((Date.now() - m.t0) / 4000, 1), n = m.soal.length;
    return p < 1
      ? { status: "proses", progres: p, pesan: `Menganalisis pertanyaan ${Math.min(Math.floor(p * n) + 1, n)} dari ${n}` }
      : { status: "selesai", progres: 1, hasil: mockReport(m.soal, m.attempt) };
  }
  const res = await fetch(`${CONFIG.apiBase}/api/jobs/${id}`);
  if (!res.ok) throw new Error(`Gagal membaca status (${res.status})`);
  return res.json();
}