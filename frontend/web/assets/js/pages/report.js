
import { requireAuth, getAuthHeaders } from "../core/auth.js";
await requireAuth();

import { mountShell } from "../core/shell.js";
import { CONFIG, MODEL_LABEL, TONE } from "../core/config.js";
import { BRAND } from "../core/brand.js";
import { esc, mmss, fmtDate, STATUS } from "../core/utils.js";
import { lineChart, barChart } from "../core/charts.js";

const $ = (id) => document.getElementById(id);

const API_URL = `${CONFIG.apiBase}/api`;
const params = new URLSearchParams(location.search);

const sessionId = params.get("id");
const jobId = params.get("job");

let rep = null;

// ======================================================
// 1. KONSTANTA DAN HELPER
// ======================================================

const CV_INDICATORS = {
  head_motion: {
    label: "Gerakan Kepala",
    description: "Pola pergerakan kepala selama menjawab.",
    model: "Model Gerakan Kepala",
  },
  gaze: {
    label: "Arah Pandangan",
    description: "Arah pandangan mata selama menjawab.",
    model: "Model Pelacakan Pandangan",
  },
  expression: {
    label: "Ekspresi Wajah",
    description: "Ekspresi wajah yang terdeteksi selama menjawab.",
    model: "Model Ekspresi Wajah",
  },
};

const INDICATOR_ALIASES = {
  head_motion: "head_motion",
  head: "head_motion",
  headmotion: "head_motion",
  gaze: "gaze",
  eye_tracking: "gaze",
  eye: "gaze",
  expression: "expression",
  facial_expression: "expression",
  facial: "expression",
};

const CV_LABEL_TRANSLATIONS = {
  atas: "Ke atas",
  up: "Ke atas",
  bawah: "Ke bawah",
  down: "Ke bawah",
  nod: "Mengangguk",
  nodding: "Mengangguk",
  kiri: "Ke kiri",
  left: "Ke kiri",
  kanan: "Ke kanan",
  right: "Ke kanan",
  turn: "Menoleh",
  turning: "Menoleh",
  forward: "Menghadap ke depan",
  center: "Ke tengah",
  centre: "Ke tengah",
  centered: "Mengarah ke tengah",
  camera: "Ke kamera",
  "looking at camera": "Melihat ke kamera",
  "looking forward": "Melihat ke depan",
  straight: "Lurus ke depan",
  away: "Menjauh dari kamera",
  happy: "Senang",
  happiness: "Senang",
  smile: "Tersenyum",
  smiling: "Tersenyum",
  neutral: "Netral",
  normal: "Netral",
  surprise: "Terkejut",
  surprised: "Terkejut",
  sad: "Sedih",
  sadness: "Sedih",
  angry: "Marah",
  anger: "Marah",
  fear: "Takut",
  fearful: "Takut",
  disgust: "Jijik",
  disgusted: "Jijik",
};

const toneVar = (score) =>
  score == null
    ? "var(--muted)"
    : score >= 75
      ? "var(--good)"
      : score >= 50
        ? "var(--warn)"
        : "var(--bad)";

const toneOf = (label) => {
  const value = String(label || "").toLowerCase();

  if (TONE.good.some((item) =>
    value.includes(String(item).toLowerCase())
  )) {
    return "good";
  }

  if (TONE.bad.some((item) =>
    value.includes(String(item).toLowerCase())
  )) {
    return "bad";
  }

  return "warn";
};

const lowDet = (value) =>
  value != null && value < CONFIG.minDeteksi;

const pct = (value) =>
  value == null ? null : Math.round(value * 100);

function mapRubricStatus(score) {
  if (score >= 4) return "terpenuhi";
  if (score >= 2) return "sebagian";
  return "belum";
}

