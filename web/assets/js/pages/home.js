import { mountShell } from "../core/shell.js";
import { reports } from "../core/store.js";
import { fmtDate, rubrikStat } from "../core/utils.js";

mountShell({ page: "home", title: "Beranda", subtitle: "Latihan wawancara dengan umpan balik berbasis kamera" });

const last = reports.all()[0];
if (last) {
  const p = rubrikStat(last).pct;
  document.getElementById("lastCard").hidden = false;
  document.getElementById("lastRole").textContent = last.roleNama || "Latihan";
  document.getElementById("lastScore").textContent = p == null ? "–" : p + "%";
  document.getElementById("lastDate").textContent = fmtDate(last.dibuat);
  document.getElementById("lastLink").href = `pages/report.html?id=${last.id}`;
}