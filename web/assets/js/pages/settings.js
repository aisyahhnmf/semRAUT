import { mountShell, applyTheme, toast } from "../core/shell.js";
import { settings, reports, pid } from "../core/store.js";

mountShell({ page: "settings", title: "Pengaturan", subtitle: "Tampilan dan preferensi" });

const s = settings.get();
const swatches = document.querySelectorAll(".swatch");
const mark = () => swatches.forEach((b) => b.classList.toggle("on", b.dataset.theme === settings.get().theme));

swatches.forEach((b) => (b.onclick = () => {
  settings.set({ theme: b.dataset.theme });
  applyTheme(); mark(); toast("Tema diterapkan");
}));

const mirror = document.getElementById("mirror");
mirror.checked = s.mirror;
mirror.onchange = () => { settings.set({ mirror: mirror.checked }); toast("Pengaturan disimpan"); };

const bahasa = document.getElementById("bahasa");
bahasa.value = s.bahasa;
bahasa.onchange = () => { settings.set({ bahasa: bahasa.value }); toast("Pengaturan disimpan"); };

document.getElementById("clearBtn").onclick = () => {
  if (confirm("Hapus seluruh riwayat laporan di browser ini?")) { reports.clear(); toast("Riwayat dihapus"); }
};
mark();

document.getElementById("pidText").textContent = pid();