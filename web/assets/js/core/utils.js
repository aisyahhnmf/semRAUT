export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const fmtDate = (iso) => new Date(iso).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" });

export const STATUS = {
  terpenuhi: { t: "Terpenuhi", c: "good" },
  sebagian: { t: "Sebagian", c: "warn" },
  belum: { t: "Belum terpenuhi", c: "bad" },
};
const POIN = { terpenuhi: 1, sebagian: 0.5, belum: 0 };

// Ringkasan pemenuhan rubrik satu sesi (berbobot)
export function rubrikStat(rep) {
  const r = { terpenuhi: 0, sebagian: 0, belum: 0, total: 0, pct: null };
  let w = 0, s = 0;
  (rep.pertanyaan || []).forEach((q) => (q.rubrik?.kriteria || []).forEach((k) => {
    if (!(k.status in POIN)) return;
    r[k.status]++; r.total++; w += k.bobot; s += k.bobot * POIN[k.status];
  }));
  if (w) r.pct = Math.round((100 * s) / w);
  return r;
}

export const aspekOf = (rep, id) => rep.sesi.aspek.find((a) => a.id === id);