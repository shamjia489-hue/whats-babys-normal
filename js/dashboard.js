// Tab 1: Baby's data - summary tiles, the four views, growth and 24-hour rhythm.
import { RANGES, inRange } from "./ranges.js";
import { SOURCE_BY_ID } from "./sources.js";
import { mean, fmtHM, fmtClock, centileLines, centilePosition } from "./data.js";
import { theme, withAlpha, makeChart, destroyCharts, barDataset, attachSvgTips, svgEl, hatchDefs, applyDefaults } from "./charts.js";
import { TOTAL_DAYS } from "./config.js";

let D; // { events, days, growth }
const state = { view: "daily", period: 1 };
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------------------------------------------------------------- periods
const VIEWS = {
  daily: { options: () => range(1, TOTAL_DAYS).map((d) => ({ value: d, label: `Day ${d} (week ${Math.ceil(d / 7)})` })), days: (p) => [p], prevLabel: (p) => `Day ${p - 1}` },
  weekly: { options: () => range(1, 7).map((w) => ({ value: w, label: `Week ${w} (days ${w * 7 - 6}–${w * 7})` })), days: (p) => range(p * 7 - 6, p * 7), prevLabel: (p) => `week ${p - 1}` },
  monthly: { options: () => [{ value: 1, label: "Month 1 (days 1–28)" }, { value: 2, label: "Month 2 (days 29–49)" }], days: (p) => (p === 1 ? range(1, 28) : range(29, 49)), prevLabel: () => "month 1" },
  overview: { options: () => [{ value: 1, label: "All 49 days" }], days: () => range(1, TOTAL_DAYS), prevLabel: () => "" },
};
function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
const daysOf = (nums) => nums.map((n) => D.days[n - 1]).filter((d) => d && d.logged);

// ---------------------------------------------------------------- metrics
const ICONS = {
  feeds: '<path d="M6 2h4M7 2v2.5L5 7v6.5a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5V7L9 4.5V2M5 9h6"/>',
  feedtime: '<circle cx="8" cy="8.5" r="5.5"/><path d="M8 5.5v3l2 1.5M6.5 1.5h3"/>',
  sleep: '<path d="M12.5 10.2A5.5 5.5 0 0 1 5.8 3.5a5.5 5.5 0 1 0 6.7 6.7z"/>',
  wet: '<path d="M8 2s4 4.6 4 7.5a4 4 0 0 1-8 0C4 6.6 8 2 8 2z"/>',
  dirty: '<path d="M2.5 5.5h11l-1.2 6a1.5 1.5 0 0 1-1.5 1.2H5.2a1.5 1.5 0 0 1-1.5-1.2zM5 5.5c0-1.6 1.3-2.7 3-2.7s3 1.1 3 2.7"/>',
  fussy: '<path d="M1.5 8.5c1.2-2.5 2.3-2.5 3.3 0s2.1 2.5 3.2 0 2.1-2.5 3.2 0 2.1 2.5 3.3 0"/>',
};
const icon = (k, color) =>
  `<span class="ico" aria-hidden="true" style="color:var(--${color})"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg></span>`;

const METRICS = [
  { key: "feeds", icon: "feeds", label: "Feeds", color: "feed", unit: (multi) => (multi ? "a day" : ""), fmt: (v, multi) => (multi ? v.toFixed(1) : String(Math.round(v))), deltaFmt: (d) => d.toFixed(1) },
  { key: "avgFeedMin", icon: "feedtime", label: "Average feed length", color: "feed", unit: () => "min", fmt: (v) => String(Math.round(v)), deltaFmt: (d) => `${Math.round(d)} min` },
  { key: "sleepMin", icon: "sleep", label: "Total sleep", color: "sleep", unit: (multi) => (multi ? "a day" : ""), fmt: (v) => fmtHM(v), deltaFmt: (d) => fmtHM(Math.abs(d)) },
  { key: "wet", icon: "wet", label: "Wet nappies", color: "wet", unit: (multi) => (multi ? "a day" : ""), fmt: (v, multi) => (multi ? v.toFixed(1) : String(v)), deltaFmt: (d) => d.toFixed(1) },
  { key: "dirty", icon: "dirty", label: "Dirty nappies", color: "dirty", unit: (multi) => (multi ? "a day" : ""), fmt: (v, multi) => (multi ? v.toFixed(1) : String(v)), deltaFmt: (d) => d.toFixed(1) },
  { key: "fussyMin", icon: "fussy", label: "Fussy time", color: "fussy", unit: (multi) => (multi ? "a day" : ""), fmt: (v) => fmtHM(v), deltaFmt: (d) => fmtHM(Math.abs(d)) },
];

function rangeStats(key, days) {
  if (!RANGES[key]) return null;
  const checks = days.map((d) => inRange(key, d.day, d[key])).filter((r) => r !== null);
  return { ok: checks.filter(Boolean).length, total: checks.length };
}

