import { requireAuth } from "../core/auth.js";
await requireAuth();


import { mountShell, toast } from "../core/shell.js";
import { CONFIG } from "../core/config.js";
import { findRole } from "../core/data.js";
import { settings, reports, pid } from "../core/store.js";
import {
  createSession,
  createJob,
  getJob,
  evaluateSession
} from "../core/api.js";
import { esc } from "../core/utils.js";

// =====================================================
// DATA ROLE DAN PERTANYAAN
// =====================================================

const role = await findRole(
  new URLSearchParams(location.search).get("role")
);

if (!role) {
  location.replace("roles.html");
  await new Promise(() => {});
}

const attempt = reports.nextAttempt(role.id);
const soal = role.soal;
const Q = soal.map((s) => s.teks);

// Simpan PID agar konsisten selama satu sesi
const participantId = pid();

mountShell({
  page: "roles",
  title: role.nama,
  subtitle: `Percobaan ke-${attempt} · ${Q.length} pertanyaan`,
  compact: true,
  back: "roles.html"
});

const $ = (id) => document.getElementById(id);

// =====================================================
// STATE
// =====================================================

let stream = null;
let rec = null;
let chunks = [];
let clips = [];

let qi = 0;
let sec = 0;
let timer = null;

let running = false;
let busy = false;

// Data session dari backend
let sessionData = null;

// =====================================================
// UTILITIES
// =====================================================

const two = (n) => String(n).padStart(2, "0");

const mmss = (s) =>
  `${two(Math.floor(s / 60))}:${two(s % 60)}`;

// =====================================================
// RENDER TOP ACTIONS
// =====================================================

function renderTop(label) {
  $("topActions").innerHTML = running
    ? `<button class="btn" id="endBtn">Akhiri sesi</button>
       <span class="pill live"><i></i>${stream ? "Merekam" : "Sesi berjalan"}</span>`
    : `<span class="pill idle">${label || "Belum merekam"}</span>`;

  if ($("endBtn")) {
    $("endBtn").onclick = endEarly;
  }
}

// =====================================================
// RENDER PERTANYAAN
// =====================================================

function renderSide() {
  const total = Q.length;

  $("qCount").textContent = running
    ? `${qi + 1}/${total}`
    : `${total} pertanyaan`;

  $("prog").style.width =
    (running ? (qi / total) * 100 : 0) + "%";

  $("nextBtn").textContent =
    qi >= total - 1
      ? "Selesaikan sesi"
      : "Pertanyaan berikutnya";

  if (!running) {
    $("qBody").innerHTML = `
      <div class="intro">
        <b>Siap berlatih?</b>
        <p class="muted">
          ${total} pertanyaan akan muncul satu per satu setelah sesi dimulai.
          Jawab seperti pada wawancara sebenarnya, lalu tekan tombol lanjut
          saat selesai menjawab.
        </p>
      </div>
    `;

    return;
  }

  const done = Q.slice(0, qi)
    .map((t, i) => `
      <div class="qcard done">
        <span class="qnum">${two(i + 1)}</span>
        <p>${esc(t)}</p>
        <span class="qdone">✓</span>
      </div>
    `)
    .join("");

  const cur = `
    <div class="qcard on">
      <span class="qnum">${two(qi + 1)}</span>
      <p>${esc(Q[qi])}</p>
    </div>
  `;

  const left = total - qi - 1;

  const lock = left > 0
    ? `<p class="muted small qlock">
         ${left} pertanyaan berikutnya akan muncul setelah Anda lanjut.
       </p>`
    : "";

  $("qBody").innerHTML = done + cur + lock;
}

// =====================================================
// KAMERA
// =====================================================

async function openCam() {
  if (stream) return true;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 960 },
        height: { ideal: 540 }
      },
      audio: true
    });

  } catch (error) {
    console.error("[CAMERA]", error);
    return false;
  }

  const cam = $("cam");

  cam.srcObject = stream;
  cam.style.display = "block";

  // Mirror hanya untuk preview
  cam.style.transform = settings.get().mirror
    ? "scaleX(-1)"
    : "none";

  $("ph").hidden = true;

  return true;
}

// =====================================================
// VIDEO RECORDING
// =====================================================

