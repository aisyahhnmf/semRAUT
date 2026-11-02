import { mountShell } from "../core/shell.js";
import { reports } from "../core/store.js";
import { CONFIG, MODEL_LABEL, TONE } from "../core/config.js";
import { BRAND } from "../core/brand.js";
import { esc, mmss, fmtDate, rubrikStat, aspekOf, STATUS } from "../core/utils.js";
import { lineChart, barChart } from "../core/charts.js";

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get("id");
const rep = id ? reports.get(id) : reports.all()[0];

mountShell({
  page: "report", title: "Laporan Latihan",
  subtitle: rep ? `${rep.roleNama || "Latihan"} · percobaan ke-${rep.attempt ?? 1} · ${fmtDate(rep.dibuat)}` : "",
});

const toneVar = (s) => (s == null ? "var(--muted)" : s >= 75 ? "var(--good)" : s >= 50 ? "var(--warn)" : "var(--bad)");
const toneOf = (lab) => (TONE.good.includes(lab) ? "good" : TONE.bad.includes(lab) ? "bad" : "warn");
const lowDet = (d) => d != null && d < CONFIG.minDeteksi;
const pct = (v) => (v == null ? null : Math.round(v * 100));
const asSaran = (s) => (typeof s === "string" ? { teks: s, bukti: "" } : s);

function ringkasan() {
  const r = rubrikStat(rep), det = rep.sesi.deteksi, low = lowDet(det);
  const part = (k, c) => `<i style="width:${(r[k] / r.total) * 100}%;background:var(--${c})"></i>`;
  const rub = r.total
    ? `<div class="muted small">Pemenuhan kriteria rubrik</div>
       <div class="big-pct">${r.pct}%</div>
       <div class="stackbar">${part("terpenuhi", "good")}${part("sebagian", "warn")}${part("belum", "bad")}</div>
       <div class="legend small muted">
         <span><i style="background:var(--good)"></i>${r.terpenuhi} terpenuhi</span>
         <span><i style="background:var(--warn)"></i>${r.sebagian} sebagian</span>
         <span><i style="background:var(--bad)"></i>${r.belum} belum</span></div>`
    : `<p class="muted">Evaluasi rubrik jawaban belum tersedia dari backend.</p>`;
  const kual = det == null ? "" : `<span class="badge ${low ? "warn" : "good"}">Wajah terdeteksi ${pct(det)}%</span>`;
  return `${rub}<div class="kual">${kual}</div>
    ${low ? `<p class="small muted">Deteksi wajah rendah, sehingga indikator visual perlu dibaca dengan hati-hati.</p>` : ""}
    <p class="muted small" style="margin-top:8px">ID anonim ${esc(rep.pid || "-")}</p>`;
}

function rubrikHtml() {
  const qs = rep.pertanyaan.filter((q) => q.rubrik?.kriteria?.length);
  if (!qs.length) return `<p class="muted">Evaluasi rubrik jawaban belum tersedia. Hubungkan modul penilai rubrik di backend.</p>`;
  return qs.map((q) => `
    <div class="rub-q">
      <div class="rub-head"><b>Q${q.no} · ${esc(q.kompetensi || "")}</b><span class="muted small">${esc(q.teks)}</span></div>
      ${q.rubrik.kriteria.map((k) => {
        const s = STATUS[k.status] || { t: k.status, c: "warn" };
        return `<div class="rub-row"><span class="badge ${s.c}">${s.t}</span>
          <div><div>${esc(k.teks)} <span class="muted small">(bobot ${Math.round(k.bobot * 100)}%)</span></div>
          ${k.bukti ? `<div class="muted small">${esc(k.bukti)}</div>` : ""}</div></div>`;
      }).join("")}
    </div>`).join("") +
    `<p class="muted small">Rubrik ditetapkan sebelum evaluasi. Hasil bersifat umpan balik latihan dan idealnya diperiksa penilai manusia.</p>`;
}

function aspekHtml() {
  return rep.sesi.aspek.map((a) => `
    <div class="aspek">
      <div class="aspek-head"><b>${esc(a.nama)}</b>
        <span class="muted small">${a.tipe === "kejadian" ? `${a.jumlah ?? 0} kejadian` : `${pct(a.rasio) ?? 0}% dari waktu`}</span>
        <b class="ml" style="color:${toneVar(a.skor)}">${a.skor ?? "–"}</b></div>
      <div class="bar"><i style="width:${a.skor ?? 0}%;background:${toneVar(a.skor)}"></i></div>
      <p class="small">${esc(a.saran)}</p>
      <p class="muted small">Rujukan: ${esc(a.rujukan)}</p>
    </div>`).join("") +
    `<p class="muted small" style="margin-top:10px">Angka 0–100 menunjukkan ketercapaian target latihan, bukan penilaian kelayakan.</p>`;
}