function statusHTML(key, days, multi) {
  const r = rangeStats(key, days);
  if (!r) return `<span class="pill info">No set range</span>`;
  if (r.total === 0) return `<span class="pill info">No set minimum now</span>`;
  const all = r.ok === r.total;
  const text = multi ? `${r.ok} of ${r.total} days in range` : all ? "In range" : "Outside range";
  return `<span class="pill ${all ? "ok" : "watch"}"><span aria-hidden="true">${all ? "✓" : "!"}</span>${text}</span>`;
}

function rangeNote(key, days) {
  const R = RANGES[key];
  if (!R) return "";
  const src = SOURCE_BY_ID[R.source];
  if (days.length === 1) {
    const r = R.for(days[0].day);
    let txt = "No set minimum after 4 weeks";
    if (r) {
      const f = (v) => (key === "sleepMin" || key === "fussyMin" ? `${v / 60}h` : v);
      txt = r.min != null && r.max != null ? `Range ${f(r.min)}–${f(r.max)}` : r.min != null ? `Range ${f(r.min)}+` : `Flag over ${f(r.max)}`;
    }
    return `${txt} · <a href="${src.url}" target="_blank" rel="noopener">${esc(src.publisher)}</a>`;
  }
  return `${esc(R.note)} · <a href="${src.url}" target="_blank" rel="noopener">${esc(src.publisher)}</a>`;
}

function renderSummary() {
  const v = VIEWS[state.view];
  const nums = v.days(state.period);
  const days = daysOf(nums);
  const multi = nums.length > 1;
  let prev = null, prevLabel = "";
  if (state.view === "overview") {
    prev = { cur: daysOf(range(43, 49)), prev: daysOf(range(1, 7)) };
  } else if (state.period > 1) {
    prev = { cur: days, prev: daysOf(v.days(state.period - 1)) };
    prevLabel = v.prevLabel(state.period);
  }
  $("#summary").innerHTML = METRICS.map((m) => {
    const val = mean(days.map((d) => d[m.key]));
    let delta = "";
    if (prev) {
      const a = mean(prev.cur.map((d) => d[m.key])), b = mean(prev.prev.map((d) => d[m.key]));
      if (a != null && b != null) {
        const d = a - b;
        const cmp = state.view === "overview" ? "week 7 vs week 1" : `vs ${prevLabel}`;
        delta = Math.abs(d) < 0.05
          ? `<span>No change ${cmp}</span>`
          : `<span class="delta">${d > 0 ? "▲" : "▼"} ${m.deltaFmt(Math.abs(d))}</span><span>${cmp}</span>`;
      }
    }
    return `<div class="kpi">
      <div class="k-top">${icon(m.icon, m.color)}${m.label}</div>
      <div class="val num">${val == null ? "–" : m.fmt(val, multi)}<small>${m.unit(multi)}</small></div>
      <div class="foot">${statusHTML(m.key, days, multi)}</div>
      ${delta ? `<div class="foot">${delta}</div>` : ""}
      <div class="range">${rangeNote(m.key, days)}</div>
    </div>`;
  }).join("");
}

// ---------------------------------------------------------------- daily view
function segmentsForDay(day, type) {
  const d0 = (day - 1) * 1440, d1 = d0 + 1440;
  return D.events
    .filter((e) => e.type === type && e.abs != null && e.abs < d1 && e.abs + (e.duration || 0) > d0 - 0.1)
    .map((e) => ({ a: Math.max(e.abs, d0) - d0, b: Math.min(e.abs + (e.duration || 0), d1) - d0, e }))
    .filter((s) => s.b >= s.a);
}