function uniqueText(items) {
  return [
    ...new Set(
      items
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

function safeNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function toBoolean(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(value).toLowerCase() === "true"
  );
}

function normalizeIndicator(value) {
  const key = String(value || "")
    .toLowerCase()
    .trim()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");

  return INDICATOR_ALIASES[key] || null;
}

function normalizeConfidence(value) {
  const number = safeNumber(value);

  if (number == null || number < 0) return null;

  return number <= 1
    ? number * 100
    : Math.min(number, 100);
}

function confidenceText(value) {
  const confidence = normalizeConfidence(value);

  return confidence == null
    ? "Tingkat keyakinan model tidak tersedia"
    : `Tingkat keyakinan model ${confidence.toFixed(1)}%`;
}

function normalizeLabelKey(label) {
  return String(label || "")
    .toLowerCase()
    .trim()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ");
}

function formatLabel(label) {
  const key = normalizeLabelKey(label);

  if (!key) return "Tidak diketahui";

  if (CV_LABEL_TRANSLATIONS[key]) {
    return CV_LABEL_TRANSLATIONS[key];
  }

  return key.replace(/\b\w/g, (char) =>
    char.toUpperCase()
  );
}

function labelTone(label) {
  const value = normalizeLabelKey(label);

  if (
    /forward|center|centre|camera|centered|neutral|normal|happy|smile|senang|tersenyum|netral|depan|tengah/.test(value)
  ) {
    return "good";
  }

  if (
    /down|left|right|away|turn|look away|sad|angry|fear|surprise|bawah|kiri|kanan|menoleh|sedih|marah|takut|terkejut/.test(value)
  ) {
    return "warn";
  }

  return "warn";
}

// ======================================================
// 2. NORMALISASI DATA COMPUTER VISION
// ======================================================

function normalizeCvObservations(observations) {
  if (!Array.isArray(observations)) return [];

  return observations
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const indicator = normalizeIndicator(
        item.indicator_type || item.indicator
      );

      if (!indicator) return null;

      const timestamp = safeNumber(
        item.timestamp_seconds ??
        item.timestamp ??
        item.time_seconds,
        0
      );

      const confidence = normalizeConfidence(item.confidence);

      return {
        indicator,

        label: String(
          item.predicted_label ??
          item.label ??
          item.prediction ??
          "Unknown"
        ),

        timestamp: Math.max(0, timestamp),
        frameIndex: safeNumber(item.frame_index),
        confidence,
        isValid: toBoolean(
          item.is_valid ?? item.isValid
        ),
        qualityFlag: item.quality_flag || null,
        modelName: item.model_name || null,
        modelVersion: item.model_version || null,
        isSynthetic: toBoolean(item.is_synthetic),
        metadata: item.metadata || {},
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);
}

// ======================================================
// 3. RINGKASAN SETIAP INDIKATOR CV
// ======================================================

function summarizeCvIndicator(observations, indicator) {
  const items = observations.filter(
    (item) => item.indicator === indicator
  );

  if (!items.length) {
    return {
      id: indicator,
      nama: CV_INDICATORS[indicator].label,
      deskripsi: CV_INDICATORS[indicator].description,
      total: 0,
      valid: 0,
      invalid: 0,
      labels: [],
      dominantLabel: null,
      averageConfidence: null,
      rasio: null,
      tersedia: false,
    };
  }

  const validItems = items.filter((item) => item.isValid);
  const counts = {};

  validItems.forEach((item) => {
    counts[item.label] = (counts[item.label] || 0) + 1;
  });

  const labels = Object.entries(counts)
    .map(([label, count]) => ({
      label,
      count,
      percentage: validItems.length
        ? (count / validItems.length) * 100
        : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const confidences = validItems
    .map((item) => item.confidence)
    .filter((value) => value != null);

  const averageConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) /
      confidences.length
    : null;

  return {
    id: indicator,
    nama: CV_INDICATORS[indicator].label,
    deskripsi: CV_INDICATORS[indicator].description,
    total: items.length,
    valid: validItems.length,
    invalid: items.length - validItems.length,
    labels,
    dominantLabel: labels[0]?.label || null,
    averageConfidence,
    rasio: validItems.length / items.length,
    tersedia: validItems.length > 0,
  };
}

// ======================================================
// 4. TIMELINE COMPUTER VISION
// ======================================================

function buildCvTimeline(observations) {
  const timeline = {};

  Object.keys(CV_INDICATORS).forEach((indicator) => {
    const items = observations.filter(
      (item) =>
        item.indicator === indicator &&
        item.isValid
    );

    if (!items.length) return;

    timeline[indicator] = items.map((item) => [
      item.label,
      item.timestamp,
      item.timestamp + 1,
    ]);
  });

  return timeline;
}

// ======================================================
// 5. PEMBENTUKAN CV VIEW
// ======================================================

function buildCvView(observations) {
  const summaries = Object.keys(CV_INDICATORS).map(
    (indicator) =>
      summarizeCvIndicator(observations, indicator)
  );

  const validCount = summaries.reduce(
    (sum, item) => sum + item.valid,
    0
  );

  const totalCount = summaries.reduce(
    (sum, item) => sum + item.total,
    0
  );

  return {
    observations,
    summaries,
    total: totalCount,
    valid: validCount,
    invalid: totalCount - validCount,
    tersedia: validCount > 0,
    timeline: buildCvTimeline(observations),
  };
}

// ======================================================
// 6. SARAN LATIHAN
// ======================================================

function buildPracticeAdvice(questions) {
  const advice = [];

  questions.forEach((q) => {
    const improvements = uniqueText(
      q.rubrik.improvements || []
    );

    const rubricFeedback = uniqueText(
      q.rubrik.kriteria
        .map((item) => item.feedback)
        .filter(Boolean)
    );

    const candidates = improvements.length
      ? improvements
      : rubricFeedback;

    candidates.slice(0, 2).forEach((item) => {
      advice.push(`Q${q.no} · ${item}`);
    });
  });

  return uniqueText(advice).slice(0, 8);
}

// ======================================================
// 7. NORMALISASI RIWAYAT PERFORMA
// ======================================================

function normalizePerformanceHistory(history) {
  // Backend history.py saat ini mengirim array langsung.
  // Format object.attempts juga tetap didukung.

  const attempts = Array.isArray(history)
    ? history
    : Array.isArray(history?.attempts)
      ? history.attempts
      : [];

  return attempts
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const attemptNumber = safeNumber(
        item.attempt_number ?? item.attempt,
        index + 1
      );

      // Backend mengirim score dari calculate_performance().
      // Nilai ini sudah dalam skala 0-100.
      const score = safeNumber(
        item.score ??
        item.weighted_percentage ??
        item.weighted_score_percentage ??
        item.score_percentage ??
        item.percentage,
        null
      );

      return {
        sessionId: item.session_id || item.id || null,

        attemptNumber,

        startedAt:
          item.started_at ||
          item.created_at ||
          null,

        score:
          score == null
            ? null
            : Math.max(0, Math.min(100, score)),

        totalQuestions: safeNumber(
          item.total_questions,
          0
        ),

        evaluatedQuestions: safeNumber(
          item.evaluated_questions,
          0
        ),
      };
    })
    .filter((item) => item.attemptNumber != null)
    .sort((a, b) => {
      if (a.attemptNumber !== b.attemptNumber) {
        return a.attemptNumber - b.attemptNumber;
      }

      return String(a.startedAt || "").localeCompare(
        String(b.startedAt || "")
      );
    });
}

// ======================================================
// 8. MAPPING DATA BACKEND KE FORMAT FRONTEND
// ======================================================

function mapSessionToReport(response) {
  const { session, participant, questions } = response.data;

  const pertanyaan = (questions || []).map((q) => {
    const answer = q.answer;
    const llmEvaluation = q.llm_evaluation;

    const scores =
      q.active_rubric_scores ||
      (llmEvaluation?.scores?.length
        ? llmEvaluation.scores
        : q.rubric_scores || []);

    const kriteria = scores.map((item) => {
      const score = Number(item.score ?? 0);
      const criterion = item.criterion || {};

      return {
        teks: criterion.criterion_name || "Kriteria",
        status: mapRubricStatus(score),
        skor: score,
        bobot: Number(item.weight_percent ?? 0) / 100,
        feedback: item.feedback || "",
        bukti: item.evidence || "",
        reason: item.reason || "",
        synthetic: item.is_synthetic === true,
      };
    });

    const weightedScore = Number(
      q.rubric_summary?.weighted_score ?? 0
    );

    const cvObservations = normalizeCvObservations(
      q.cv_observations || []
    );

    const cv = buildCvView(cvObservations);

    return {
      no: q.question_order,
      teks: q.question_text || "",
      kompetensi: q.competency || "",
      durasi: Number(answer?.answer_duration_seconds || 0),

      bicara: answer
        ? {
            teks: answer.transcript || answer.answer_text || "",
            jeda_awal: null,
            kata_per_menit: null,
            jeda_panjang: null,
            jumlah_kata: null,
          }
        : null,

      bicara_error: answer
        ? ""
        : "Jawaban belum tersedia.",

      rubrik: {
        kriteria,
        weighted_score: weightedScore,
        weighted_percentage:
          q.rubric_summary?.weighted_percentage ?? null,

        is_synthetic:
          q.rubric_summary?.all_synthetic === true,

        review_status:
          q.rubric_summary?.review_status || [],

        evaluation_source:
          q.rubric_summary?.evaluation_source || null,

        overall_feedback:
          llmEvaluation?.overall_feedback || "",

        strengths:
          Array.isArray(llmEvaluation?.strengths)
            ? llmEvaluation.strengths
            : [],

        improvements:
          Array.isArray(llmEvaluation?.improvements)
            ? llmEvaluation.improvements
            : [],

        model_name:
          llmEvaluation?.model_name || "",
      },

      cv,
      cv_status: q.cv_status || null,

      aspek: cv.summaries,
      timeline: cv.timeline,
      deteksi: null,
    };
  });

  const allFeedback = buildPracticeAdvice(pertanyaan);

  const llmStrengths = pertanyaan.flatMap((q) =>
    q.rubrik.strengths
  );

  const rubricStrengths = pertanyaan.flatMap((q) =>
    q.rubrik.kriteria
      .filter((k) => k.skor >= 4)
      .map((k) => k.teks)
  );

  const kekuatan = uniqueText([
    ...llmStrengths,
    ...rubricStrengths,
  ]);

  const allCvObservations = pertanyaan.flatMap(
    (q) => q.cv.observations
  );

  const cvSummaries = Object.keys(CV_INDICATORS).map(
    (indicator) =>
      summarizeCvIndicator(allCvObservations, indicator)
  );

  const computerVision = {
    summaries: cvSummaries,
    total: allCvObservations.length,
    valid: allCvObservations.filter(
      (item) => item.isValid
    ).length,
    tersedia: allCvObservations.some(
      (item) => item.isValid
    ),
    status:
      response.data.computer_vision?.status ||
      session.cv_feature_status ||
      null,
  };

  // Normalisasi riwayat performa dari backend.
  const performanceHistory = normalizePerformanceHistory(
    response.data.performance_history
  );

  return {
    id: session.id,
    role: session.role,
    roleNama: session.role,
    attempt: session.attempt_number || 1,
    dibuat: session.started_at,
    pid: participant?.external_id || "-",
    synthetic: session.is_synthetic === true,

    performanceHistory,

    sesi: {
      deteksi: null,
      aspek: cvSummaries,
      saran: allFeedback,
      kekuatan,
      computerVision,
    },

    pertanyaan,
  };
}

// ======================================================
// 9. RINGKASAN RUBRIK
// ======================================================

function rubrikStat() {
  const result = {
    terpenuhi: 0,
    sebagian: 0,
    belum: 0,
    total: 0,
    pct: null,
  };

  let totalWeight = 0;
  let weightedValue = 0;

  rep.pertanyaan.forEach((q) => {
    q.rubrik.kriteria.forEach((k) => {
      if (!(k.status in STATUS)) return;

      result[k.status]++;
      result.total++;

      totalWeight += k.bobot;
      weightedValue += k.bobot * (k.skor / 4);
    });
  });

  if (totalWeight > 0) {
    result.pct = Math.round(
      (weightedValue / totalWeight) * 100
    );
  }

  return result;
}

// ======================================================
// 10. RINGKASAN LAPORAN
// ======================================================

function ringkasan() {
  const r = rubrikStat();

  const det = rep.sesi.deteksi;
  const low = lowDet(det);

  const part = (key, color) => {
    const width = r.total
      ? (r[key] / r.total) * 100
      : 0;

    return `
      <i style="
        width:${width}%;
        background:var(--${color})
      "></i>
    `;
  };

  const rub = r.total
    ? `
      <div class="muted small">
        Nilai evaluasi rubrik berbobot
      </div>

      <div class="big-pct">${r.pct}%</div>

      <div class="stackbar">
        ${part("terpenuhi", "good")}
        ${part("sebagian", "warn")}
        ${part("belum", "bad")}
      </div>

      <div class="legend small muted">
        <span>
          <i style="background:var(--good)"></i>
          ${r.terpenuhi} terpenuhi
        </span>

        <span>
          <i style="background:var(--warn)"></i>
          ${r.sebagian} sebagian
        </span>

        <span>
          <i style="background:var(--bad)"></i>
          ${r.belum} belum
        </span>
      </div>
    `
    : `
      <p class="muted">
        Evaluasi rubrik jawaban belum tersedia.
        Pastikan proses evaluasi AI sudah selesai.
      </p>
    `;

  const kual =
    det == null
      ? ""
      : `
        <span class="badge ${low ? "warn" : "good"}">
          Wajah terdeteksi ${pct(det)}%
        </span>
      `;

  const syntheticNotice = rep.synthetic
    ? `
      <div class="warn-box">
        Data laporan ini merupakan data sintetis untuk
        pengujian sistem, bukan hasil evaluasi nyata.
      </div>
    `
    : "";

  return `
    ${syntheticNotice}

    ${rub}

    <div class="kual">${kual}</div>

    ${
      low
        ? `
          <p class="small muted">
            Deteksi wajah rendah, sehingga indikator visual
            perlu dibaca dengan hati-hati.
          </p>
        `
        : ""
    }

    <p class="muted small" style="margin-top:8px">
      ID anonim ${esc(rep.pid || "-")}
    </p>
  `;
}

// ======================================================
// 11. DETAIL RUBRIK
// ======================================================

function rubrikHtml() {
  const qs = rep.pertanyaan.filter(
    (q) =>
      q.rubrik.kriteria.length ||
      q.rubrik.overall_feedback ||
      q.rubrik.strengths.length ||
      q.rubrik.improvements.length
  );

  if (!qs.length) {
    return `
      <p class="muted">
        Evaluasi rubrik jawaban belum tersedia.
        Hasil akan muncul setelah evaluasi AI berhasil disimpan.
      </p>
    `;
  }

  return qs.map((q) => `
    <div class="rub-q">

      <div class="rub-head">
        <b>
          Q${q.no} · ${esc(q.kompetensi || "Evaluasi jawaban")}
        </b>

        <span class="muted small">
          ${esc(q.teks)}
        </span>
      </div>

      ${
        q.rubrik.kriteria.length
          ? q.rubrik.kriteria.map((k) => {
              const s = STATUS[k.status] || {
                t: k.status,
                c: "warn",
              };

              return `
                <div class="rub-row">

                  <span class="badge ${s.c}">
                    ${s.t}
                  </span>

                  <div>
                    <div>
                      <b>${esc(k.teks)}</b>

                      <span class="muted small">
                        (Skor ${k.skor}/4 ·
                        Bobot ${Math.round(k.bobot * 100)}%)
                      </span>
                    </div>

                    ${
                      k.feedback
                        ? `
                          <div class="muted small">
                            Feedback: ${esc(k.feedback)}
                          </div>
                        `
                        : ""
                    }

                    ${
                      k.bukti
                        ? `
                          <div class="muted small">
                            Bukti: ${esc(k.bukti)}
                          </div>
                        `
                        : ""
                    }

                    ${
                      k.reason
                        ? `
                          <div class="muted small">
                            Alasan: ${esc(k.reason)}
                          </div>
                        `
                        : ""
                    }
                  </div>

                </div>
              `;
            }).join("")
          : `
            <p class="muted small">
              Skor kriteria belum tersedia untuk pertanyaan ini.
            </p>
          `
      }

      ${
        q.rubrik.kriteria.length
          ? `
            <div class="muted small">
              Nilai berbobot pertanyaan:
              ${q.rubrik.weighted_score.toFixed(2)} / 4
              ${
                q.rubrik.weighted_percentage != null
                  ? `(${q.rubrik.weighted_percentage}%)`
                  : ""
              }
            </div>
          `
          : ""
      }

      ${
        q.rubrik.overall_feedback
          ? `
            <div class="rub-feedback" style="margin-top:12px">
              <b>Evaluasi keseluruhan AI</b>
              <p>${esc(q.rubrik.overall_feedback)}</p>
            </div>
          `
          : ""
      }

      ${
        q.rubrik.strengths.length
          ? `
            <div style="margin-top:10px">
              <b class="small">Kekuatan jawaban</b>
              <ul>
                ${q.rubrik.strengths.map((item) =>
                  `<li>${esc(item)}</li>`
                ).join("")}
              </ul>
            </div>
          `
          : ""
      }

      ${
        q.rubrik.improvements.length
          ? `
            <div style="margin-top:10px">
              <b class="small">Hal yang perlu diperbaiki</b>
              <ul>
                ${q.rubrik.improvements.map((item) =>
                  `<li>${esc(item)}</li>`
                ).join("")}
              </ul>
            </div>
          `
          : ""
      }

      ${
        q.rubrik.model_name
          ? `
            <div class="muted small">
              Model evaluasi: ${esc(q.rubrik.model_name)}
            </div>
          `
          : ""
      }

    </div>
  `).join("") + `
    <p class="muted small">
      Skor rubrik menggunakan skala 0–4.
      Evaluasi AI didasarkan pada transkrip jawaban dan lima kriteria rubrik.
    </p>
  `;
}

// ======================================================
// 12. KOMPONEN COMPUTER VISION
// ======================================================

function cvIndicatorHtml(item) {
  if (!item || !item.total) {
    return `
      <div class="aspek">
        <div class="aspek-head">
          <b>${esc(item?.nama || "Indikator visual")}</b>
          <span class="badge warn">Belum tersedia</span>
        </div>

        <p class="muted small">
          Belum ada observasi untuk indikator ini.
        </p>
      </div>
    `;
  }

  const distribution = item.labels.length
    ? item.labels.map((label) => `
        <div style="margin-top:8px">

          <div class="aspek-head">
            <span class="small">
              ${esc(formatLabel(label.label))}
            </span>

            <span class="muted small">
              ${label.count} observasi
              (${label.percentage.toFixed(1)}%)
            </span>
          </div>

          <div class="bar">
            <i style="
              width:${label.percentage}%;
              background:${toneVar(
                labelTone(label.label) === "good" ? 85 : 55
              )}
            "></i>
          </div>

        </div>
      `).join("")
    : `
      <p class="muted small">
        Tidak ada observasi valid yang dapat diringkas.
      </p>
    `;

  return `
    <div class="aspek">

      <div class="aspek-head">
        <b>${esc(item.nama)}</b>

        <span class="badge ${item.valid ? "good" : "warn"}">
          ${item.valid ? "Tersedia" : "Tidak valid"}
        </span>
      </div>

      <p class="muted small">
        ${esc(item.deskripsi)}
      </p>

      <div class="small" style="margin-top:8px">
        <b>${item.valid}</b> observasi valid dari
        <b>${item.total}</b> observasi
      </div>

      ${
        item.averageConfidence != null
          ? `
            <p class="muted small">
              Rata-rata tingkat keyakinan model:
              ${item.averageConfidence.toFixed(1)}%
            </p>
          `
          : ""
      }

      ${
        item.dominantLabel
          ? `
            <p class="small">
              Label terbanyak:
              <b>${esc(formatLabel(item.dominantLabel))}</b>
            </p>
          `
          : ""
      }

      ${distribution}

    </div>
  `;
}

function cvSessionSummaryHtml() {
  const cv = rep.sesi.computerVision;

  if (!cv || !cv.total) {
    return `
      <p class="muted">
        Belum ada hasil analisis visual yang dapat ditampilkan.
        Pastikan pemrosesan video selesai dan observasi tersimpan
        di database.
      </p>
    `;
  }

  return `
    <div class="cv-summary-grid">

      <div class="cv-summary-item">
        <div class="muted small">Total observasi</div>
        <b>${cv.total}</b>
      </div>

      <div class="cv-summary-item">
        <div class="muted small">Observasi valid</div>
        <b>${cv.valid}</b>
      </div>

      <div class="cv-summary-item">
        <div class="muted small">Observasi tidak valid</div>
        <b>${cv.total - cv.valid}</b>
      </div>

    </div>

    ${cv.summaries.map(cvIndicatorHtml).join("")}

    <p class="muted small">
      Distribusi label dihitung dari observasi valid yang
      dikirimkan backend. Hasil ini merupakan keluaran model,
      bukan penilaian otomatis terhadap kualitas kandidat.
    </p>
  `;
}

function aspekHtml() {
  return cvSessionSummaryHtml();
}

// ======================================================
// 13. GRAFIK FOKUS PANDANGAN
// ======================================================

function isCameraGaze(label) {
  const value = normalizeLabelKey(label);

  return (
    /forward|center|centre|camera|centered|looking at camera|looking forward|straight|depan|tengah|kamera/.test(value)
  );
}

function trenFokusHtml() {
  const qs = rep.pertanyaan;

  const hasData = qs.some((q) =>
    q.cv.observations.some(
      (item) => item.indicator === "gaze" && item.isValid
    )
  );

  if (!hasData) {
    return `
      <p class="muted">
        Grafik arah pandangan belum tersedia karena
        observasi arah pandangan belum ditemukan.
      </p>
    `;
  }

  const values = qs.map((q) => {
    const observations = q.cv.observations.filter(
      (item) =>
        item.indicator === "gaze" &&
        item.isValid
    );

    if (!observations.length) return null;

    const cameraCount = observations.filter(
      (item) => isCameraGaze(item.label)
    ).length;

    return (cameraCount / observations.length) * 100;
  });

  return (
    lineChart(
      qs.map((q) => "Q" + q.no),
      [{
        n: "Pandangan ke arah kamera",
        c: "var(--accent)",
        v: values,
      }],
      { ref: 70 }
    ) +
    `
      <p class="muted small">
        Persentase menunjukkan proporsi observasi arah pandangan
        yang terdeteksi mengarah ke kamera atau ke depan,
        dibandingkan dengan seluruh observasi arah pandangan valid.
        Garis putus-putus menunjukkan acuan 70%.
      </p>
    `
  );
}

// ======================================================
// 14. GRAFIK GERAKAN KEPALA
// ======================================================

function countHeadLabels(q, pattern) {
  return q.cv.observations.filter((item) => {
    if (
      item.indicator !== "head_motion" ||
      !item.isValid
    ) {
      return false;
    }

    const label = normalizeLabelKey(item.label);

    return pattern.test(label);
  }).length;
}

function trenKepalaHtml() {
  const qs = rep.pertanyaan;

  const hasData = qs.some((q) =>
    q.cv.observations.some(
      (item) =>
        item.indicator === "head_motion" &&
        item.isValid
    )
  );

  if (!hasData) {
    return `
      <p class="muted">
        Grafik gerakan kepala belum tersedia karena
        observasi gerakan kepala belum ditemukan.
      </p>
    `;
  }

  const series = [
    {
      n: "Gerakan ke atas",
      c: "#2563eb",
      v: qs.map((q) =>
        countHeadLabels(q, /^(atas|up)$/)
      ),
    },
    {
      n: "Gerakan ke kiri",
      c: "#16a34a",
      v: qs.map((q) =>
        countHeadLabels(q, /^(kiri|left)$/)
      ),
    },
    {
      n: "Gerakan ke kanan",
      c: "#f59e0b",
      v: qs.map((q) =>
        countHeadLabels(q, /^(kanan|right)$/)
      ),
    },
  ];

  return (
    barChart(
      qs.map((q) => "Q" + q.no),
      series
    ) +
    `
      <p class="muted small">
        Grafik menunjukkan jumlah observasi gerakan kepala
        ke atas, ke kiri, dan ke kanan pada setiap pertanyaan.
        Setiap warna mewakili kategori gerakan yang berbeda.
        Perhitungan menggunakan observasi yang dinyatakan valid
        oleh model.
      </p>
    `
  );
}

// ======================================================
// 15. PERBANDINGAN ANTARPERCOBAAN
// ======================================================

function performanceScoreText(score) {
  return score == null
    ? "Belum dievaluasi"
    : `${score.toFixed(1)}%`;
}

function performanceChange(current, previous) {
  if (current == null || previous == null) {
    return null;
  }

  return current - previous;
}

function performanceChangeHtml(change) {
  if (change == null) {
    return `
      <span class="muted small">
        Belum dapat dibandingkan
      </span>
    `;
  }

  if (Math.abs(change) < 0.05) {
    return `
      <span class="muted small">
        Tidak ada perubahan
      </span>
    `;
  }

  const improved = change > 0;

  return `
    <span
      class="badge ${improved ? "good" : "warn"}"
      style="white-space:nowrap"
    >
      ${improved ? "+" : ""}${change.toFixed(1)} poin
      dari sebelumnya
    </span>
  `;
}

function bandingHtml() {
  const history = normalizePerformanceHistory(
    rep.performanceHistory
  );

  console.log("[PERFORMANCE] Data normalisasi:", history);

  if (!history.length) {
    return `
      <p class="muted">
        Data riwayat percobaan belum tersedia.
        Backend belum mengirimkan data sesi sebelumnya.
      </p>
    `;
  }

  const evaluated = history.filter(
    (item) => item.score != null
  );

  if (!evaluated.length) {
    return `
      <p class="muted">
        Riwayat percobaan ditemukan sebanyak
        ${history.length} percobaan, tetapi nilai evaluasi
        belum tersedia. Selesaikan evaluasi AI terlebih dahulu.
      </p>
    `;
  }

  // Cari sesi yang sedang dibuka.
  const currentIndex = history.findIndex(
    (item) => item.sessionId === rep.id
  );

  const latest = currentIndex >= 0
    ? history[currentIndex]
    : history[history.length - 1];

  // Cari percobaan sebelumnya yang memiliki nilai.
  const previous = history
    .filter(
      (item) =>
        item.attemptNumber < latest.attemptNumber &&
        item.score != null
    )
    .at(-1);

  const change = performanceChange(
    latest.score,
    previous?.score ?? null
  );

  // Grafik perkembangan.
  const chartHtml = evaluated.length >= 2
    ? lineChart(
        history.map((item) => `Ke-${item.attemptNumber}`),
        [{
          n: "Nilai evaluasi",
          c: "var(--accent)",
          v: history.map((item) => item.score),
        }],
        { ref: 70 }
      )
    : `
      <div class="cv-summary-grid">
        <div class="cv-summary-item">
          <div class="muted small">Nilai percobaan</div>
          <b>${performanceScoreText(latest.score)}</b>
        </div>
      </div>

      <p class="muted small">
        Grafik perkembangan akan tersedia setelah terdapat
        minimal dua percobaan yang memiliki nilai evaluasi.
      </p>
    `;

  // Riwayat masing-masing percobaan.
  const rowsHtml = history.map((item, index) => {
    const previousAttempt = history
      .slice(0, index)
      .reverse()
      .find((entry) => entry.score != null);

    const itemChange = performanceChange(
      item.score,
      previousAttempt?.score ?? null
    );

    const isCurrent = item.sessionId === rep.id;

    return `
      <div class="rub-row">

        <div style="min-width:75px">
          <b>Percobaan ${item.attemptNumber}</b>

          ${
            isCurrent
              ? `<div class="badge good" style="margin-top:5px">Sesi ini</div>`
              : ""
          }
        </div>

        <div style="flex:1;min-width:0">

          <div class="aspek-head">
            <b>${performanceScoreText(item.score)}</b>

            ${performanceChangeHtml(itemChange)}
          </div>

          <div class="muted small">
            ${
              item.startedAt
                ? esc(fmtDate(item.startedAt))
                : "Tanggal tidak tersedia"
            }
          </div>

          <div class="muted small">
            ${item.evaluatedQuestions} dari
            ${item.totalQuestions} pertanyaan dievaluasi
          </div>

        </div>

      </div>
    `;
  }).join("");

  return `
    <div class="cv-summary-grid">

      <div class="cv-summary-item">
        <div class="muted small">Total percobaan</div>
        <b>${history.length}</b>
      </div>

      <div class="cv-summary-item">
        <div class="muted small">Nilai percobaan ini</div>
        <b>${performanceScoreText(latest.score)}</b>
      </div>

      <div class="cv-summary-item">
        <div class="muted small">Perubahan dari sebelumnya</div>
        ${performanceChangeHtml(change)}
      </div>

    </div>

    <h3>Grafik perkembangan nilai</h3>

    ${chartHtml}

    <p class="muted small">
      Grafik menampilkan nilai evaluasi rubrik berbobot
      pada setiap percobaan. Garis acuan menunjukkan nilai 70%.
      Nilai yang belum dievaluasi tidak ditampilkan sebagai angka.
    </p>

    <h3 style="margin-top:20px">
      Riwayat nilai setiap percobaan
    </h3>

    <div>
      ${rowsHtml}
    </div>
  `;
}

// ======================================================
// 16. DETAIL COMPUTER VISION PER PERTANYAAN
// ======================================================

function cvDetailHtml(q) {
  if (!q.cv.total) {
    return `
      <h3>Analisis Computer Vision</h3>

      <p class="muted">
        Belum ada observasi Computer Vision
        untuk pertanyaan ini.
      </p>
    `;
  }

  return `
    <h3>Analisis Computer Vision</h3>

    <div class="cv-summary-grid">

      <div class="cv-summary-item">
        <div class="muted small">Total observasi</div>
        <b>${q.cv.total}</b>
      </div>

      <div class="cv-summary-item">
        <div class="muted small">Observasi valid</div>
        <b>${q.cv.valid}</b>
      </div>

      <div class="cv-summary-item">
        <div class="muted small">Observasi tidak valid</div>
        <b>${q.cv.invalid}</b>
      </div>

    </div>

    ${q.cv.summaries.map(cvIndicatorHtml).join("")}
  `;
}

// ======================================================
// 17. DETAIL PERTANYAAN
// ======================================================

function detail(q) {
  const low = lowDet(q.deteksi);
  const b = q.bicara;

  const bicara = b
    ? `
      <h3>Transkrip jawaban</h3>

      <p class="transkrip">
        ${esc(b.teks) || "Tidak ada transkrip."}
      </p>

      <p class="muted small">
        Durasi jawaban: ${mmss(q.durasi)}
      </p>
    `
    : `
      <h3>Transkrip</h3>

      <p class="muted">
        Transkrip tidak tersedia.
        ${esc(q.bicara_error || "")}
      </p>
    `;

  const rows = Object.entries(q.timeline || {})
    .map(([indicator, segments]) => `
      <div class="tl-row">

        <span class="small muted">
          ${esc(
            CV_INDICATORS[indicator]?.label ||
            MODEL_LABEL[indicator] ||
            indicator
          )}
        </span>

        <div class="tl">
          ${segments.map(([label, start, end]) => `
            <i
              class="seg ${labelTone(label)}"
              style="
                left:${q.durasi ? (start / q.durasi) * 100 : 0}%;
                width:${q.durasi
                  ? Math.max(((end - start) / q.durasi) * 100, 0.6)
                  : 0}%
              "
              title="${esc(formatLabel(label))} · ${start}–${end} detik"
            ></i>
          `).join("")}
        </div>

      </div>
    `).join("");

  const det =
    q.deteksi == null
      ? `
        <p class="muted small">
          Data deteksi wajah belum tersedia.
        </p>
      `
      : low
        ? `
          <p class="warn-box">
            Wajah hanya terdeteksi ${pct(q.deteksi)}%
            dari durasi.
          </p>
        `
        : `
          <p class="muted small">
            Wajah terdeteksi ${pct(q.deteksi)}%
            dari durasi.
          </p>
        `;

  const rubricDetail = q.rubrik.kriteria.length
    ? `
      <h3>Penilaian rubrik</h3>

      ${q.rubrik.kriteria.map((k) => {
        const s = STATUS[k.status] || {
          t: k.status,
          c: "warn",
        };

        return `
          <div class="rub-row">
            <span class="badge ${s.c}">
              ${s.t}
            </span>

            <div>
              <b>${esc(k.teks)}</b>

              <div class="muted small">
                Skor ${k.skor}/4 · Bobot ${Math.round(k.bobot * 100)}%
              </div>

              ${
                k.feedback
                  ? `<p class="muted small">Feedback: ${esc(k.feedback)}</p>`
                  : ""
              }

              ${
                k.bukti
                  ? `<p class="muted small">Bukti: ${esc(k.bukti)}</p>`
                  : ""
              }

              ${
                k.reason
                  ? `<p class="muted small">Alasan: ${esc(k.reason)}</p>`
                  : ""
              }
            </div>
          </div>
        `;
      }).join("")}
    `
    : "";

  const aiFeedback = q.rubrik.overall_feedback
    ? `
      <h3>Evaluasi keseluruhan AI</h3>
      <p>${esc(q.rubrik.overall_feedback)}</p>
    `
    : "";

  const strengths = q.rubrik.strengths.length
    ? `
      <h3>Kekuatan jawaban</h3>
      <ul>
        ${q.rubrik.strengths.map((item) =>
          `<li>${esc(item)}</li>`
        ).join("")}
      </ul>
    `
    : "";

  const improvements = q.rubrik.improvements.length
    ? `
      <h3>Hal yang perlu diperbaiki</h3>
      <ul>
        ${q.rubrik.improvements.map((item) =>
          `<li>${esc(item)}</li>`
        ).join("")}
      </ul>
    `
    : "";

  return `
    <div class="qd-head">

      <p style="font-weight:700">
        ${esc(q.teks)}
      </p>

      <p class="muted small">
        ${esc(q.kompetensi || "")}
        · durasi ${mmss(q.durasi)}
      </p>

      ${det}

    </div>

    <div class="qd">

      <div>

        <h3>Garis waktu Computer Vision</h3>

        ${
          rows ||
          `
            <p class="muted">
              Timeline observasi visual belum tersedia.
            </p>
          `
        }

        <div class="legend small muted">
          <span>
            <i style="background:var(--good)"></i>
            Kategori yang dikenali sebagai positif
          </span>

          <span>
            <i style="background:var(--warn)"></i>
            Kategori lainnya
          </span>
        </div>

        ${cvDetailHtml(q)}

      </div>

      <div>

        ${bicara}

        ${rubricDetail}

        ${aiFeedback}

        ${strengths}

        ${improvements}

      </div>

    </div>
  `;
}

// ======================================================
// 18. EKSPOR TRANSKRIP
// ======================================================

function transcript() {
  const L = [
    `LAPORAN LATIHAN · ${BRAND.name.join("")}`,
    `Posisi      : ${rep.roleNama || "-"}`,
    `Percobaan   : ke-${rep.attempt ?? 1}`,
    `ID anonim   : ${rep.pid || "-"}`,
    `Tanggal     : ${fmtDate(rep.dibuat)}`,
    "",
    rep.synthetic
      ? "CATATAN: DATA SINTETIS UNTUK PENGUJIAN SISTEM"
      : "",
    "",
    "TRANSKRIP DAN EVALUASI",
    "-".repeat(40),
  ];

  rep.pertanyaan.forEach((q) => {
    L.push(
      `[Q${q.no}] ${q.teks}`,
      `Jawaban: ${q.bicara?.teks || "(tidak ada transkrip)"}`,
      ""
    );

    if (q.rubrik.kriteria.length) {
      L.push("Evaluasi rubrik:");

      q.rubrik.kriteria.forEach((k) => {
        L.push(
          `- ${k.teks}: ${k.skor}/4`,
          `  Bobot: ${Math.round(k.bobot * 100)}%`,
          `  Feedback: ${k.feedback || "-"}`,
          `  Bukti: ${k.bukti || "-"}`,
          `  Alasan: ${k.reason || "-"}`
        );
      });
    }

    if (q.rubrik.overall_feedback) {
      L.push(
        "",
        "Evaluasi keseluruhan:",
        q.rubrik.overall_feedback
      );
    }

    if (q.rubrik.strengths.length) {
      L.push("", "Kekuatan:");

      q.rubrik.strengths.forEach((item) => {
        L.push(`- ${item}`);
      });
    }

    if (q.rubrik.improvements.length) {
      L.push("", "Saran perbaikan:");

      q.rubrik.improvements.forEach((item) => {
        L.push(`- ${item}`);
      });
    }

    L.push("", "HASIL COMPUTER VISION:");

    q.cv.summaries.forEach((item) => {
      L.push(
        `${item.nama}:`,
        `- Total observasi: ${item.total}`,
        `- Observasi valid: ${item.valid}`,
        `- Observasi tidak valid: ${item.invalid}`,
        `- Label terbanyak: ${
          item.dominantLabel
            ? formatLabel(item.dominantLabel)
            : "-"
        }`
      );

      if (item.labels.length) {
        item.labels.forEach((label) => {
          L.push(
            `  - ${formatLabel(label.label)}: ${label.count} (${label.percentage.toFixed(1)}%)`
          );
        });
      }
    });

    L.push("");
  });

  const history = normalizePerformanceHistory(
    rep.performanceHistory
  );

  if (history.length) {
    L.push(
      "",
      "RIWAYAT PERFORMA",
      "-".repeat(40)
    );

    history.forEach((item) => {
      L.push(
        `Percobaan ke-${item.attemptNumber}: ${performanceScoreText(item.score)}`
      );
    });
  }

  return L.join("\n");
}

// ======================================================
// 19. RENDER LAPORAN
// ======================================================

function renderReport() {
  $("wrap").hidden = false;
  $("empty").hidden = true;

  $("ringkas").innerHTML = ringkasan();

  $("saran").innerHTML = rep.sesi.saran.length
    ? rep.sesi.saran.map((s) =>
        `<li style="margin-bottom:8px;line-height:1.6">${esc(s)}</li>`
      ).join("")
    : `
      <li>
        Belum ada saran latihan khusus. Coba selesaikan
        evaluasi jawaban terlebih dahulu agar sistem dapat
        memberikan rekomendasi latihan.
      </li>
    `;

  $("kekuatan").innerHTML = rep.sesi.kekuatan.length
    ? rep.sesi.kekuatan.map((k) =>
        `<span class="chip">✓ ${esc(k)}</span>`
      ).join("")
    : `
      <span class="muted small">
        Kekuatan jawaban belum tersedia.
      </span>
    `;

  $("rubrik").innerHTML = rubrikHtml();
  $("aspek").innerHTML = aspekHtml();
  $("trenFokus").innerHTML = trenFokusHtml();
  $("trenKepala").innerHTML = trenKepalaHtml();

  $("banding").hidden = false;
  $("bandingBody").innerHTML = bandingHtml();

  // Tab pertanyaan.
  const tabs = $("tabs");

  tabs.innerHTML = rep.pertanyaan.map((q, i) => `
    <button class="tab" data-i="${i}">
      Q${q.no}
    </button>
  `).join("");

  const show = (i) => {
    tabs.querySelectorAll(".tab").forEach((button, index) => {
      button.classList.toggle("on", index === i);
    });

    $("qDetail").innerHTML = detail(rep.pertanyaan[i]);
  };

  tabs.onclick = (event) => {
    const button = event.target.closest(".tab");

    if (button) {
      show(Number(button.dataset.i));
    }
  };

  if (rep.pertanyaan.length) {
    show(0);
  } else {
    $("qDetail").innerHTML = `
      <p class="muted">
        Belum ada pertanyaan dalam sesi ini.
      </p>
    `;
  }

  // Tombol latihan kembali.
  $("againLink").href = rep.role
    ? `interview.html?role=${encodeURIComponent(rep.role)}`
    : "roles.html";

  // Cetak laporan.
  $("printBtn").onclick = () => window.print();

  // Ekspor transkrip.
  $("txtBtn").onclick = () => {
    const blob = new Blob(
      [transcript()],
      { type: "text/plain;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `transkrip-${rep.id}.txt`;

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  };
}

// ======================================================
// 20. FETCH DATA DARI BACKEND
// ======================================================

async function init() {
  mountShell({
    page: "report",
    title: "Laporan Latihan",
    subtitle: "Memuat laporan latihan...",
  });

  if (!sessionId) {
    $("empty").hidden = false;
    $("empty").textContent =
      "ID sesi tidak ditemukan. Silakan buka laporan melalui halaman riwayat.";
    return;
  }

  try {
    const response = await fetch(
      `${API_URL}/sessions/${encodeURIComponent(sessionId)}`,
      { headers: await getAuthHeaders() }
    );

    if (!response.ok) {
      let detail = "";

      try {
        const errorData = await response.json();
        detail = errorData.detail || "";
      } catch {
        // Respons error bukan JSON.
      }

      throw new Error(
        `Gagal mengambil laporan (${response.status})` +
        (detail ? `: ${detail}` : "")
      );
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error(
        "Format respons backend tidak valid."
      );
    }

    rep = mapSessionToReport(result);

    const subtitle = document.querySelector(
      ".top-title .muted.small"
    );

    if (subtitle) {
      subtitle.textContent =
        `${rep.roleNama} · percobaan ke-${rep.attempt} · ${fmtDate(rep.dibuat)}`;
    }

    renderReport();

    console.log("[REPORT] Laporan berhasil dimuat.");
    console.log("[REPORT] Session ID:", sessionId);
    console.log("[REPORT] Job ID:", jobId);

    console.log(
      "[REPORT] Jumlah pertanyaan:",
      rep.pertanyaan.length
    );

    console.log(
      "[REPORT] Total observasi CV:",
      rep.sesi.computerVision.total
    );

    console.log(
      "[REPORT] Total saran latihan:",
      rep.sesi.saran.length
    );

    console.log(
      "[REPORT] Riwayat performa:",
      rep.performanceHistory
    );

    console.table(
      rep.pertanyaan.map((q) => ({
        pertanyaan: q.no,
        transkrip: Boolean(q.bicara?.teks),
        jumlah_kriteria: q.rubrik.kriteria.length,
        sumber_evaluasi: q.rubrik.evaluation_source,
        jumlah_observasi_cv: q.cv.total,
        observasi_valid_cv: q.cv.valid,
        status_cv: q.cv_status,
      }))
    );

    console.log(
      "[REPORT] Ringkasan label CV:",
      rep.sesi.computerVision.summaries.map((item) => ({
        indikator: item.nama,
        total: item.total,
        valid: item.valid,
        label: item.labels.map((label) => ({
          asli: label.label,
          tampilan: formatLabel(label.label),
          jumlah: label.count,
        })),
      }))
    );

    console.table(
      normalizePerformanceHistory(
        rep.performanceHistory
      )
    );

  } catch (error) {
    console.error("[REPORT ERROR]", error);

    $("wrap").hidden = true;
    $("empty").hidden = false;

    $("empty").textContent =
      `Gagal memuat laporan: ${error.message}`;
  }
}

// ======================================================
// 21. JALANKAN HALAMAN
// ======================================================

init();
