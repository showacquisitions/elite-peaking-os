/* Elite OS v5.0 — Unified Rings, Sparklines & Touch-Scrubbable SVG Charts */
function sparkline(vals, w, h) {
  const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 3 - (v - mn) / r * (h - 6)).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--accent2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function ring(pct) {
  const r = 22, c = 2 * Math.PI * r;
  return `<svg width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--panel2)" stroke-width="5.5"/><circle class="arc" cx="28" cy="28" r="${r}" fill="none" stroke="var(--green)" stroke-width="5.5" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - clamp01(pct))).toFixed(1)}" transform="rotate(-90 28 28)"/><text x="28" y="32" text-anchor="middle" fill="var(--text)" font-size="11.5" font-weight="800">${Math.round(pct * 100)}%</text></svg>`;
}

function ringSm(p, color, label, val, sub) {
  const r = 30, c = 2 * Math.PI * r, q = clamp01(p || 0);
  return `<div class="cring"><div class="cring-g"><svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--panel3)" stroke-width="6.5"/><circle class="arc" cx="38" cy="38" r="${r}" fill="none" stroke="${color}" stroke-width="6.5" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - q)).toFixed(1)}" transform="rotate(-90 38 38)"/></svg><b>${val}</b></div><span>${label}</span><small>${sub}</small></div>`;
}

function ringBig(p) {
  const r = 40, c = 2 * Math.PI * r, q = clamp01(p || 0);
  return `<svg width="96" height="96" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--panel3)" stroke-width="8"/><circle class="arc" cx="50" cy="50" r="${r}" fill="none" stroke="${q >= 1 ? "var(--green)" : "var(--accent)"}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - q)).toFixed(1)}" transform="rotate(-90 50 50)"/></svg>`;
}

function qGauge(score) {
  const g = QGRADE(score || 0), r = 52, c = Math.PI * r;
  const col = g[1] === "good" ? "var(--green)" : g[1] === "info" ? "var(--accent)" : g[1] === "warn" ? "var(--amber)" : "var(--red)";
  return `<div class="qg"><svg viewBox="0 0 120 70" width="150" aria-hidden="true"><path d="M8 62 A52 52 0 0 1 112 62" fill="none" stroke="var(--panel3)" stroke-width="9" stroke-linecap="round"/><path d="M8 62 A52 52 0 0 1 112 62" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - (score || 0) / 100)).toFixed(1)}"/></svg><div class="qg-n"><b>${score == null ? "–" : score}</b><small>${score == null ? "no data" : g[0]}</small></div></div>`;
}