function renderTimeline(el, day) {
  const T = theme();
  el.innerHTML = "";
  const W = Math.max(300, el.clientWidth || 600);
  const left = W < 480 ? 54 : 70, right = 10, top = 22;
  const lanes = [
    { key: "sleep", label: "Sleep", color: T.sleep },
    { key: "feed", label: "Feeds", color: T.feed },
    { key: "fussy", label: "Fussy", color: T.fussy },
    { key: "nappy", label: "Nappies", color: T.wet },
  ];
  const laneH = 30, H = top + lanes.length * laneH + 8;
  const x = (min) => left + (min / 1440) * (W - left - right);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": `24-hour timeline for Day ${day}` });
  const hatch = hatchDefs(svg, "hatch-day", T.fussy);

  for (let h = 0; h <= 24; h += W < 480 ? 6 : 3) {
    svg.append(svgEl("line", { x1: x(h * 60), x2: x(h * 60), y1: top - 4, y2: H - 8, stroke: T.grid, "stroke-width": 1 }));
    const lab = h === 0 || h === 24 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`;
    svg.append(svgEl("text", { x: x(h * 60), y: 12, "text-anchor": h === 0 ? "start" : h === 24 ? "end" : "middle" }, lab));
  }
  lanes.forEach((ln, i) => {
    const y = top + i * laneH;
    svg.append(svgEl("text", { x: 0, y: y + laneH / 2 + 4 }, ln.label));
    if (ln.key === "nappy") {
      for (const t of ["wet", "dirty"]) {
        for (const s of segmentsForDay(day, t)) {
          const cx = x(s.a), cy = y + laneH / 2;
          const tipText = `${t === "wet" ? "Wet" : "Dirty"} nappy · ${fmtClock(s.a)}${s.e.colour ? ` · ${s.e.colour}` : ""}`;
          const shape = t === "wet"
            ? svgEl("path", { d: `M${cx} ${cy - 7} L${cx + 6.5} ${cy + 5} L${cx - 6.5} ${cy + 5} Z`, fill: T.wet, stroke: T.surface, "stroke-width": 2, "data-tip": tipText })
            : svgEl("circle", { cx, cy, r: 5.5, fill: T.dirty, stroke: T.surface, "stroke-width": 2, "data-tip": tipText });
          svg.append(shape);
        }
      }
      return;
    }
    for (const s of segmentsForDay(day, ln.key)) {
      const w = Math.max(3, x(s.b) - x(s.a));
      const what = ln.key === "sleep" ? "Sleep" : ln.key === "feed" ? "Feed" : "Fussy spell";
      const extra = ln.key === "feed" && s.e.text ? ` · ${s.e.text}` : ln.key === "fussy" && s.e.text ? ` · ${s.e.text}` : "";
      svg.append(svgEl("rect", {
        x: x(s.a), y: y + 6, width: w, height: laneH - 12, rx: 4, fill: ln.key === "fussy" ? hatch : ln.color,
        "data-tip": `${what} · ${fmtClock(s.e.start)} for ${fmtHM(s.e.duration)}${extra}${s.e.flag ? " · flagged: unclear" : ""}`,
      }));
    }
  });
  el.append(svg);
}

function notesListHTML(d, withDay = false) {
  const rows = [];
  const pre = withDay ? `Day ${d.day}` : "";
  if (d.temperament) rows.push(["Temperament", esc(d.temperament)]);
  for (const t of d.temps) rows.push(["Temperature", `${t.value.toFixed(1)}°C at ${esc(t.time)}${t.text ? ` – ${esc(t.text)}` : ""}`]);
  if (d.bath) rows.push(["Bath", "Yes"]);
  if (d.weightKg != null) rows.push(["Weight", `${d.weightKg.toFixed(2)} kg`]);
  for (const n of d.notes) rows.push(["Note", `${esc(n.text)}${n.flag ? '<span class="flag-unclear">handwriting unclear</span>' : ""}`]);
  if (withDay) return rows.length ? `<li><span class="nk">${pre}</span><span>${rows.map(([k, v]) => `<strong>${k}:</strong> ${v}`).join("<br>")}</span></li>` : "";
  return rows.map(([k, v]) => `<li><span class="nk">${k}</span><span>${v}</span></li>`).join("") || `<li><span class="nk">–</span><span>No notes for this day.</span></li>`;
}

function renderDaily(body, day) {
  const d = D.days[day - 1];
  const T = theme();
  body.innerHTML = `
    <div class="view-grid">
      <div class="chart-card span-2">
        <h3>Day ${day} at a glance</h3>
        <p class="sub">Midnight to midnight. Hover or tap a block for details.</p>
        <div class="legend">
          <span><i class="sw" style="background:${T.sleep}"></i>Sleep</span><span><i class="sw" style="background:${T.feed}"></i>Feed</span>
          <span><i class="sw hatch"></i>Fussy spell</span>
          <span><svg width="12" height="12" aria-hidden="true"><path d="M6 0 L12 11 L0 11 Z" fill="${T.wet}"/></svg>Wet nappy</span>
          <span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5.5" fill="${T.dirty}"/></svg>Dirty nappy</span>
        </div>
        <div class="timeline" id="timeline"></div>
      </div>
      <div class="chart-card">
        <h3>Feed lengths</h3>
        <p class="sub">${d.feeds} feeds · average ${d.avgFeedMin ? Math.round(d.avgFeedMin) : "–"} min</p>
        <div class="chart-wrap"><canvas id="feed-len" role="img" aria-label="Bar chart of each feed's length in minutes"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Notes</h3>
        <p class="sub">From the notebook</p>
        <ul class="notes">${notesListHTML(d)}</ul>
      </div>
    </div>`;
  const tl = $("#timeline", body);
  renderTimeline(tl, day);
  attachSvgTips(tl);
  const feeds = d.events.filter((e) => e.type === "feed");
  makeChart($("#feed-len", body), {
    type: "bar",
    data: { labels: feeds.map((f) => fmtClock(f.start)), datasets: [barDataset("Feed length (min)", feeds.map((f) => f.duration), T.feed)] },
    options: {
      scales: { y: { beginAtZero: true, title: { display: true, text: "minutes" } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } } },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.parsed.y} min${feeds[c.dataIndex].text ? ` · ${feeds[c.dataIndex].text}` : ""}` } } },
    },
  });
}

