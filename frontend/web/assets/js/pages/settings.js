
import { requireAuth } from "../core/auth.js";
import { mountShell, applyTheme, toast } from "../core/shell.js";
import { settings, reports } from "../core/store.js";

// =====================================================
// AUTHENTICATION
// =====================================================

const session = await requireAuth();

if (!session?.user?.id) {
  throw new Error("[SETTINGS] Pengguna belum terautentikasi.");
}

// =====================================================
// MOUNT SHELL
// =====================================================

await mountShell({
  page: "settings",
  title: "Pengaturan",
  subtitle: "Tampilan dan preferensi",
});

// =====================================================
// ACCOUNT ID
// =====================================================

const pidText = document.getElementById("pidText");

if (pidText) {
  pidText.textContent = session.user.id;
  console.log("[SETTINGS] Account ID:", session.user.id);
} else {
  console.error("[SETTINGS] Elemen #pidText tidak ditemukan.");
}

// =====================================================
// SETTINGS
// =====================================================

const s = settings.get();

// =====================================================
// THEME
// =====================================================

const swatches = document.querySelectorAll(".swatch");

function mark() {
  swatches.forEach((button) => {
    button.classList.toggle(
      "on",
      button.dataset.theme === settings.get().theme
    );
  });
}

swatches.forEach((button) => {
  button.onclick = () => {
    settings.set({
      theme: button.dataset.theme,
    });

    applyTheme();
    mark();

    toast("Tema diterapkan");
  };
});

// =====================================================
// MIRROR
// =====================================================

const mirror = document.getElementById("mirror");

if (mirror) {
  mirror.checked = s.mirror;

  mirror.onchange = () => {
    settings.set({
      mirror: mirror.checked,
    });

    toast("Pengaturan disimpan");
  };
}

// =====================================================
// BAHASA
// =====================================================

const bahasa = document.getElementById("bahasa");

if (bahasa) {
  bahasa.value = s.bahasa;

  bahasa.onchange = () => {
    settings.set({
      bahasa: bahasa.value,
    });

    toast("Pengaturan disimpan");
  };
}

// =====================================================
// CLEAR HISTORY
// =====================================================

const clearBtn = document.getElementById("clearBtn");

if (clearBtn) {
  clearBtn.onclick = () => {
    if (confirm("Hapus seluruh riwayat laporan di browser ini?")) {
      reports.clear();
      toast("Riwayat dihapus");
    }
  };
}

// =====================================================
// INITIALIZE
// =====================================================

mark();

console.log("[SETTINGS] Halaman pengaturan berhasil dimuat.");