/* Touch-scrubbable SVG chart builder (mouse + touch pointer drag) */
let CHART_UID = 0;
function buildInteractiveChart(cfg) {
  const id = "ch_" + (++CHART_UID);
  const Wd = cfg.w || (window.innerWidth < 700 ? 350 : 640);
  const H = cfg.h || (window.innerWidth < 700 ? 190 : 210);
  const L = 46, R = 12, T = 14, B = 28;
  const pts = cfg.series || [];
  const n = pts.length;
  const vals = pts.flatMap(p => [p.v, p.v2]).filter(v => v != null && isFinite(v));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (cfg.bar) lo = 0;
  const padY = (hi - lo) * 0.14 || 1;
  if (!cfg.bar) lo -= padY;
  hi += padY;
  const X = i => L + (n <= 1 ? (Wd - L - R) / 2 : i * (Wd - L - R) / (n - 1));
  const Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [0, 0.5, 1].map(t => lo + (hi - lo) * t);
  const bw = Math.max(2.5, Math.min(16, (Wd - L - R) / Math.max(1, n) - 2));
  const gradId = id + "_g";

  let marks = "", area = "", line1 = "", line2 = "";
  if (cfg.bar) {
    marks = pts.map((p, i) => p.v == null ? "" : `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${Y(p.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, H - B - Y(p.v)).toFixed(1)}" rx="3" fill="var(--accent)" opacity="0.82"/>`).join("");
  } else {
    const valid = pts.map((p, i) => p.v != null ? [i, X(i), Y(p.v), p] : null).filter(Boolean);
    if (cfg.connect && valid.length >= 2) {
      const poly = valid.map(x => `${x[1].toFixed(1)},${x[2].toFixed(1)}`).join(" ");
      area = `<polygon points="${valid[0][1].toFixed(1)},${H - B} ${poly} ${valid[valid.length - 1][1].toFixed(1)},${H - B}" fill="url(#${gradId})"/>`;
      line1 = `<polyline points="${poly}" class="cline"/>`;
    }
    marks = valid.map(([, x, y], k) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${cfg.connect && k === valid.length - 1 ? 4.5 : n > 45 ? 2.2 : 3.2}" class="cdot"/>`).join("");
  }

  /* Secondary trend / rolling line */
  if (pts.some(p => p.v2 != null)) {
    let seg = [], d = "";
    pts.forEach((p, i) => {
      if (p.v2 == null) { if (seg.length > 1) d += "M" + seg.join("L"); seg = []; }
      else seg.push(X(i).toFixed(1) + "," + Y(p.v2).toFixed(1));
    });
    if (seg.length > 1) d += "M" + seg.join("L");
    if (d) line2 = `<path d="${d}" fill="none" stroke="var(--text)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.92"/>`;
  }

  const last = [...pts].reverse().find(p => p.v != null || p.v2 != null);
  const fmtTip = p => {
    if (!p) return "<span>Drag or hover chart to inspect</span><span></span>";
    const main = p.v != null ? `<b>${esc(cfg.fmt(p.v))}</b>` : "<span class='na'>no reading</span>";
    const sec = p.v2 != null && cfg.label2 ? ` · ${esc(cfg.label2)} <b>${esc(cfg.fmt(p.v2))}</b>` : "";
    return `<span>${esc(p.label)}</span><span>${main}${sec}</span>`;
  };

  const payload = pts.map((p, i) => ({ x: +X(i).toFixed(1), y: p.v != null ? +Y(p.v).toFixed(1) : (p.v2 != null ? +Y(p.v2).toFixed(1) : null), label: p.label, v: p.v != null ? cfg.fmt(p.v) : null, v2: p.v2 != null ? cfg.fmt(p.v2) : null }));
  const html = `<div class="chart-wrap" data-chart-id="${id}" data-label2="${esc(cfg.label2 || "")}">
    <div class="chart-tip" id="${id}_tip">${fmtTip(last)}</div>
    <svg class="${cfg.svgClass || "biochart"}" viewBox="0 0 ${Wd} ${H}" width="100%" role="img" aria-label="${esc(cfg.aria || "Chart")}">
      <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map(t => `<line x1="${L}" x2="${Wd - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" class="cg1"/><text x="${L - 7}" y="${(Y(t) + 3).toFixed(1)}" text-anchor="end" class="ct">${esc(cfg.fmtAxis ? cfg.fmtAxis(t) : cfg.fmt(t))}</text>`).join("")}
      ${area}${marks}${line1}${line2}
      <line id="${id}_cx" x1="0" x2="0" y1="${T}" y2="${H - B}" class="chart-cross" hidden/>
      <circle id="${id}_cp" cx="0" cy="0" r="5" fill="var(--cta-bg)" stroke="var(--accent)" stroke-width="2" hidden/>
      <text x="${L}" y="${H - 7}" class="ct">${esc(cfg.startLabel || (pts[0] ? pts[0].label : ""))}</text>
      <text x="${Wd - R}" y="${H - 7}" text-anchor="end" class="ct">${esc(cfg.endLabel || "today")}</text>
    </svg>
  </div>`;
  window.__CHARTS = window.__CHARTS || {};
  window.__CHARTS[id] = { pts: payload, Wd, L, R };
  return html;
}

/* Global pointer scrubbing for every interactive chart */
(function () {
  function scrub(wrap, clientX) {
    const id = wrap.dataset.chartId, c = window.__CHARTS && window.__CHARTS[id];
    if (!c || !c.pts.length) return;
    const svg = wrap.querySelector("svg"); if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = (clientX - rect.left) / rect.width * c.Wd;
    let best = c.pts[0], bd = Infinity;
    for (const p of c.pts) { const d = Math.abs(p.x - sx); if (d < bd) { bd = d; best = p; } }
    const cx = document.getElementById(id + "_cx"), cp = document.getElementById(id + "_cp"), tip = document.getElementById(id + "_tip");
    if (cx) { cx.setAttribute("x1", best.x); cx.setAttribute("x2", best.x); cx.removeAttribute("hidden"); }
    if (cp && best.y != null) { cp.setAttribute("cx", best.x); cp.setAttribute("cy", best.y); cp.removeAttribute("hidden"); }
    else if (cp) cp.setAttribute("hidden", "");
    if (tip) {
      const l2 = wrap.dataset.label2;
      const m = best.v != null ? `<b>${esc(best.v)}</b>` : "<span class='na'>no reading</span>";
      const s = best.v2 != null && l2 ? ` · ${esc(l2)} <b>${esc(best.v2)}</b>` : "";
      tip.innerHTML = `<span>${esc(best.label)}</span><span>${m}${s}</span>`;
    }
  }
  document.addEventListener("pointermove", e => {
    const w = e.target.closest && e.target.closest(".chart-wrap");
    if (w && (e.pointerType === "mouse" || e.buttons > 0)) scrub(w, e.clientX);
  });
  document.addEventListener("pointerdown", e => {
    const w = e.target.closest && e.target.closest(".chart-wrap");
    if (w) scrub(w, e.clientX);
  });
})();