// ---------------------------------------------------------------- weekly view
function renderWeekly(body, week) {
  const days = daysOf(range(week * 7 - 6, week * 7));
  const labels = days.map((d) => `Day ${d.day}`);
  const T = theme();
  body.innerHTML = `
    <div class="view-grid">
      <div class="chart-card">
        <h3>Feeds per day</h3><p class="sub">Shaded band: 8–12 a day (Mayo Clinic)</p>
        <div class="chart-wrap"><canvas id="wk-feeds" role="img" aria-label="Feeds per day"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Nappies per day</h3><p class="sub">Minimums vary by age (NHS)</p>
        <div class="legend"><span><i class="sw" style="background:${T.wet}"></i>Wet</span><span><i class="sw" style="background:${T.dirty}"></i>Dirty</span></div>
        <div class="chart-wrap short"><canvas id="wk-nappies" role="img" aria-label="Wet and dirty nappies per day"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Sleep per day</h3><p class="sub">Against the NHS normal range of 8–18 hours</p>
        <div class="legend"><span><i class="sw" style="background:${T.sleep}"></i>Total sleep</span><span><i class="sw band"></i>NHS range</span></div>
        <div class="chart-wrap short"><canvas id="wk-sleep" role="img" aria-label="Hours of sleep per day against the NHS range"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Fussy time and longest sleep</h3><p class="sub">Hours per day</p>
        <div class="legend"><span><i class="sw line" style="background:${T.fussy}"></i>Fussy time</span><span><i class="sw line" style="background:${T.sleep}"></i>Longest sleep stretch</span></div>
        <div class="chart-wrap short"><canvas id="wk-lines" role="img" aria-label="Fussy time and longest sleep stretch in hours"></canvas></div>
      </div>
      <div class="chart-card span-2">
        <h3>This week's notes</h3>
        <ul class="notes">${days.map((d) => notesListHTML(d, true)).join("")}</ul>
      </div>
    </div>`;
  const xNoGrid = { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } };
  makeChart($("#wk-feeds", body), {
    type: "bar",
    data: { labels, datasets: [barDataset("Feeds", days.map((d) => d.feeds), T.feed)] },
    options: { scales: { x: xNoGrid, y: { beginAtZero: true, suggestedMax: 14 } }, plugins: { range: { min: 8, max: 12 } } },
  });
  makeChart($("#wk-nappies", body), {
    type: "bar",
    data: { labels, datasets: [barDataset("Wet", days.map((d) => d.wet), T.wet), barDataset("Dirty", days.map((d) => d.dirty), T.dirty)] },
    options: { scales: { x: xNoGrid, y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { tooltip: { mode: "index" } } },
  });
  makeChart($("#wk-sleep", body), {
    type: "bar",
    data: { labels, datasets: [barDataset("Sleep (h)", days.map((d) => +(d.sleepMin / 60).toFixed(1)), T.sleep)] },
    options: {
      scales: { x: xNoGrid, y: { beginAtZero: true, max: 24, ticks: { stepSize: 6, callback: (v) => `${v}h` } } },
      plugins: { range: { min: 8, max: 18, label: "NHS 8–18h" }, tooltip: { callbacks: { label: (c) => `Sleep: ${fmtHM(days[c.dataIndex].sleepMin)}` } } },
    },
  });
  makeChart($("#wk-lines", body), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Fussy time", data: days.map((d) => +(d.fussyMin / 60).toFixed(2)), borderColor: T.fussy, backgroundColor: T.fussy, pointRadius: 4, pointBorderColor: T.surface, pointBorderWidth: 2 },
        { label: "Longest sleep", data: days.map((d) => +((d.longestSleepMin || 0) / 60).toFixed(2)), borderColor: T.sleep, backgroundColor: T.sleep, pointRadius: 4, pointBorderColor: T.surface, pointBorderWidth: 2 },
      ],
    },
    options: {
      interaction: { mode: "index", intersect: false },
      scales: { x: xNoGrid, y: { beginAtZero: true, suggestedMax: 6, ticks: { callback: (v) => `${v}h` } } },
      plugins: { range: { lines: [{ value: 3, label: "3h – NHS colic threshold" }] }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtHM(c.parsed.y * 60)}` } } },
    },
  });
}

// ---------------------------------------------------------------- monthly view
function meterRows(days) {
  return Object.entries(RANGES).map(([key, R]) => {
    const r = rangeStats(key, days);
    if (!r || r.total === 0) return `<div class="range-row"><span>${R.label}</span><div class="bar"></div><span class="na">no set range</span></div>`;
    const pct = Math.round((r.ok / r.total) * 100);
    return `<div class="range-row" title="${r.ok} of ${r.total} days"><span>${R.label}</span><div class="bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${R.label}: days in range"><i style="width:${pct}%;background:var(--${R.color})"></i></div><span class="pct">${pct}%</span></div>`;
  }).join("");
}

function weeklyAverages(weeks) {
  return weeks.map((w) => {
    const ds = daysOf(range(w * 7 - 6, w * 7));
    return { week: w, feeds: mean(ds.map((d) => d.feeds)), sleepH: mean(ds.map((d) => d.sleepMin)) / 60, wet: mean(ds.map((d) => d.wet)), dirty: mean(ds.map((d) => d.dirty)), fussyH: mean(ds.map((d) => d.fussyMin)) / 60 };
  });
}

function renderMonthly(body, month) {
  const weeks = month === 1 ? [1, 2, 3, 4] : [5, 6, 7];
  const days = daysOf(VIEWS.monthly.days(month));
  const avg = weeklyAverages(weeks);
  const labels = weeks.map((w) => `Week ${w}`);
  const T = theme();
  const charts = [
    { id: "m-feeds", title: "Feeds a day", key: "feeds", color: T.feed, band: { min: 8, max: 12 }, fmt: (v) => v.toFixed(1) },
    { id: "m-sleep", title: "Sleep a day", key: "sleepH", color: T.sleep, band: { min: 8, max: 18 }, fmt: (v) => fmtHM(v * 60), max: 24 },
    { id: "m-wet", title: "Wet nappies a day", key: "wet", color: T.wet, fmt: (v) => v.toFixed(1) },
    { id: "m-dirty", title: "Dirty nappies a day", key: "dirty", color: T.dirty, fmt: (v) => v.toFixed(1) },
    { id: "m-fussy", title: "Fussy time a day", key: "fussyH", color: T.fussy, fmt: (v) => fmtHM(v * 60), lines: [{ value: 3, label: "3h" }] },
  ];
  body.innerHTML = `
    <div class="view-grid">
      ${charts.map((c) => `<div class="chart-card"><h3>${c.title}</h3><p class="sub">Weekly average</p><div class="chart-wrap short"><canvas id="${c.id}" role="img" aria-label="${c.title}, weekly averages"></canvas></div></div>`).join("")}
      <div class="chart-card"><h3>Days within each reference range</h3><p class="sub">Month ${month}: ${days.length} days</p><div class="ranges">${meterRows(days)}</div></div>
    </div>`;
  for (const c of charts) {
    makeChart($(`#${c.id}`, body), {
      type: "bar",
      data: { labels, datasets: [barDataset(c.title, avg.map((a) => a[c.key]), c.color)] },
      options: {
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, max: c.max, ticks: c.key.endsWith("H") ? { callback: (v) => `${v}h` } : {} } },
        plugins: { range: { ...(c.band || {}), lines: c.lines }, tooltip: { callbacks: { label: (ctx) => c.fmt(ctx.parsed.y) } } },
      },
    });
  }
}

