
import { mountShell } from "../core/shell.js";
import { CONFIG } from "../core/config.js";
import { getAuthHeaders } from "../core/auth.js";

const $ = (id) => document.getElementById(id);

const API_URL = CONFIG.apiBase || "http://127.0.0.1:8000";

let sessions = [];
let selectedRole = "all";

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener("DOMContentLoaded", init);

async function init() {
  await mountShell({
    page: "history",
    title: "Riwayat",
    subtitle: "Sesi latihan yang tersimpan"
  });

  bindEvents();
  await loadHistory();
}

function bindEvents() {
  $("roleSel")?.addEventListener("change", (event) => {
    selectedRole = event.target.value;
    renderHistory();
  });
}

// =====================================================
// API
// =====================================================

async function loadHistory() {
  showLoading();

  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_URL}/api/sessions`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...authHeaders
      }
    });

    if (response.status === 401 || response.status === 403) {
      showError("Sesi login berakhir. Silakan login kembali.");
      return;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Gagal mengambil data riwayat.");
    }

    const result = await response.json();

    // Mendukung array langsung maupun object { success, data }
    sessions = Array.isArray(result)
      ? result
      : Array.isArray(result.data)
        ? result.data
        : [];

    if (result.success === false) {
      throw new Error(result.message || "Gagal mengambil data riwayat.");
    }

    renderHistory();

  } catch (error) {
    console.error("[HISTORY] Error:", error);
    showError(error.message || "Terjadi kesalahan saat memuat riwayat.");
  }
}

// =====================================================
// LOADING / EMPTY / ERROR
// =====================================================

function showLoading() {
  const empty = $("empty");
  const wrap = $("wrap");

  if (empty) {
    empty.hidden = false;
    const message = empty.querySelector(".muted");
    if (message) message.textContent = "Memuat riwayat latihan...";
  }

  if (wrap) wrap.hidden = true;
}

function showError(message) {
  const empty = $("empty");
  const wrap = $("wrap");

  if (empty) {
    empty.hidden = false;

    const text = empty.querySelector(".muted");
    if (text) text.textContent = message;
  }

  if (wrap) wrap.hidden = true;
}

function showEmpty() {
  const empty = $("empty");
  const wrap = $("wrap");

  if (empty) {
    empty.hidden = false;

    const text = empty.querySelector(".muted");
    if (text) text.textContent = "Belum ada sesi tersimpan.";
  }

  if (wrap) wrap.hidden = true;
}

// =====================================================
// DATA HELPERS
// =====================================================

function getValue(object, keys, fallback = null) {
  for (const key of keys) {
    const value = object?.[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function getRubricScore(session) {
  const performance = session.performance || {};

  const value = getValue(session, [
    "rubric_score",
    "rubric_percentage",
    "performance_score",
    "overall_score"
  ], getValue(performance, [
    "rubric_score",
    "score",
    "percentage",
    "overall_score"
  ]));

  return toNumber(value);
}

function getGazePercentage(session) {
  const performance = session.performance || {};

  const value = getValue(session, [
    "gaze_percentage",
    "gaze_score",
    "eye_contact_percentage"
  ], getValue(performance, [
    "gaze_percentage",
    "gaze_score",
    "eye_contact_percentage"
  ]));

  return toNumber(value);
}

function getHeadMotionCount(session) {
  const performance = session.performance || {};

  const value = getValue(session, [
    "head_motion_count",
    "head_movement_count",
    "head_motion"
  ], getValue(performance, [
    "head_motion_count",
    "head_movement_count",
    "head_motion"
  ]));

  return toNumber(value);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getRole(session) {
  return (
    session.role ||
    session.job_role ||
    session.position ||
    "Tidak diketahui"
  );
}

function getSessionDate(session) {
  return (
    session.started_at ||
    session.created_at ||
    session.session_date ||
    session.date ||
    null
  );
}

function getSessionStatus(session) {
  return session.status || "Selesai";
}

function getDuration(session) {
  const seconds = Number(
    session.duration_seconds ??
    session.duration ??
    0
  );

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "-";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes} menit ${remainingSeconds} detik`;
}

