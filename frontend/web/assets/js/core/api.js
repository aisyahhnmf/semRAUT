
import { CONFIG } from "./config.js";
import { getAuthHeaders } from "./auth.js";
import { mockReport } from "./mock.js";

const mockJobs = {};

// =====================================================
// CREATE SESSION
// =====================================================

export async function createSession({ role, pid, attempt, soal }) {
  const res = await fetch(`${CONFIG.apiBase}/api/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthHeaders()),
    },
    body: JSON.stringify({
      role,
      pid,
      attempt,
      questions: soal.map((s) => ({
        external_id: s.id,
        question_text: s.teks,
        competency_id: s.competency_id ?? null,
        competency: s.kompetensi ?? null,
        question_type: s.question_type ?? null,
      })),
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.detail || `Gagal membuat sesi (${res.status})`
    );
  }

  return res.json();
}

// =====================================================
// CREATE JOB
// =====================================================

export async function createJob({
  role,
  soal,
  blobs,
  bahasa = "id",
  attempt = 1,
  sessionId = null,
  sessionQuestions = [],
}) {
  if (CONFIG.mock) {
    const id = "demo" + Date.now().toString(36);
    mockJobs[id] = { t0: Date.now(), soal, attempt };
    return id;
  }

  if (!sessionId) {
    throw new Error("Session ID tidak ditemukan.");
  }

  if (!blobs.length || blobs.length !== sessionQuestions.length) {
    throw new Error("Jumlah video dan data pertanyaan tidak sesuai.");
  }

  const questions = soal.map((s, i) => ({
    question_text: s.teks,
    question_external_id: s.id,
    session_question_id: sessionQuestions[i]?.session_question_id,
    question_order: sessionQuestions[i]?.question_order,
  }));

  if (questions.some((q) => !q.session_question_id)) {
    throw new Error("ID pertanyaan sesi tidak ditemukan.");
  }

  const fd = new FormData();

  fd.append(
    "meta",
    JSON.stringify({
      session_id: sessionId,
      role,
      bahasa,
      attempt,
      questions,
    })
  );

  blobs.forEach((blob, i) => {
    fd.append("videos", blob, `q${i + 1}.webm`);
  });

  const res = await fetch(`${CONFIG.apiBase}/api/jobs`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: fd,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.detail || `Gagal mengirim video (${res.status})`
    );
  }

  const data = await res.json();

  if (!data.id) {
    throw new Error("Backend tidak mengembalikan ID job.");
  }

  return data.id;
}

// =====================================================
// GET JOB
// =====================================================

export async function getJob(id) {
  if (CONFIG.mock) {
    const m = mockJobs[id];

    if (!m) {
      throw new Error("Sesi demo tidak ditemukan (halaman dimuat ulang?)");
    }

    const p = Math.min((Date.now() - m.t0) / 4000, 1);
    const n = m.soal.length;

    return p < 1
      ? {
          status: "proses",
          progres: p,
          pesan: `Menganalisis pertanyaan ${Math.min(
            Math.floor(p * n) + 1,
            n
          )} dari ${n}`,
        }
      : {
          status: "selesai",
          progres: 1,
          hasil: mockReport(m.soal, m.attempt),
        };
  }

  const res = await fetch(`${CONFIG.apiBase}/api/jobs/${id}`, {
    headers: await getAuthHeaders(),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      error.detail || `Gagal membaca status (${res.status})`
    );
  }

  return res.json();
}

// =====================================================
// EVALUASI GROQ
// =====================================================

export async function evaluateSession(sessionId) {
  if (CONFIG.mock) {
    return null;
  }

  if (!sessionId) {
    throw new Error("Session ID tidak ditemukan untuk evaluasi.");
  }

  const res = await fetch(
    `${CONFIG.apiBase}/api/sessions/${encodeURIComponent(sessionId)}/evaluate`,
    {
      method: "POST",
      headers: await getAuthHeaders(),
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data.detail || `Evaluasi Groq gagal (${res.status})`
    );
  }

  if (!data.success) {
    throw new Error(
      data.message || "Evaluasi Groq tidak berhasil."
    );
  }

  return data;
}