// ---------------------------------------------------------------- overview
const TRENDS = [
  { key: "feeds", label: "Feeds a day", color: "feed", band: { min: 8, max: 12 }, on: true },
  { key: "sleepMin", label: "Total sleep (hours)", color: "sleep", scale: 1 / 60, band: { min: 8, max: 18 }, on: true },
  { key: "longestSleepMin", label: "Longest sleep stretch (hours)", color: "sleep", scale: 1 / 60, on: false },
  { key: "wet", icon: "wet", label: "Wet nappies", color: "wet", on: false },
  { key: "dirty", icon: "dirty", label: "Dirty nappies", color: "dirty", on: false },
  { key: "fussyMin", label: "Fussy time (hours)", color: "fussy", scale: 1 / 60, lines: [{ value: 3, label: "3h" }], on: true },
  { key: "avgFeedMin", label: "Average feed length (min)", color: "feed", on: false },
];
const trendOn = new Set(TRENDS.filter((t) => t.on).map((t) => t.key));

function rolling(values, n = 7) {
  return values.map((_, i) => {
    const win = values.slice(Math.max(0, i - n + 1), i + 1).filter((v) => v != null);
    return i < n - 1 || !win.length ? null : win.reduce((a, b) => a + b, 0) / win.length;
  });
}

function insights() {
  const wk = (w) => daysOf(range(w * 7 - 6, w * 7));
  const maxOf = (ds, k) => Math.max(...ds.map((d) => d[k] || 0));
  const w1 = wk(1), w7 = wk(7);
  const weekFussy = range(1, 7).map((w) => ({ w, v: mean(wk(w).map((d) => d.fussyMin)) }));
  const fussiest = weekFussy.reduce((a, b) => (b.v > a.v ? b : a));
  const g = D.growth;
  return [
    { k: "Longest sleep stretch", v: `${fmtHM(maxOf(w1, "longestSleepMin"))} → ${fmtHM(maxOf(w7, "longestSleepMin"))}`, s: "Week 1 vs week 7" },
    { k: "Fussiest week", v: `Week ${fussiest.w}`, s: `Averaged ${fmtHM(fussiest.v)} of fussy time a day` },
    { k: "Back to birth weight", v: g?.regainedDay ? `Day ${g.regainedDay}` : "Not yet recorded", s: "Usually within 1–2 weeks (Mayo Clinic); most babies by 3 weeks (Royal Berkshire NHS)" },
    { k: "Feeds a day", v: `${mean(w1.map((d) => d.feeds)).toFixed(1)} → ${mean(w7.map((d) => d.feeds)).toFixed(1)}`, s: "Week 1 vs week 7 average" },
  ];
}

