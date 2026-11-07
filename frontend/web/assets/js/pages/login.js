
import {
  signUp,
  signIn,
  isSupabaseConfigured,
  redirectIfAuthenticated,
} from "../core/auth.js";

const $ = (id) => document.getElementById(id);

const form = $("authForm");
const message = $("authMessage");

let mode = "login";

// =====================================================
// MESSAGE
// =====================================================

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = `auth-message ${type}`.trim();
}

// =====================================================
// LOADING
// =====================================================

function setLoading(loading) {
  const button = $("submitBtn");

  button.disabled = loading;

  button.textContent = loading
    ? mode === "register"
      ? "Membuat akun..."
      : "Memproses..."
    : mode === "register"
      ? "Buat akun"
      : "Masuk";
}

// =====================================================
// SWITCH MODE
// =====================================================

function setMode(nextMode) {
  mode = nextMode;

  const registering = mode === "register";

  $("loginTab").classList.toggle("active", !registering);
  $("registerTab").classList.toggle("active", registering);

  $("formTitle").textContent = registering
    ? "Buat akun semRAUT"
    : "Masuk ke akunmu";

  $("formSubtitle").textContent = registering
    ? "Daftar untuk menyimpan dan melanjutkan riwayat latihanmu."
    : "Lanjutkan latihan wawancaramu bersama semRAUT.";

  $("nameWrap").hidden = !registering;
  $("fullName").required = registering;

  $("confirmWrap").hidden = !registering;
  $("confirmPassword").required = registering;

  $("password").autocomplete = registering
    ? "new-password"
    : "current-password";

  $("password").placeholder = registering
    ? "Minimal 8 karakter"
    : "Masukkan password";

  $("submitBtn").textContent = registering
    ? "Buat akun"
    : "Masuk";

  $("switchPrompt").textContent = registering
    ? "Sudah punya akun?"
    : "Belum punya akun?";

  $("switchMode").textContent = registering
    ? "Masuk sekarang"
    : "Daftar sekarang";

  showMessage("");
}

// =====================================================
// BUTTON EVENTS
// =====================================================

$("loginTab").addEventListener("click", () => {
  setMode("login");
});

$("registerTab").addEventListener("click", () => {
  setMode("register");
});

$("switchMode").addEventListener("click", () => {
  setMode(mode === "login" ? "register" : "login");
});

// =====================================================
// TOGGLE PASSWORD
// =====================================================

$("togglePassword").addEventListener("click", () => {
  const input = $("password");

  input.type = input.type === "password"
    ? "text"
    : "password";

  $("togglePassword").textContent =
    input.type === "password" ? "Lihat" : "Sembunyikan";
});

// =====================================================
// INITIALIZATION
// =====================================================

if (!form) {
  console.error("[AUTH] Form authForm tidak ditemukan.");
} else if (!isSupabaseConfigured()) {
  showMessage("Konfigurasi Supabase belum lengkap.", "error");
  $("submitBtn").disabled = true;
} else {
  await redirectIfAuthenticated();
}

// =====================================================
// FORM SUBMISSION
// =====================================================

form.addEventListener("submit", async (event) => {

  // MENCEGAH FORM DIKIRIM KE URL
  event.preventDefault();

  if (!isSupabaseConfigured()) {
    showMessage("Supabase belum dikonfigurasi.", "error");
    return;
  }

  const email = $("email").value.trim().toLowerCase();
  const fullName = $("fullName").value.trim();
  const password = $("password").value;
  const confirmPassword = $("confirmPassword").value;

  // =================================================
  // VALIDATION
  // =================================================

  if (!email) {
    showMessage("Masukkan alamat email.", "error");
    return;
  }

  if (!password) {
    showMessage("Masukkan password.", "error");
    return;
  }

  if (mode === "register") {

    if (fullName.length < 2) {
      showMessage(
        "Nama lengkap minimal 2 karakter.",
        "error"
      );
      return;
    }

    if (password.length < 8) {
      showMessage(
        "Password minimal 8 karakter.",
        "error"
      );
      return;
    }

    if (password !== confirmPassword) {
      showMessage(
        "Konfirmasi password belum sama.",
        "error"
      );
      return;
    }
  }

  // =================================================
  // SUBMIT
  // =================================================

  setLoading(true);
  showMessage("");

  try {

    // REGISTER
    if (mode === "register") {

      const data = await signUp({
        name: fullName,
        email,
        password,
      });

      if (data.session && data.user?.email_confirmed_at) {

        showMessage(
          "Akun berhasil dibuat. Mengarahkan ke dashboard...",
          "success"
        );

        location.replace("index.html");

      } else {

        showMessage(
          "Pendaftaran berhasil! Silakan cek email dan klik tautan verifikasi sebelum login.",
          "success"
        );

        $("email").value = email;
        $("password").value = "";
        $("confirmPassword").value = "";

        setMode("login");
      }

    } else {

      // LOGIN
      await signIn({
        email,
        password,
      });

      showMessage(
        "Login berhasil! Mengarahkan ke dashboard...",
        "success"
      );

      location.replace("index.html");
    }

  } catch (error) {

    console.error("[AUTH ERROR]", error);

    showMessage(
      error.message || "Terjadi kesalahan saat autentikasi.",
      "error"
    );

  } finally {

    setLoading(false);
  }
});

// =====================================================
// DEFAULT MODE
// =====================================================

setMode("login");

console.log("[AUTH] Login JavaScript berhasil dimuat.");
