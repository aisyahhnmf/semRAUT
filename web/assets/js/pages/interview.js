import { mountShell, toast } from "../core/shell.js";
import { CONFIG } from "../core/config.js";
import { findRole } from "../core/data.js";
import { settings, reports, pid } from "../core/store.js";
import { createJob, getJob } from "../core/api.js";
import { esc } from "../core/utils.js";

const role = await findRole(new URLSearchParams(location.search).get("role"));
if (!role) {
  location.replace("roles.html");
  await new Promise(() => {});   // hentikan modul; halaman sedang dialihkan
}
const attempt = reports.nextAttempt(role.id);
const soal = role.soal;
const Q = soal.map((s) => s.teks);

mountShell({ page: "roles", title: role.nama, subtitle: `Percobaan ke-${attempt} · ${Q.length} pertanyaan`,
  compact: true, back: "roles.html" });

const $ = (id) => document.getElementById(id);
let stream = null, rec = null, chunks = [], clips = [];
let qi = 0, sec = 0, timer = null, running = false, busy = false;

const two = (n) => String(n).padStart(2, "0");
const mmss = (s) => `${two(Math.floor(s / 60))}:${two(s % 60)}`;

function renderTop(label) {
  $("topActions").innerHTML = running
    ? `<button class="btn" id="endBtn">Akhiri sesi</button><span class="pill live"><i></i>${stream ? "Merekam" : "Sesi berjalan"}</span>`
    : `<span class="pill idle">${label || "Belum merekam"}</span>`;
  if ($("endBtn")) $("endBtn").onclick = endEarly;
}

function renderSide() {
  const total = Q.length;
  $("qCount").textContent = running ? `${qi + 1}/${total}` : `${total} pertanyaan`;
  $("prog").style.width = (running ? (qi / total) * 100 : 0) + "%";
  $("nextBtn").textContent = qi >= total - 1 ? "Selesaikan sesi" : "Pertanyaan berikutnya";
  if (!running) {
    $("qBody").innerHTML = `<div class="intro"><b>Siap berlatih?</b>
      <p class="muted">${total} pertanyaan akan muncul satu per satu setelah sesi dimulai. Jawab seperti pada wawancara sebenarnya, lalu tekan tombol lanjut saat selesai menjawab.</p></div>`;
    return;
  }
  const done = Q.slice(0, qi).map((t, i) =>
    `<div class="qcard done"><span class="qnum">${two(i + 1)}</span><p>${esc(t)}</p><span class="qdone">✓</span></div>`).join("");
  const cur = `<div class="qcard on"><span class="qnum">${two(qi + 1)}</span><p>${esc(Q[qi])}</p></div>`;
  const left = total - qi - 1;
  const lock = left > 0 ? `<p class="muted small qlock">${left} pertanyaan berikutnya akan muncul setelah Anda lanjut.</p>` : "";
  $("qBody").innerHTML = done + cur + lock;
}

async function openCam() {
  if (stream) return true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 } }, audio: true });
  } catch { return false; }
  const cam = $("cam");
  cam.srcObject = stream;
  cam.style.display = "block";
  cam.style.transform = settings.get().mirror ? "scaleX(-1)" : "none";   // hanya pratinjau, rekaman tidak dibalik
  $("ph").hidden = true;
  return true;
}

function startRec() {
  chunks = [];
  if (!stream) return;
  rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
}

function stopRec() {
  return new Promise((resolve) => {
    if (!rec || rec.state === "inactive") return resolve(new Blob([]));
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || "video/webm" }));
    rec.stop();
  });
}

async function start() {
  if (!$("consent").checked) return toast("Centang persetujuan terlebih dahulu.");
  $("startBtn").disabled = true;
  if (!(await openCam())) {
    if (!CONFIG.mock) { $("startBtn").disabled = false; return toast("Kamera atau mikrofon tidak dapat diakses."); }
    $("phText").textContent = "Mode demo (kamera tidak tersedia)";
    $("previewBtn").hidden = true;
    toast("Kamera tidak tersedia. Melanjutkan dalam mode demo.");
  }
  running = true; qi = 0; sec = 0; clips = [];
  $("guide").hidden = true;
  $("vtag").hidden = !stream;
  $("consentRow").hidden = true;
  $("startBtn").hidden = true;
  $("nextBtn").hidden = false;
  renderTop(); renderSide(); startRec();
  timer = setInterval(tick, 1000);
}

function tick() {
  sec++;
  $("timer").textContent = `${mmss(sec)} / ${mmss(CONFIG.maxDetikPerPertanyaan)}`;
  if (sec >= CONFIG.maxDetikPerPertanyaan) next();
}

async function next() {
  if (!running || busy) return;
  busy = true;
  clips[qi] = await stopRec();
  if (qi >= Q.length - 1) return finish();
  qi++; sec = 0;
  $("timer").textContent = `00:00 / ${mmss(CONFIG.maxDetikPerPertanyaan)}`;
  renderSide(); startRec();
  busy = false;
}

async function endEarly() {
  if (!running || busy) return;
  if (!confirm("Akhiri sesi sekarang? Pertanyaan yang belum dijawab tidak ikut dianalisis.")) return;
  busy = true;
  clips[qi] = await stopRec();
  finish();
}

async function finish() {
  running = false;
  clearInterval(timer);
  stream?.getTracks().forEach((t) => t.stop());
  $("cam").style.display = "none";
  $("vtag").hidden = true;
  $("nextBtn").hidden = true;
  $("proc").hidden = false;
  renderTop("Memproses…");
  try {
    const asked = soal.slice(0, clips.length);
    const id = await createJob({ role: role.id, soal: asked, blobs: clips, bahasa: settings.get().bahasa, attempt });
    const hasil = await poll(id);
    hasil.pertanyaan.forEach((q, i) => { q.id ??= asked[i]?.id; q.kompetensi ??= asked[i]?.kompetensi; });
    reports.add({ id, role: role.id, roleNama: role.nama, attempt, pid: pid(), ...hasil });
    location.href = `report.html?id=${id}`;
  } catch (e) {
    $("procMsg").textContent = "Terjadi kendala: " + e.message;
    $("retryBtn").hidden = false;
  }
}

async function poll(id) {
  while (true) {
    const j = await getJob(id);
    $("procMsg").textContent = j.pesan || "Memproses…";
    $("procBar").style.width = Math.round((j.progres || 0) * 100) + "%";
    if (j.status === "selesai") return j.hasil;
    if (j.status === "gagal") throw new Error(j.pesan || "Analisis gagal");
    await new Promise((r) => setTimeout(r, 1200));
  }
}

$("previewBtn").onclick = async () => {
  if (await openCam()) $("guide").hidden = false;
  else toast("Kamera atau mikrofon tidak dapat diakses.");
};
$("startBtn").onclick = start;
$("nextBtn").onclick = next;
window.addEventListener("beforeunload", (e) => { if (running) { e.preventDefault(); e.returnValue = ""; } });
renderTop(); renderSide();