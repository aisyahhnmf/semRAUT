import { CONFIG } from "./config.js";

// Teks contoh saja; pada mode nyata transkrip berasal dari Whisper.
const TEKS = [
  "Saya lulusan manajemen dengan pengalaman dua tahun mengoordinasikan proyek acara kampus dan magang di bidang operasional.",
  "Saya memeriksa data hilang dan duplikat terlebih dahulu, lalu memperbaikinya dengan imputasi dan dokumentasi yang jelas.",
  "Saya menjelaskan temuan dengan analogi sederhana dan mengaitkannya langsung dengan keputusan yang perlu diambil tim.",
  "Saat hasil tidak sesuai harapan, saya menelusuri penyebabnya, mengulang analisis, dan mencatat pelajaran untuk proyek berikutnya.",
];

const META = {
  menunduk: { nama: "Menunduk", bobot: 0.35, tol: 4,
    rujukan: "Kontak mata dan arah pandang: meta-analisis 'Speaking without words'; survei OfficeTeam",
    saran: (n) => `Anda terdeteksi menunduk lebih dari 5 detik sebanyak ${n} kali. Pada wawancara berikutnya, usahakan pandangan tetap mengarah ke pewawancara (kamera).`,
    baik: "Tidak ada kejadian menunduk yang berkepanjangan. Pertahankan arah pandang ke kamera." },
  menoleh: { nama: "Menoleh ke samping", bobot: 0.25, tol: 4,
    rujukan: "Gerakan kepala dan arah pandang: meta-analisis 'Speaking without words'",
    saran: (n) => `Wajah Anda terdeteksi menoleh ke samping lebih dari 4 detik sebanyak ${n} kali. Hadapkan wajah ke kamera agar terkesan menyimak.`,
    baik: "Arah wajah stabil menghadap kamera." },
  fokus_pandang: { nama: "Fokus pandangan ke kamera", bobot: 0.40, target: 0.7,
    rujukan: "Kontak mata: survei OfficeTeam; Naim dkk., IEEE Trans. Affective Computing",
    saran: (p) => `Pandangan Anda terarah ke kamera hanya ${p}% dari waktu (target 70%). Latih menatap kamera saat menjawab.`,
    baik: "Pandangan Anda cukup konsisten mengarah ke kamera." },
};

const aspekKejadian = (id, jumlah, ev = []) => {
  const m = META[id];
  return { id, nama: m.nama, tipe: "kejadian", bobot: m.bobot, rujukan: m.rujukan, jumlah, kejadian: ev,
    skor: Math.round(100 * Math.max(0, 1 - jumlah / m.tol)), saran: jumlah ? m.saran(jumlah) : m.baik };
};
const aspekRasio = (id, r) => {
  const m = META[id];
  return { id, nama: m.nama, tipe: "rasio", bobot: m.bobot, rujukan: m.rujukan, kejadian: [], rasio: +r.toFixed(3),
    skor: Math.round(Math.min(100, (100 * r) / m.target)), saran: r < m.target ? m.saran(Math.round(r * 100)) : m.baik };
};
const overall = (aspek) =>
  Math.round(aspek.reduce((s, a) => s + a.skor * a.bobot, 0) / aspek.reduce((s, a) => s + a.bobot, 0));
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const seg = (dur, good, labGood, labBad) => {
  const out = [], len = dur / 4;
  for (let k = 0; k < 4; k++) {
    const t = k * len, g = len * good;
    out.push([labGood, +t.toFixed(1), +(t + g).toFixed(1)], [labBad, +(t + g).toFixed(1), +(t + len).toFixed(1)]);
  }
  return out;
};

const DUR = [58, 72, 64, 49];
const EV1 = [[[12, 18.5]], [], [[8, 14]], [[20, 27]]];   // percobaan pertama: menunduk [mulai, selesai]
const EV2 = [[], [], [[8, 13]], []];                     // percobaan berikutnya
const MENOLEH1 = [0, 1, 0, 1], MENOLEH2 = [0, 0, 0, 0];
const FOKUS1 = [0.45, 0.55, 0.40, 0.50];
const DETEKSI1 = [0.96, 0.92, 0.88, 0.55];               // Q4 rendah: contoh "data tidak memadai"
const DETEKSI2 = [0.97, 0.95, 0.93, 0.94];
const BICARA = [[2.1, 48, 112, 1], [3.4, 62, 141, 2], [1.8, 55, 120, 0], [4.2, 40, 92, 3]]; // jeda awal, durasi, kata, jeda panjang
const BASE = [0.35, 0.6, 0.5, 0.45, 0.7, 0.4, 0.55, 0.5];

