export const CONFIG = {
  mock: true,                         // true = data demo tanpa backend
  apiBase: "http://localhost:8000",
  maxDetikPerPertanyaan: 120,
  minDeteksi: 0.6,                    // di bawah ini data visual ditandai "tidak memadai"
};

export const MODEL_LABEL = { head: "Arah kepala", gaze: "Arah pandang" };

export const TONE = {
  good: ["center", "centre", "front", "neutral"],
  bad: ["down"],
};