function renderOverview(body) {
  const T = theme();
  body.innerHTML = `
    <div class="chart-card" style="margin-bottom:16px">
      <h3>Trends across all 49 days</h3>
      <p class="sub">Each measure gets its own chart and scale. Choose which to show under "Trend lines".</p>
      <div class="legend"><span><i class="sw line" style="background:${withAlpha(T.ink2, 0.35)}"></i>Daily value</span><span><i class="sw line" style="background:${T.ink2}"></i>7-day average</span><span><i class="sw band"></i>Reference range</span></div>
      <div class="small-multiples" id="trend-charts"></div>
    </div>
    <div class="view-grid">
      <div class="chart-card"><h3>Days within each reference range</h3><p class="sub">All 49 days</p><div class="ranges">${meterRows(daysOf(range(1, 49)))}</div></div>
      <div class="chart-card"><h3>Key insights</h3><div class="insights">${insights().map((i) => `<div class="ins"><div class="k">${i.k}</div><b>${i.v}</b><span>${i.s}</span></div>`).join("")}</div></div>
    </div>`;
  const draw = () => {
    const wrap = $("#trend-charts", body);
    destroyCharts(wrap);
    wrap.innerHTML = TRENDS.filter((t) => trendOn.has(t.key)).map((t) => `<div><h3 style="font-size:.92rem">${t.label}</h3><div class="chart-wrap short"><canvas id="tr-${t.key}" role="img" aria-label="${t.label} by day with 7-day average"></canvas></div></div>`).join("") || `<p class="sub">Pick at least one measure under "Trend lines".</p>`;
    for (const t of TRENDS.filter((t) => trendOn.has(t.key))) {
      const color = T[t.color];
      const vals = D.days.map((d) => (d[t.key] == null ? null : +(d[t.key] * (t.scale || 1)).toFixed(2)));
      const isTime = t.scale === 1 / 60;
      makeChart($(`#tr-${t.key}`, wrap), {
        type: "line",
        data: {
          labels: D.days.map((d) => `Day ${d.day}`),
          datasets: [
            { label: "Daily", data: vals, borderColor: withAlpha(color, 0.35), backgroundColor: withAlpha(color, 0.35), borderWidth: 1.5, spanGaps: true },
            { label: "7-day average", data: rolling(vals), borderColor: color, backgroundColor: color, borderWidth: 2.5, spanGaps: true },
          ],
        },
        options: {
          interaction: { mode: "index", intersect: false },
          scales: {
            x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: (_v, i) => (i % 7 === 0 ? `Day ${i + 1}` : "") } },
            y: { beginAtZero: true, ticks: isTime ? { callback: (v) => `${v}h` } : {} },
          },
          plugins: {
            range: { ...(t.band || {}), lines: t.lines },
            tooltip: { callbacks: { label: (c) => (c.parsed.y == null ? null : `${c.dataset.label}: ${isTime ? fmtHM(c.parsed.y * 60) : c.parsed.y.toFixed(1)}`) } },
          },
        },
      });
    }
  };
  draw();
}

