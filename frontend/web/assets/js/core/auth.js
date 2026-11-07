
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =====================================================
// SUPABASE CONFIGURATION
// =====================================================

const SUPABASE_URL =
  "https://vawpajykzkcdjmlxverl.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_6U2rV56Acn6hNdPaS1DauA_x4ZQUCMt";

// =====================================================
// INITIALIZE SUPABASE
// =====================================================

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
  }
);

// =====================================================
// HELPER
// =====================================================

function getLoginURL() {
  return new URL("./login.html", location.href).href;
}

function getDashboardURL() {
  return new URL("./index.html", location.href).href;
}

// =====================================================
// CONFIGURATION CHECK
// =====================================================

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// =====================================================
// REGISTER
// =====================================================

export async function signUp({ name, email, password }) {
  if (!name || !email || !password) {
    throw new Error("Semua kolom wajib diisi.");
  }

  if (password.length < 8) {
    throw new Error("Password minimal 8 karakter.");
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        full_name: name.trim(),
      },
      emailRedirectTo: getLoginURL(),
    },
  });

  if (error) throw error;

  return data;
}

// =====================================================
// LOGIN
// =====================================================

export async function signIn({ email, password }) {
  if (!email || !password) {
    throw new Error("Email dan password wajib diisi.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) throw error;

  if (!data.user?.email_confirmed_at) {
    await supabase.auth.signOut();

    throw new Error(
      "Email belum diverifikasi. Silakan periksa inbox email kamu."
    );
  }

  localStorage.setItem("semraut.auth.uid", data.user.id);
  localStorage.setItem("semraut.auth.email", data.user.email || "");

  return data;
}

// =====================================================
// GET CURRENT SESSION
// =====================================================

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  return data.session;
}

// =====================================================
// GET CURRENT USER
// =====================================================

export async function getCurrentUser() {
  const session = await getCurrentSession();

  return session?.user || null;
}

// =====================================================
// REQUIRE AUTH
// =====================================================

export async function requireAuth() {
  try {
    const session = await getCurrentSession();

    if (!session?.user) {
      location.replace(getLoginURL());
      return null;
    }

    if (!session.user.email_confirmed_at) {
      await supabase.auth.signOut();
      location.replace(getLoginURL());
      return null;
    }

    localStorage.setItem("semraut.auth.uid", session.user.id);
    localStorage.setItem(
      "semraut.auth.email",
      session.user.email || ""
    );

    return session;
  } catch (error) {
    console.error("[AUTH] Session error:", error);
    location.replace(getLoginURL());
    return null;
  }
}

// =====================================================
// REDIRECT IF ALREADY AUTHENTICATED
// =====================================================

export async function redirectIfAuthenticated() {
  try {
    const session = await getCurrentSession();

    if (session?.user?.email_confirmed_at) {
      location.replace(getDashboardURL());
      return session;
    }

    return null;
  } catch (error) {
    console.error("[AUTH] Session check:", error);
    return null;
  }
}

// =====================================================
// RESET PASSWORD
// =====================================================

export async function resetPassword(email) {
  if (!email) {
    throw new Error("Masukkan email terlebih dahulu.");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    {
      redirectTo: new URL("./reset-password.html", location.href).href,
    }
  );

  if (error) throw error;
}

// =====================================================
// UPDATE PASSWORD
// =====================================================

export async function updatePassword(newPassword) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error("Password minimal 8 karakter.");
  }

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) throw error;

  return data;
}

// =====================================================
// SIGN OUT
// =====================================================

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) throw error;

  localStorage.removeItem("semraut.auth.uid");
  localStorage.removeItem("semraut.auth.email");
  localStorage.removeItem("semraut.pid");

  location.replace(getLoginURL());
}

// =====================================================
// AUTH HEADERS FOR FASTAPI
// =====================================================

export async function getAuthHeaders() {
  const session = await getCurrentSession();

  if (!session?.access_token) {
    throw new Error(
      "Sesi login tidak ditemukan. Silakan login kembali."
    );
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

// =====================================================
// AUTH STATE LISTENER
// =====================================================

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    if (typeof callback === "function") {
      callback(event, session);
    }
  });
}
