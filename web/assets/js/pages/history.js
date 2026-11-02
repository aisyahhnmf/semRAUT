import { mountShell } from "../core/shell.js";
import { reports } from "../core/store.js";
import { esc, fmtDate, rubrikStat } from "../core/utils.js";
import { lineChart, barChart } from "../core/charts.js";

mountShell({ page: "history", title: "Riwayat", subtitle: "Sesi latihan yang tersimpan di browser ini" });

const $ = (id) => document.getElementById(id);
const all = reports.all();
const v = (x, s = "") => (x == null ? "–" : x + s);
const asp = (r, id) => r.sesi?.aspek?.find((a) => a.id === id);
const fokus = (r) => { const x = asp(r, "fokus_pandang")?.rasio; return x == null ? null : Math.round(x * 100); };
const kali = (r, id) => asp(r, id)?.jumlah ?? null;

if (!all.length) {
  $("empty").hidden = false;
} else {
  $("wrap").hidden = false;
  const roles = [...new Map(all.filter((r) => r.role).map((r) => [r.role, r.roleNama || r.role])).entries()];
  $("roleSel").innerHTML = roles.map(([id, nm]) => `<option value="${esc(id)}">${esc(nm)}</option>`).join("");

  const draw = () => {
    const list = all.filter((r) => r.role === $("roleSel").value).sort((a, b) => a.attempt - b.attempt);
    if (!list.length) { $("chartA").innerHTML = $("chartB").innerHTML = `<p class="muted">Belum ada data.</p>`; return; }
    const labels = list.map((r) => "#" + r.attempt);
    $("chartA").innerHTML = lineChart(labels, [
      { n: "Pemenuhan rubrik", c: "var(--accent)", v: list.map((r) => rubrikStat(r).pct) },
      { n: "Fokus pandangan", c: "var(--tie)", v: list.map(fokus) },
    ], { ref: 70 });
    $("chartB").innerHTML = barChart(labels, [
      { n: "Menunduk lama", c: "var(--bad)", v: list.map((r) => kali(r, "menunduk")) },
      { n: "Menoleh lama", c: "var(--warn)", v: list.map((r) => kali(r, "menoleh")) },
    ]);
  };
  $("roleSel").onchange = draw;
  draw();

  $("tbl").innerHTML =
    `<tr><th>Tanggal</th><th>Posisi</th><th>Percobaan</th><th>Rubrik</th><th>Fokus pandang</th><th>Menunduk</th><th>Menoleh</th><th>Deteksi wajah</th><th></th></tr>` +
    all.map((r) => `<tr>
      <td>${fmtDate(r.dibuat)}</td><td>${esc(r.roleNama || "–")}</td><td>${r.attempt ?? "–"}</td>
      <td>${v(rubrikStat(r).pct, "%")}</td><td>${v(fokus(r), "%")}</td>
      <td>${v(kali(r, "menunduk"), "×")}</td><td>${v(kali(r, "menoleh"), "×")}</td>
      <td>${v(r.sesi?.deteksi == null ? null : Math.round(r.sesi.deteksi * 100), "%")}</td>
      <td><a class="btn" href="report.html?id=${encodeURIComponent(r.id)}">Buka</a></td></tr>`).join("");
}