// ---------------------------------------------------------------- growth
function renderGrowth() {
  const g = D.growth;
  const stats = $("#growth-stats");
  if (!g) { stats.innerHTML = `<p class="muted">No weigh-ins recorded yet.</p>`; return; }
  const kg = (v) => `${v.toFixed(2)} kg`;
  stats.innerHTML = [
    ["Birth weight", kg(g.birth.kg), `Day ${g.birth.day}${g.birthCentile ? ` · ${g.birthCentile.text}` : ""}`],
    ["Lowest weight", kg(g.lowest.kg), `Day ${g.lowest.day} · ${g.lostPct.toFixed(1)}% below birth weight`],
    ["Back to birth weight", g.regainedDay ? `Day ${g.regainedDay}` : "Not yet", "First weigh-in at or above birth weight"],
    ["Latest weight", kg(g.latest.kg), `Day ${g.latest.day}`],
    ["Current centile", g.latestCentile ? `~${Math.round(g.latestCentile.pct)}th` : "–", g.latestCentile ? g.latestCentile.text : "Centiles start at 2 weeks"],
  ].map(([k, v, s]) => `<div class="fact"><span>${k}</span><b>${v}<small>${s}</small></b></div>`).join("");

  const T = theme();
  $("#growth-legend").innerHTML = `<span><svg width="22" height="12" aria-hidden="true"><line x1="0" y1="6" x2="22" y2="6" stroke="${T.weight}" stroke-width="2"/><circle cx="11" cy="6" r="4" fill="${T.weight}"/></svg>Baby's weigh-ins</span><span><i class="sw line" style="background:${T.centile50}"></i>50th centile</span><span><i class="sw line" style="background:${T.centile}"></i>2nd, 9th, 91st, 98th centiles</span>`;
  const lines = centileLines();
  const datasets = lines.map((c) => ({
    label: `${c.label} centile`, data: c.points, borderColor: c.z === 0 ? T.centile50 : T.centile, borderWidth: c.z === 0 ? 1.5 : 1,
    pointRadius: 0, pointHoverRadius: 0, endLabel: c.label, order: 2,
  }));
  datasets.push({
    label: "Birth centiles (UK90)", data: lines.map((c) => ({ x: 1, y: c.birth })), showLine: false, pointRadius: 4, pointBackgroundColor: T.centile50, pointBorderWidth: 0, order: 2,
  });
  datasets.push({
    label: "Baby's weight", data: g.weighIns.map((w) => ({ x: w.day, y: w.kg })), borderColor: T.weight, backgroundColor: T.weight,
    pointRadius: 5, pointHoverRadius: 7, pointBorderColor: T.surface, pointBorderWidth: 2, borderWidth: 2, order: 1,
  });
  makeChart($("#growth-chart"), {
    type: "line",
    data: { datasets },
    options: {
      layout: { padding: { right: 34 } },
      parsing: false,
      scales: {
        x: { type: "linear", min: 1, max: 57, ticks: { stepSize: 7, callback: (v) => `Day ${v}` }, grid: { display: false } },
        y: { min: 2, max: 6.5, ticks: { stepSize: 0.5, callback: (v) => `${v} kg` } },
      },
      plugins: {
        tooltip: {
          filter: (c) => c.dataset.label === "Baby's weight",
          callbacks: {
            title: (items) => `Day ${items[0].parsed.x}`,
            label: (c) => {
              const pos = centilePosition(c.parsed.x, c.parsed.y);
              return `${c.parsed.y.toFixed(2)} kg${pos ? ` · ${pos.text}` : ""}`;
            },
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------- 24-hour rhythm
function renderRhythm() {
  const T = theme();
  $("#rhythm-legend").innerHTML = `<span><i class="sw" style="background:${T.sleep}"></i>Sleep</span><span><i class="sw" style="background:${T.feed}"></i>Feed</span><span><i class="sw hatch"></i>Fussy spell</span>`;
  const el = $("#rhythm-chart");
  el.innerHTML = "";
  const W = Math.max(300, el.clientWidth || 600);
  const left = W < 480 ? 54 : 66, right = 6, top = 22, rowH = W < 480 ? 11 : 13, gap = 2;
  const H = top + TOTAL_DAYS * rowH + 4;
  const x = (m) => left + (m / 1440) * (W - left - right);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Sleep, feeds and fussy spells for each of the 49 days, midnight to midnight" });
  const hatch = hatchDefs(svg, "hatch-rhythm", T.fussy);
  // The notebook's margin rule, with day numbers written to its left.
  for (const mx of [left - 10, left - 7]) svg.append(svgEl("line", { x1: mx, x2: mx, y1: 0, y2: H, stroke: T.margin, "stroke-width": 1 }));
  for (let h = 0; h <= 24; h += 6) {
    svg.append(svgEl("line", { x1: x(h * 60), x2: x(h * 60), y1: top - 4, y2: H - 2, stroke: T.grid, "stroke-width": 1 }));
    const lab = { 0: "12am", 6: "6am", 12: "12pm", 18: "6pm", 24: "12am" }[h];
    svg.append(svgEl("text", { x: x(h * 60), y: 12, "text-anchor": h === 0 ? "start" : h === 24 ? "end" : "middle" }, lab));
  }
  for (let day = 1; day <= TOTAL_DAYS; day++) {
    const y = top + (day - 1) * rowH;
    if (day === 1 || day % 7 === 0) svg.append(svgEl("text", { x: 0, y: y + rowH - 2 }, `Day ${day}`));
    svg.append(svgEl("rect", { x: left, y: y + gap / 2, width: W - left - right, height: rowH - gap, rx: 2, fill: T.grid }));
    for (const [type, color, name] of [["sleep", T.sleep, "Sleep"], ["fussy", hatch, "Fussy"], ["feed", T.feed, "Feed"]]) {
      for (const s of segmentsForDay(day, type)) {
        svg.append(svgEl("rect", {
          x: x(s.a), y: y + gap / 2, width: Math.max(1.5, x(s.b) - x(s.a) - (type === "sleep" ? 1 : 0)), height: rowH - gap, rx: 2, fill: color,
          "data-tip": `Day ${day} · ${name} ${fmtClock(s.e.start)}${s.e.day !== day ? ` (from Day ${s.e.day})` : ""} for ${fmtHM(s.e.duration)}`,
        }));
      }
    }
    if (day % 7 === 0 && day < TOTAL_DAYS) svg.append(svgEl("line", { x1: left, x2: W - right, y1: y + rowH, y2: y + rowH, stroke: T.axis, "stroke-width": 1 }));
  }
  el.append(svg);
  attachSvgTips(el);

  const wkNight = (w) => mean(daysOf(range(w * 7 - 6, w * 7)).map((d) => d.longestNightSleepMin));
  const starts = D.days.map((d) => d.fussyStart).filter((v) => v != null).sort((a, b) => a - b);
  const median = starts.length ? starts[Math.floor(starts.length / 2)] : null;
  const q1 = starts[Math.floor(starts.length * 0.25)], q3 = starts[Math.floor(starts.length * 0.75)];
  const round15 = (m) => Math.round(m / 15) * 15;
  $("#rhythm-insights").innerHTML = `
    <div class="ins"><div class="k">Longest night-time sleep, average</div><b>${fmtHM(round15(wkNight(1)))} → ${fmtHM(round15(wkNight(7)))}</b><span>Week 1 vs week 7 (sleeps starting 7pm–5am)</span></div>
    <div class="ins"><div class="k">Evening fussy spell usually starts</div><b>around ${fmtClock(round15(median))}</b><span>Most days between ${fmtClock(round15(q1))} and ${fmtClock(round15(q3))}</span></div>`;
}

// ---------------------------------------------------------------- controls
// Period picker: buttons instead of a long dropdown. Day view shows one week
// at a time (‹ Week 7 › then its seven days); week and month views show every option.
const pickBtn = (value, label, extra = "") =>
  `<button type="button" class="pick" data-period="${value}" aria-pressed="${value === state.period}" ${extra}>${label}</button>`;

function fillPeriods() {
  const opts = VIEWS[state.view].options();
  if (!opts.some((o) => o.value === state.period)) state.period = opts[0].value;
  const pick = $("#period-wrap");
  if (state.view === "daily") {
    const wk = Math.ceil(state.period / 7);
    const days = range(wk * 7 - 6, Math.min(wk * 7, TOTAL_DAYS));
    pick.innerHTML = `
      <div class="wk-nav">
        <button type="button" class="step" data-week="${wk - 1}" aria-label="Previous week" ${wk === 1 ? "disabled" : ""}>‹</button>
        <span class="wk-name">Week ${wk}</span>
        <button type="button" class="step" data-week="${wk + 1}" aria-label="Next week" ${wk * 7 >= TOTAL_DAYS ? "disabled" : ""}>›</button>
      </div>
      <div class="picks days" role="group" aria-label="Days in week ${wk}">${days.map((d) =>
        pickBtn(d, `<span class="d-pre">Day </span>${d}`, D.days[d - 1]?.logged ? "" : "disabled")).join("")}</div>`;
  } else if (state.view === "weekly") {
    pick.innerHTML = `<div class="picks" role="group" aria-label="Week">${opts.map((o) => pickBtn(o.value, `Week ${o.value}`)).join("")}</div>`;
  } else if (state.view === "monthly") {
    pick.innerHTML = `<div class="picks" role="group" aria-label="Month">${opts.map((o) => pickBtn(o.value, o.value === 1 ? "Weeks 1–4" : "Weeks 5–7")).join("")}</div>`;
  }
  document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
  pick.hidden = state.view === "overview";
  $("#metric-wrap").hidden = state.view !== "overview";
}

function renderView() {
  fillPeriods();
  renderSummary();
  const body = $("#view-body");
  destroyCharts(body);
  if (state.view === "daily") renderDaily(body, state.period);
  else if (state.view === "weekly") renderWeekly(body, state.period);
  else if (state.view === "monthly") renderMonthly(body, state.period);
  else renderOverview(body);
}

export function renderAll() {
  applyDefaults();
  renderView();
  renderGrowth();
  renderRhythm();
}

export function initDashboard(data) {
  D = data;
  // Open on the most recent day with data.
  state.period = [...D.days].reverse().find((d) => d.logged)?.day || 1;
  document.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", () => {
      const prevView = state.view;
      state.view = b.dataset.view;
      // carry the period across sensibly
      const anchor = prevView === "daily" ? state.period : prevView === "weekly" ? state.period * 7 : prevView === "monthly" ? (state.period === 1 ? 28 : 49) : 49;
      state.period = state.view === "daily" ? anchor : state.view === "weekly" ? Math.ceil(anchor / 7) : state.view === "monthly" ? (anchor <= 28 ? 1 : 2) : 1;
      renderView();
    })
  );
  $("#period-wrap").addEventListener("click", (e) => {
    const b = e.target.closest("button:not(:disabled)");
    if (!b) return;
    if (b.dataset.period) state.period = +b.dataset.period;
    // Moving a week keeps the same day of the week (Day 3 → Day 10).
    else if (b.dataset.week) state.period = Math.min(TOTAL_DAYS, (+b.dataset.week - 1) * 7 + ((state.period - 1) % 7) + 1);
    else return;
    renderView();
    // The buttons are redrawn, so keep keyboard focus on the same control.
    const sel = b.dataset.period ? `[data-period="${state.period}"]` : `[aria-label="${b.getAttribute("aria-label")}"]`;
    $(`#period-wrap ${sel}:not(:disabled)`)?.focus();
  });
  $("#trend-toggles").innerHTML = TRENDS.map((t) =>
    `<label><input type="checkbox" value="${t.key}" ${trendOn.has(t.key) ? "checked" : ""}><i class="sw" style="background:var(--${t.color})"></i>${t.label}</label>`).join("");
  $("#trend-toggles").addEventListener("change", (e) => {
    if (e.target.checked) trendOn.add(e.target.value); else trendOn.delete(e.target.value);
    if (state.view === "overview") renderView();
  });
  renderAll();
  let w = window.innerWidth;
  window.addEventListener("resize", () => {
    if (Math.abs(window.innerWidth - w) < 40) return;
    w = window.innerWidth;
    clearTimeout(initDashboard.t);
    initDashboard.t = setTimeout(() => {
      renderRhythm();
      const tl = $("#timeline");
      if (tl && state.view === "daily") renderTimeline(tl, state.period);
    }, 150);
  });
}