export function mockReport(soal, attempt = 1) {
  const first = attempt <= 1, up = Math.min(attempt - 1, 3) * 0.07;

  const pq = soal.map((s, i) => {
    const k = i % 4;
    const ev = (first ? EV1 : EV2)[k].map(([a, b]) => ({ mulai: a, selesai: b, durasi: +(b - a).toFixed(1) }));
    const evM = (first ? MENOLEH1 : MENOLEH2)[k] ? [{ mulai: 30, selesai: 35, durasi: 5 }] : [];
    const fokus = Math.min(0.95, FOKUS1[k] + up);
    const aspek = [aspekKejadian("menunduk", ev.length, ev), aspekKejadian("menoleh", evM.length, evM),
      aspekRasio("fokus_pandang", fokus)];
    const [jeda, dur, kata, panjang] = BICARA[k];
    const teks = TEKS[k];
    const kriteria = s.kriteria.map((c, j) => {
      const v = BASE[(i * 2 + j) % 8] + 0.12 * (attempt - 1);
      const status = v >= 0.65 ? "terpenuhi" : v >= 0.4 ? "sebagian" : "belum";
      return { teks: c.teks, bobot: c.bobot, status,
        bukti: status === "belum" ? "" : "“…" + teks.split(" ").slice(2 + j * 4, 10 + j * 4).join(" ") + "…”" };
    });
    return {
      no: i + 1, id: s.id, teks: s.teks, kompetensi: s.kompetensi,
      durasi: DUR[k], deteksi: (first ? DETEKSI1 : DETEKSI2)[k], skor: overall(aspek), aspek,
      timeline: {
        head: [...ev.map((e) => ["down", e.mulai, e.selesai]), ...evM.map((e) => ["left", e.mulai, e.selesai])],
        gaze: seg(DUR[k], fokus, "center", "left"),
      },
      bicara: { teks, jumlah_kata: kata, jeda_awal: jeda, durasi_bicara: dur,
        kata_per_menit: Math.round((kata / dur) * 60), jeda_panjang: panjang },
      rubrik: { kriteria },
    };
  });

  // Pertanyaan dengan deteksi rendah tidak ikut dihitung di ringkasan sesi
  const okQ = pq.filter((q) => q.deteksi >= CONFIG.minDeteksi);
  const use = okQ.length ? okQ : pq;
  const find = (q, id) => q.aspek.find((a) => a.id === id);
  const sum = (id) => use.reduce((t, q) => t + find(q, id).jumlah, 0);
  const mean = (id) => use.reduce((t, q) => t + find(q, id).rasio, 0) / use.length;
  const aspek = [aspekKejadian("menunduk", sum("menunduk")), aspekKejadian("menoleh", sum("menoleh")),
    aspekRasio("fokus_pandang", mean("fokus_pandang"))];

  const bukti = (a) => a.tipe === "kejadian"
    ? use.flatMap((q) => find(q, a.id).kejadian.map((e) => `Q${q.no} ${fmt(e.mulai)}–${fmt(e.selesai)}`)).join("; ")
    : use.map((q) => `Q${q.no} ${Math.round(find(q, a.id).rasio * 100)}%`).join(", ");

  const totalDur = pq.reduce((t, q) => t + q.durasi, 0);
  return {
    dibuat: new Date().toISOString().slice(0, 19),
    sesi: {
      skor: overall(aspek), aspek,
      deteksi: +(pq.reduce((t, q) => t + q.deteksi * q.durasi, 0) / totalDur).toFixed(3),
      saran: aspek.filter((a) => a.skor < 70).sort((a, b) => b.bobot - a.bobot).map((a) => ({ teks: a.saran, bukti: bukti(a) })),
      kekuatan: aspek.filter((a) => a.skor >= 85).map((a) => a.nama),
    },
    pertanyaan: pq,
  };
}