function trenFokusHtml() {
  const qs = rep.pertanyaan;
  const v = qs.map((q) => {
    const a = q.aspek.find((x) => x.id === "fokus_pandang");
    return a && a.rasio != null && !lowDet(q.deteksi) ? a.rasio * 100 : null;
  });
  return lineChart(qs.map((q) => "Q" + q.no), [{ n: "Fokus pandangan ke kamera", c: "var(--accent)", v }], { ref: 70 }) +
    `<p class="muted small">Garis putus-putus adalah target 70%. Pertanyaan dengan deteksi wajah di bawah ${Math.round(CONFIG.minDeteksi * 100)}% tidak digambar.</p>`;
}

function trenKepalaHtml() {
  const qs = rep.pertanyaan;
  const cnt = (q, key) => {
    const a = q.aspek.find((x) => x.id === key);
    return a && !lowDet(q.deteksi) ? a.jumlah ?? 0 : null;
  };
  return barChart(qs.map((q) => "Q" + q.no), [
    { n: "Menunduk lama", c: "var(--bad)", v: qs.map((q) => cnt(q, "menunduk")) },
    { n: "Menoleh lama", c: "var(--warn)", v: qs.map((q) => cnt(q, "menoleh")) },
  ]) + `<p class="muted small">Semakin sedikit kejadian, semakin sesuai dengan target latihan.</p>`;
}

function bandingHtml(prev) {
  const rows = [
    ["Pemenuhan rubrik (%)", (r) => rubrikStat(r).pct, true],
    ["Fokus pandangan ke kamera (%)", (r) => pct(aspekOf(r, "fokus_pandang")?.rasio), true],
    ["Menunduk lama (kali)", (r) => aspekOf(r, "menunduk")?.jumlah, false],
    ["Menoleh lama (kali)", (r) => aspekOf(r, "menoleh")?.jumlah, false],
  ];
  const body = rows.map(([nama, f, naikBaik]) => {
    const a = f(prev), b = f(rep);
    if (a == null || b == null) return `<tr><td>${nama}</td><td>${a ?? "–"}</td><td>${b ?? "–"}</td><td class="muted">–</td></tr>`;
    const d = b - a, ok = d === 0 ? null : naikBaik ? d > 0 : d < 0;
    const c = ok == null ? "var(--muted)" : ok ? "var(--good)" : "var(--bad)";
    return `<tr><td>${nama}</td><td>${a}</td><td>${b}</td><td style="color:${c};font-weight:700">${d > 0 ? "+" : ""}${d}</td></tr>`;
  }).join("");
  return `<div class="tw"><table class="tbl">
      <tr><th>Indikator</th><th>Percobaan ke-${prev.attempt}</th><th>Percobaan ke-${rep.attempt}</th><th>Selisih</th></tr>${body}</table></div>
    <p class="muted small" style="margin-top:8px">Perubahan ini hanya menunjukkan selisih indikator antar percobaan dan bukan bukti bahwa saran tertentu menjadi penyebabnya.</p>`;
}