function startRec() {
  chunks = [];

  if (!stream) return;

  try {
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

    rec = new MediaRecorder(stream, { mimeType });

    rec.ondataavailable = (e) => {
      if (e.data.size) {
        chunks.push(e.data);
      }
    };

    rec.start();

  } catch (error) {
    console.error("[RECORDING START ERROR]", error);
    throw new Error("Tidak dapat memulai perekaman video.");
  }
}

function stopRec() {
  return new Promise((resolve, reject) => {
    if (!rec || rec.state === "inactive") {
      return resolve(new Blob([], {
        type: "video/webm"
      }));
    }

    rec.onstop = () => {
      resolve(
        new Blob(chunks, {
          type: rec.mimeType || "video/webm"
        })
      );
    };

    rec.onerror = (event) => {
      reject(event.error || new Error("Gagal menghentikan rekaman."));
    };

    rec.stop();
  });
}

// =====================================================
// MULAI SESI
// =====================================================

async function start() {
  if (!$("consent").checked) {
    return toast("Centang persetujuan terlebih dahulu.");
  }

  $("startBtn").disabled = true;

  // Buka kamera
  if (!(await openCam())) {
    if (!CONFIG.mock) {
      $("startBtn").disabled = false;

      return toast(
        "Kamera atau mikrofon tidak dapat diakses."
      );
    }

    $("phText").textContent =
      "Mode demo (kamera tidak tersedia)";

    $("previewBtn").hidden = true;

    toast(
      "Kamera tidak tersedia. Melanjutkan dalam mode demo."
    );
  }

  // Buat session di backend
  if (!CONFIG.mock) {
    try {
      sessionData = await createSession({
        role: role.id,
        pid: participantId,
        attempt,
        soal
      });

      if (
        !sessionData?.session_id ||
        !Array.isArray(sessionData.questions)
      ) {
        throw new Error("Respons session dari backend tidak valid.");
      }

      console.log(
        "[SESSION] Berhasil membuat session:",
        sessionData
      );

    } catch (e) {
      console.error("[SESSION ERROR]", e);

      stream?.getTracks().forEach((t) => t.stop());
      stream = null;

      $("cam").style.display = "none";
      $("ph").hidden = false;
      $("startBtn").disabled = false;

      return toast(
        "Gagal memulai sesi: " + e.message
      );
    }
  }

  // Inisialisasi sesi interview
  running = true;
  qi = 0;
  sec = 0;
  clips = [];

  $("guide").hidden = true;
  $("vtag").hidden = !stream;

  $("consentRow").hidden = true;
  $("startBtn").hidden = true;
  $("nextBtn").hidden = false;

  renderTop();
  renderSide();

  startRec();

  timer = setInterval(tick, 1000);
}

// =====================================================
// TIMER
// =====================================================

function tick() {
  sec++;

  $("timer").textContent =
    `${mmss(sec)} / ${mmss(CONFIG.maxDetikPerPertanyaan)}`;

  if (sec >= CONFIG.maxDetikPerPertanyaan) {
    next();
  }
}

// =====================================================
// PERTANYAAN BERIKUTNYA
// =====================================================

async function next() {
  if (!running || busy) return;

  busy = true;

  try {
    clips[qi] = await stopRec();

    if (qi >= Q.length - 1) {
      await finish();
      return;
    }

    qi++;
    sec = 0;

    $("timer").textContent =
      `00:00 / ${mmss(CONFIG.maxDetikPerPertanyaan)}`;

    renderSide();

    startRec();

  } catch (e) {
    console.error("[RECORDING ERROR]", e);
    toast("Terjadi kesalahan saat menyimpan rekaman.");
  } finally {
    busy = false;
  }
}

// =====================================================
// AKHIRI SESI LEBIH AWAL
// =====================================================

async function endEarly() {
  if (!running || busy) return;

  if (!confirm(
    "Akhiri sesi sekarang? Pertanyaan yang belum dijawab tidak ikut dianalisis."
  )) {
    return;
  }

  busy = true;

  try {
    clips[qi] = await stopRec();
    await finish();

  } catch (e) {
    console.error("[RECORDING ERROR]", e);
    toast("Terjadi kesalahan saat menyimpan rekaman.");
  } finally {
    busy = false;
  }
}

// =====================================================
// SELESAIKAN SESI
// =====================================================

