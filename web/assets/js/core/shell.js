import { BRAND, LOGO } from "./brand.js";
import { settings, pid } from "./store.js";

const ICON = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  roles: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  report: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  history: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
};

const NAV = [
  { id: "home", label: "Beranda", href: "index.html" },
  { id: "roles", label: "Latihan", href: "pages/roles.html" },
  { id: "report", label: "Laporan", href: "pages/report.html" },
  { id: "history", label: "Riwayat", href: "pages/history.html" },
  { id: "settings", label: "Pengaturan", href: "pages/settings.html" },
];

export const applyTheme = () => { document.documentElement.dataset.theme = settings.get().theme; };

export function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.append(t); }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2600);
}

// compact: header ramping untuk halaman satu frame; back: alamat tombol kembali (opsional)
export function mountShell({ page, title, subtitle = "", compact = false, back = "" }) {
  applyTheme();
  const root = document.body.dataset.root || "";
  const [a, b] = BRAND.name;
  const wordmark = b ? `<span class="w1">${a}</span><span class="w2">${b}</span>` : `<span class="w2">${a}</span>`;
  const nav = NAV.map((n) =>
    `<a href="${root}${n.href}" class="${n.id === page ? "on" : ""}"><svg viewBox="0 0 24 24">${ICON[n.id]}</svg><span>${n.label}</span></a>`).join("");
  const backBtn = back
    ? `<a class="icon-btn" href="${back}" title="Kembali" aria-label="Kembali"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></a>`
    : "";

  document.body.insertAdjacentHTML("afterbegin", `
    <div class="app">
      <aside class="side">
        <a class="brand" href="${root}index.html">
          <span class="logo">${LOGO}</span>
          <span><span class="wordmark">${wordmark}</span><span class="tagline">${BRAND.tagline}</span></span>
        </a>
        <nav class="nav">${nav}</nav>
        <div class="pid small muted">ID anonim<br><b>${pid()}</b></div>
      </aside>
      <div class="main${compact ? " compact" : ""}">
        <header class="top">
          ${backBtn}
          <div class="top-title"><h1>${title}</h1><div class="muted small">${subtitle}</div></div>
          <div class="top-actions" id="topActions"></div>
        </header>
        <main id="view"></main>
      </div>
    </div>`);
  document.getElementById("view").append(document.getElementById("content"));
  document.title = `${title} · ${BRAND.name.join("")}`;
}