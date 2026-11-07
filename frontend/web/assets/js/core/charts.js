const W = 480, H = 200, L = 32, R = 10, T = 14, B = 28;

function axes(labels, ticks, y, xAt) {
  let g = "";
  ticks.forEach((v) => {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)"/>
          <text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" style="fill:var(--muted)">${v}</text>`;
  });
  labels.forEach((l, i) => {
    g += `<text x="${xAt(i)}" y="${H - 8}" text-anchor="middle" font-size="11.5" style="fill:var(--muted)">${l}</text>`;
  });
  return g;
}
const svg = (g) => `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${g}</svg>`;
const legend = (series) =>
  `<div class="legend small muted">${series.map((s) => `<span><i style="background:${s.c}"></i>${s.n}</span>`).join("")}</div>`;

// Grafik garis; ref = garis target putus-putus (opsional)
export function lineChart(labels, series, { max = 100, unit = "%", ref = null } = {}) {
  const n = labels.length;
  const xAt = (i) => (n === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v) => T + (1 - v / max) * (H - T - B);
  let g = axes(labels, [0, 1, 2, 3, 4].map((k) => Math.round((max * k) / 4)), y, xAt);
  if (ref != null)
    g += `<line x1="${L}" x2="${W - R}" y1="${y(ref)}" y2="${y(ref)}" style="stroke:var(--muted);stroke-dasharray:5 4"/>`;
  series.forEach((s) => {
    const pts = s.v.map((v, i) => (v == null ? null : [xAt(i), y(v), v, i])).filter(Boolean);
    if (pts.length > 1)
      g += `<polyline points="${pts.map((p) => p[0] + "," + p[1]).join(" ")}" style="fill:none;stroke:${s.c};stroke-width:2.5"/>`;
    g += pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" style="fill:var(--surface);stroke:${s.c};stroke-width:2"><title>${s.n} ${labels[p[3]]}: ${Math.round(p[2])}${unit}</title></circle>`).join("");
  });
  return svg(g) + legend(series);
}

// Grafik batang berkelompok (nilai bulat, mis. jumlah kejadian)
export function barChart(labels, series) {
  const n = labels.length, k = series.length;
  const top = Math.max(1, ...series.flatMap((s) => s.v.map((v) => v ?? 0)));
  const step = top <= 5 ? 1 : Math.ceil(top / 4);
  const max = Math.ceil(top / step) * step;
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const gw = (W - L - R) / n, xAt = (i) => L + (i + 0.5) * gw;
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  let g = axes(labels, ticks, y, xAt);
  const bw = Math.min(28, (gw * 0.7) / k), gap = 4;
  series.forEach((s, j) => {
    s.v.forEach((v, i) => {
      if (v == null) return;
      const x0 = xAt(i) - (k * bw + (k - 1) * gap) / 2 + j * (bw + gap);
      g += `<rect x="${x0}" y="${y(v)}" width="${bw}" height="${(v / max) * (H - T - B)}" rx="3" style="fill:${s.c}"><title>${s.n} ${labels[i]}: ${v}</title></rect>`;
      if (v > 0) g += `<text x="${x0 + bw / 2}" y="${y(v) - 4}" text-anchor="middle" font-size="11" style="fill:var(--ink)">${v}</text>`;
    });
  });
  return svg(g) + legend(series);
}