async function finish() {
  if (!running) return;

  running = false;

  clearInterval(timer);

  stream?.getTracks().forEach((t) => t.stop());
  stream = null;

  $("cam").style.display = "none";
  $("vtag").hidden = true;

  $("nextBtn").hidden = true;
  $("proc").hidden = false;

  renderTop("Memproses…");

  try {
    const asked = soal.slice(0, clips.length);

    // Pastikan ada video
    if (clips.length === 0) {
      throw new Error("Tidak ada video yang berhasil direkam.");
    }

    // Pastikan session tersedia untuk mode backend
    if (!CONFIG.mock && !sessionData?.session_id) {
      throw new Error("Session ID tidak ditemukan.");
    }

    // Ambil ID pertanyaan dari session backend
    const sessionQuestions = CONFIG.mock
      ? []
      : sessionData.questions.slice(0, asked.length);

    // Upload video dan hubungkan dengan session
    const jobId = await createJob({
      role: role.id,
      soal: asked,
      blobs: clips,
      bahasa: settings.get().bahasa,
      attempt,
      sessionId: sessionData?.session_id,
      sessionQuestions
    });

    console.log("[JOB] Job berhasil dibuat:", jobId);

    // =================================================
    // 1. TUNGGU PROSES VIDEO DAN TRANSKRIP SELESAI
    // =================================================

    const hasil = await poll(jobId);

    if (!hasil) {
      throw new Error("Hasil analisis tidak ditemukan.");
    }

    // =================================================
    // 2. EVALUASI JAWABAN MENGGUNAKAN GROQ
    // =================================================

    let evaluationResult = null;
    let evaluationError = null;

    if (!CONFIG.mock) {
      try {
        $("procMsg").textContent =
          "Transkrip selesai. Sedang mengevaluasi jawaban menggunakan AI...";

        $("procBar").style.width = "90%";

        evaluationResult = await evaluateSession(
          sessionData.session_id
        );

        console.log(
          "[GROQ EVALUATION] Evaluasi berhasil:",
          evaluationResult
        );

      } catch (error) {
        evaluationError = error.message;

        console.error(
          "[GROQ EVALUATION ERROR]",
          error
        );
      }
    }

    // =================================================
    // 3. LENGKAPI INFORMASI PERTANYAAN
    // =================================================

    if (hasil.pertanyaan) {
      hasil.pertanyaan.forEach((q, i) => {
        q.id ??= asked[i]?.id;
        q.kompetensi ??= asked[i]?.kompetensi;
      });
    }

    // =================================================
    // 4. SIMPAN HASIL LAPORAN
    // =================================================

    reports.add({
      id: jobId,
      job_id: jobId,
      session_id: sessionData?.session_id ?? null,
      role: role.id,
      roleNama: role.nama,
      attempt,
      pid: participantId,

      ...hasil,

      evaluation_result: evaluationResult,
      evaluation_error: evaluationError
    });

    // =================================================
    // 5. ARAHKAN KE HALAMAN REPORT
    // =================================================

    const reportSessionId = sessionData?.session_id;

    if (!CONFIG.mock && !reportSessionId) {
      throw new Error("Session ID untuk laporan tidak ditemukan.");
    }

    location.href = CONFIG.mock
      ? `report.html?id=${encodeURIComponent(jobId)}`
      : `report.html?id=${encodeURIComponent(reportSessionId)}&job=${encodeURIComponent(jobId)}`;

  } catch (e) {
    console.error("[JOB ERROR]", e);

    $("procMsg").textContent =
      "Terjadi kendala: " + e.message;

    $("retryBtn").hidden = false;
  }
}

// =====================================================
// POLLING JOB
// =====================================================

async function poll(id) {
  while (true) {
    const j = await getJob(id);

    $("procMsg").textContent =
      j.pesan || "Memproses…";

    $("procBar").style.width =
      Math.round((j.progres || 0) * 100) + "%";

    if (j.status === "selesai") {
      return j.hasil;
    }

    if (j.status === "gagal") {
      throw new Error(
        j.pesan || "Analisis gagal"
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 1200)
    );
  }
}

// =====================================================
// EVENT LISTENERS
// =====================================================

$("previewBtn").onclick = async () => {
  if (await openCam()) {
    $("guide").hidden = false;
  } else {
    toast(
      "Kamera atau mikrofon tidak dapat diakses."
    );
  }
};

$("startBtn").onclick = start;

$("nextBtn").onclick = next;

window.addEventListener("beforeunload", (e) => {
  if (running) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// =====================================================
// INITIAL RENDER
// =====================================================

renderTop();
renderSide();