function getAttempt(session, index) {
  return session.attempt_number || session.attempt || index + 1;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[char];
  });
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// =====================================================
// ROLE FILTER
// =====================================================

function renderRoleFilter(data) {
  const select = $("roleSel");
  if (!select) return;

  const currentValue = selectedRole;

  const roles = [
    ...new Set(data.map(getRole).filter(Boolean))
  ];

  select.innerHTML = `
    <option value="all">Semua posisi</option>
    ${roles.map(role => `
      <option value="${escapeHTML(role)}">
        ${escapeHTML(role)}
      </option>
    `).join("")}
  `;

  if (
    currentValue === "all" ||
    roles.includes(currentValue)
  ) {
    select.value = currentValue;
  } else {
    selectedRole = "all";
    select.value = "all";
  }
}

// =====================================================
// MAIN RENDER
// =====================================================

function renderHistory() {
  const empty = $("empty");
  const wrap = $("wrap");

  if (!sessions.length) {
    showEmpty();
    return;
  }

  if (empty) empty.hidden = true;
  if (wrap) wrap.hidden = false;

  renderRoleFilter(sessions);

  const filteredSessions = selectedRole === "all"
    ? sessions
    : sessions.filter(
        session => getRole(session) === selectedRole
      );

  const sortedSessions = [...filteredSessions].sort((a, b) => {
    const dateA = new Date(getSessionDate(a) || 0).getTime();
    const dateB = new Date(getSessionDate(b) || 0).getTime();

    return dateA - dateB;
  });

  renderCharts(sortedSessions);
  renderTable(sortedSessions);
}

// =====================================================
// CHARTS
// =====================================================

function renderCharts(data) {
  renderRubricGazeChart(data);
  renderHeadMotionChart(data);
}

function renderRubricGazeChart(data) {
  const container = $("chartA");
  if (!container) return;

  const validData = data.filter(session =>
    getRubricScore(session) !== null ||
    getGazePercentage(session) !== null
  );

  if (!validData.length) {
    container.innerHTML = `
      <p class="muted small">
        Data pemenuhan rubrik dan fokus pandangan belum tersedia.
      </p>
    `;
    return;
  }

  const rubric = validData.map(session => getRubricScore(session));
  const gaze = validData.map(session => getGazePercentage(session));

  const hasRubric = rubric.some(value => value !== null);
  const hasGaze = gaze.some(value => value !== null);

  container.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;font-size:12px">
      ${hasRubric ? `
        <span>
          <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#64748b;margin-right:5px"></span>
          Pemenuhan rubrik
        </span>
      ` : ""}
      ${hasGaze ? `
        <span>
          <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#0d9488;margin-right:5px"></span>
          Fokus pandangan
        </span>
      ` : ""}
    </div>
    ${createLineChart([
      { values: rubric, color: "#64748b" },
      { values: gaze, color: "#0d9488" }
    ])}
  `;
}

function renderHeadMotionChart(data) {
  const container = $("chartB");
  if (!container) return;

  const values = data.map(session => getHeadMotionCount(session));

  if (!values.some(value => value !== null)) {
    container.innerHTML = `
      <p class="muted small">
        Data arah kepala belum tersedia.
      </p>
    `;
    return;
  }

  container.innerHTML = createBarChart(values);
}

function createLineChart(series) {
  const width = 600;
  const height = 220;
  const padding = 30;

  const allValues = series.flatMap(item =>
    item.values.filter(value => value !== null)
  );

  if (!allValues.length) {
    return `<p class="muted small">Data grafik belum tersedia.</p>`;
  }

  const maxValue = Math.max(100, ...allValues);
  const minValue = Math.min(0, ...allValues);
  const range = maxValue - minValue || 1;

  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const grid = [0, 25, 50, 75, 100].map(value => {
    const y = padding + chartHeight - (value / 100) * chartHeight;

    return `
      <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}"
        stroke="currentColor" opacity=".12" />
      <text x="4" y="${y + 4}" font-size="10" fill="currentColor">${value}</text>
    `;
  }).join("");

  const lines = series.map(item => {
    const points = item.values
      .map((value, index) => {
        if (value === null) return null;

        const x = item.values.length <= 1
          ? padding + chartWidth / 2
          : padding + (index / (item.values.length - 1)) * chartWidth;

        const y = padding + chartHeight -
          ((value - minValue) / range) * chartHeight;

        return `${x},${y}`;
      })
      .filter(Boolean);

    if (!points.length) return "";

    return `
      <polyline
        points="${points.join(" ")}"
        fill="none"
        stroke="${item.color}"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      ${points.map(point => {
        const [x, y] = point.split(",");
        return `
          <circle cx="${x}" cy="${y}" r="4"
            fill="${item.color}" />
        `;
      }).join("")}
    `;
  }).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}"
      style="width:100%;height:auto;display:block"
      role="img" aria-label="Grafik tren performa">
      ${grid}
      ${lines}
    </svg>
  `;
}