function detail(q) {
  const low = lowDet(q.deteksi);
  const kej = q.aspek.flatMap((a) => (a.kejadian || []).map((e) => ({ nama: a.nama, ...e })));
  const rows = Object.entries(q.timeline || {}).map(([m, segs]) => `
    <div class="tl-row"><span class="small muted">${MODEL_LABEL[m] || m}</span>
      <div class="tl ${low ? "dim" : ""}">${segs.map(([lab, s, e]) =>
        `<i class="seg ${toneOf(lab)}" style="left:${(s / q.durasi) * 100}%;width:${Math.max(((e - s) / q.durasi) * 100, 0.6)}%" title="${esc(lab)} · ${s}–${e} dtk"></i>`).join("")}</div>
    </div>`).join("");
  const det = q.deteksi == null ? "" : low
    ? `<p class="warn-box">Wajah hanya terdeteksi ${pct(q.deteksi)}% dari durasi, sehingga indikator visual pertanyaan ini kurang andal dan tidak dihitung dalam ringkasan sesi. Bagian yang tidak terdeteksi bukan berarti ekspresi netral.</p>`
    : `<p class="muted small">Wajah terdeteksi ${pct(q.deteksi)}% dari durasi.</p>`;
  const b = q.bicara;
  const bicara = b ? `
    <h3>Cara bicara</h3>
    <div class="minis">
      <div class="mini"><span class="muted small">Jeda sebelum menjawab</span><b>${b.jeda_awal ?? "–"} dtk</b></div>
      <div class="mini"><span class="muted small">Kecepatan bicara</span><b>${b.kata_per_menit} kata/mnt</b></div>
      <div class="mini"><span class="muted small">Jeda panjang</span><b>${b.jeda_panjang}×</b></div>
      <div class="mini"><span class="muted small">Jumlah kata</span><b>${b.jumlah_kata}</b></div>
    </div>
    <h3>Transkrip</h3>
    <p class="transkrip">${esc(b.teks) || "<i>Tidak ada ucapan terdeteksi.</i>"}</p>`
    : `<h3>Transkrip</h3><p class="muted">Transkrip tidak tersedia. ${esc(q.bicara_error || "")}</p>`;
  return `
    <div class="qd-head">
      <p style="font-weight:700">${esc(q.teks)}</p>
      <p class="muted small">${esc(q.kompetensi || "")} · durasi ${mmss(q.durasi)}</p>
      ${det}
    </div>
    <div class="qd">
      <div>
        <h3>Garis waktu</h3>${rows}
        <div class="legend small muted">
          <span><i style="background:var(--good)"></i>Sesuai</span>
          <span><i style="background:var(--warn)"></i>Perlu perhatian</span>
          <span><i style="background:var(--bad)"></i>Kurang baik</span></div>
        <h3>Kejadian berkepanjangan</h3>
        ${kej.length ? `<ul class="kej">${kej.map((e) => `<li><b>${esc(e.nama)}</b> · ${mmss(e.mulai)}–${mmss(e.selesai)} (${String(e.durasi).replace(".", ",")} dtk)</li>`).join("")}</ul>`
          : `<p class="muted">Tidak ada kejadian berkepanjangan pada pertanyaan ini.</p>`}
      </div>
      <div>${bicara}</div>
    </div>`;
}

function transcript() {
  const L = [`LAPORAN LATIHAN · ${BRAND.name.join("")}`, `Posisi      : ${rep.roleNama || "-"}`,
    `Percobaan   : ke-${rep.attempt ?? 1}`, `ID anonim   : ${rep.pid || "-"}`, `Tanggal     : ${fmtDate(rep.dibuat)}`,
    "", "TRANSKRIP", "-".repeat(40)];
  rep.pertanyaan.forEach((q) => {
    L.push(`[Q${q.no}] ${q.teks}`, `Jawaban: ${q.bicara?.teks || "(tidak ada transkrip)"}`);
    if (q.bicara) L.push(`Jeda awal ${q.bicara.jeda_awal ?? "-"} dtk | ${q.bicara.kata_per_menit} kata/menit | ${q.bicara.jumlah_kata} kata`);
    L.push("");
  });
  return L.join("\n");
}

if (!rep) {
  $("empty").hidden = false;
} else {
  $("wrap").hidden = false;
  $("ringkas").innerHTML = ringkasan();
  $("saran").innerHTML = rep.sesi.saran.length
    ? rep.sesi.saran.map((s) => { const x = asSaran(s);
        return `<li>${esc(x.teks)}${x.bukti ? `<small class="muted">Bukti: ${esc(x.bukti)}</small>` : ""}</li>`; }).join("")
    : "<li>Tidak ada saran khusus. Pertahankan kebiasaan yang sudah baik.</li>";
  $("kekuatan").innerHTML = rep.sesi.kekuatan.map((k) => `<span class="chip">✓ ${esc(k)}</span>`).join("");
  $("rubrik").innerHTML = rubrikHtml();
  $("aspek").innerHTML = aspekHtml();
  $("trenFokus").innerHTML = trenFokusHtml();
  $("trenKepala").innerHTML = trenKepalaHtml();

  const prev = reports.previous(rep);
  if (prev) { $("banding").hidden = false; $("bandingBody").innerHTML = bandingHtml(prev); }

  const tabs = $("tabs");
  tabs.innerHTML = rep.pertanyaan.map((q, i) => `<button class="tab" data-i="${i}">Q${q.no}</button>`).join("");
  const show = (i) => {
    tabs.querySelectorAll(".tab").forEach((b, k) => b.classList.toggle("on", k === i));
    $("qDetail").innerHTML = detail(rep.pertanyaan[i]);
  };
  tabs.onclick = (e) => { const b = e.target.closest(".tab"); if (b) show(+b.dataset.i); };
  show(0);

  $("againLink").href = rep.role ? `interview.html?role=${encodeURIComponent(rep.role)}` : "roles.html";
  $("printBtn").onclick = () => window.print();
  $("txtBtn").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([transcript()], { type: "text/plain;charset=utf-8" }));
    a.download = `transkrip-${rep.id}.txt`;
    a.click();
  };
}