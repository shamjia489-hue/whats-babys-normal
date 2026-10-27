// Shared chart helpers: theme tokens, Chart.js defaults, small plugins, SVG tooltips.

const registry = new Map();

export function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function theme() {
  return {
    sleep: css("--sleep"), feed: css("--feed"), fussy: css("--fussy"),
    wet: css("--wet"), dirty: css("--dirty"), weight: css("--weight"),
    band: css("--band"), grid: css("--line-soft"), axis: css("--line"),
    ink: css("--ink"), ink2: css("--muted"), muted: css("--faint"),
    surface: css("--card"), bg: css("--bg"), centile: css("--centile"), centile50: css("--centile-50"),
    primary: css("--primary"), margin: css("--margin"),
  };
}

export function withAlpha(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Shaded reference range (e.g. NHS 8-18 hours) and threshold lines.
const rangePlugin = {
  id: "range",
  beforeDatasetsDraw(chart, _args, opts) {
    if (!opts || (opts.min == null && opts.max == null && !opts.lines)) return;
    const { ctx, chartArea: a, scales: { y } } = chart;
    const t = theme();
    ctx.save();
    if (opts.min != null || opts.max != null) {
      const top = opts.max != null ? Math.max(a.top, y.getPixelForValue(opts.max)) : a.top;
      const bottom = opts.min != null ? Math.min(a.bottom, y.getPixelForValue(opts.min)) : a.bottom;
      ctx.fillStyle = opts.color || t.band;
      ctx.fillRect(a.left, top, a.right - a.left, bottom - top);
      if (opts.label) {
        ctx.fillStyle = t.ink2;
        ctx.font = "11px Figtree, system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(opts.label, a.right - 4, top + 12);
      }
    }
    for (const line of opts.lines || []) {
      const py = y.getPixelForValue(line.value);
      if (py < a.top || py > a.bottom) continue;
      ctx.strokeStyle = t.muted;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.stroke();
      ctx.fillStyle = t.ink2;
      ctx.font = "11px Figtree, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(line.label, a.right - 4, py - 4);
    }
    ctx.restore();
  },
};

// Direct labels at the end of datasets that set `endLabel`.
const endLabelPlugin = {
  id: "endLabel",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const t = theme();
    chart.data.datasets.forEach((ds, i) => {
      if (!ds.endLabel || !chart.isDatasetVisible(i)) return;
      const meta = chart.getDatasetMeta(i);
      const last = meta.data[meta.data.length - 1];
      if (!last) return;
      ctx.save();
      ctx.fillStyle = t.muted;
      ctx.font = "11px Figtree, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(ds.endLabel, last.x + 6, last.y);
      ctx.restore();
    });
  },
};

let registered = false;
function setup() {
  if (registered || !window.Chart) return;
  window.Chart.register(rangePlugin, endLabelPlugin);
  registered = true;
}

export function applyDefaults() {
  setup();
  const C = window.Chart;
  if (!C) return;
  const t = theme();
  C.defaults.font.family = "Figtree, system-ui, sans-serif";
  C.defaults.font.size = 11;
  C.defaults.color = t.muted;
  C.defaults.borderColor = t.grid;
  C.defaults.maintainAspectRatio = false;
  C.defaults.animation = false;
  C.defaults.plugins.legend.display = false;
  C.defaults.plugins.tooltip.backgroundColor = t.ink;
  C.defaults.plugins.tooltip.titleColor = t.bg;
  C.defaults.plugins.tooltip.bodyColor = t.bg;
  C.defaults.plugins.tooltip.padding = 10;
  C.defaults.plugins.tooltip.cornerRadius = 8;
  C.defaults.plugins.tooltip.titleFont = { family: "Figtree, system-ui, sans-serif", weight: "600" };
  C.defaults.plugins.tooltip.boxPadding = 4;
  C.defaults.elements.bar.borderRadius = 5;
  C.defaults.elements.bar.borderSkipped = "start";
  C.defaults.elements.line.borderWidth = 2;
  C.defaults.elements.line.borderCapStyle = "round";
  C.defaults.elements.line.borderJoinStyle = "round";
  C.defaults.elements.point.radius = 0;
  C.defaults.elements.point.hoverRadius = 5;
  C.defaults.elements.point.hitRadius = 8;
  C.defaults.scale.grid.color = t.grid;
  C.defaults.scale.border.color = t.axis;
  C.defaults.scales.linear.border = { display: false };
  C.defaults.scale.ticks.color = t.muted;
}

export function makeChart(canvas, config) {
  if (!window.Chart || !canvas) return null;
  const key = canvas.id || canvas;
  registry.get(key)?.destroy();
  const chart = new window.Chart(canvas, config);
  registry.set(key, chart);
  return chart;
}

export function destroyCharts(container) {
  for (const [key, chart] of registry) {
    if (!container || container.contains(chart.canvas)) {
      chart.destroy();
      registry.delete(key);
    }
  }
}

// Bars: thin, rounded data-end, square at the baseline, 2px surface gap.
export function barDataset(label, data, color, extra = {}) {
  return {
    label, data,
    backgroundColor: color, hoverBackgroundColor: color,
    borderColor: theme().surface, borderWidth: { left: 1, right: 1, top: 0, bottom: 0 },
    maxBarThickness: 24, categoryPercentage: 0.8, barPercentage: 0.9,
    ...extra,
  };
}

// ---------- SVG tooltip (timeline + rhythm) ----------
let tip;
export function attachSvgTips(root) {
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "svg-tip";
    tip.hidden = true;
    document.body.appendChild(tip);
  }
  const show = (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el || !root.contains(el)) { tip.hidden = true; return; }
    tip.textContent = el.getAttribute("data-tip");
    tip.hidden = false;
    const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    const y = e.clientY + 14 + tip.offsetHeight > window.innerHeight ? e.clientY - tip.offsetHeight - 10 : e.clientY + 14;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  };
  root.addEventListener("pointermove", show);
  root.addEventListener("pointerdown", show);
  root.addEventListener("pointerleave", () => (tip.hidden = true));
}

// Diagonal hatch for fussy spells (texture as a second cue alongside colour).
export function hatchDefs(svg, id, color) {
  const defs = svgEl("defs");
  const p = svgEl("pattern", { id, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(135)" });
  p.append(svgEl("rect", { width: 6, height: 6, fill: color, "fill-opacity": 0.28 }));
  p.append(svgEl("rect", { width: 3, height: 6, fill: color }));
  defs.append(p);
  svg.append(defs);
  return `url(#${id})`;
}

export const svgEl = (tag, attrs = {}, text) => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
};