function createBarChart(values) {
  const validValues = values.filter(value => value !== null);

  if (!validValues.length) {
    return `<p class="muted small">Data grafik belum tersedia.</p>`;
  }

  const width = 600;
  const height = 220;
  const padding = 30;

  const maxValue = Math.max(1, ...validValues);
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;

  const barWidth = Math.min(
    42,
    chartWidth / Math.max(values.length, 1) * 0.55
  );

  const bars = values.map((value, index) => {
    if (value === null) return "";

    const slotWidth = chartWidth / Math.max(values.length, 1);
    const x = padding + index * slotWidth + (slotWidth - barWidth) / 2;
    const barHeight = (value / maxValue) * chartHeight;
    const y = padding + chartHeight - barHeight;

    return `
      <rect x="${x}" y="${y}" width="${barWidth}"
        height="${barHeight}" rx="4" fill="#64748b" />
      <text x="${x + barWidth / 2}" y="${Math.max(12, y - 6)}"
        text-anchor="middle" font-size="10" fill="currentColor">
        ${value}
      </text>
    `;
  }).join("");

  const grid = [0, 0.25, 0.5, 0.75, 1].map(factor => {
    const y = padding + chartHeight - factor * chartHeight;

    return `
      <line x1="${padding}" y1="${y}" x2="${width - padding}"
        y2="${y}" stroke="currentColor" opacity=".12" />
    `;
  }).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}"
      style="width:100%;height:auto;display:block"
      role="img" aria-label="Grafik kejadian arah kepala">
      ${grid}
      ${bars}
    </svg>
  `;
}

// =====================================================
// SESSION TABLE
// =====================================================

function renderTable(data) {
  const table = $("tbl");
  if (!table) return;

  if (!data.length) {
    table.innerHTML = `
      <tbody>
        <tr>
          <td class="muted">Belum ada sesi untuk posisi ini.</td>
        </tr>
      </tbody>
    `;
    return;
  }

  const rows = [...data].reverse();

  table.innerHTML = `
    <thead>
      <tr>
        <th>No.</th>
        <th>Percobaan</th>
        <th>Posisi</th>
        <th>Tanggal</th>
        <th>Durasi</th>
        <th>Status</th>
        <th>Rubrik</th>
        <th>Aksi</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((session, index) => {
        // Gunakan ID sesi, bukan ID job.
        const id = session.id || session.session_id;
        const rubric = getRubricScore(session);
        const status = getSessionStatus(session);

        return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHTML(getAttempt(session, rows.length - index - 1))}</td>
            <td>${escapeHTML(getRole(session))}</td>
            <td>${escapeHTML(formatDate(getSessionDate(session)))}</td>
            <td>${escapeHTML(getDuration(session))}</td>
            <td>${escapeHTML(status)}</td>
            <td>${rubric === null ? "-" : `${rubric.toFixed(1)}%`}</td>
            <td>
              ${
                id
                  ? `<a class="btn" href="report.html?id=${encodeURIComponent(id)}">Lihat laporan</a>`
                  : "-"
              }
            </td>
          </tr>
        `;
      }).join("")}
    </tbody>
  `;
}
