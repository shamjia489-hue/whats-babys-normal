// Tab 3: How this was built - stats, notebook-to-data, raw table, data dictionary.
import { fmtHM } from "./data.js";
import { NOTEBOOK_DAY, NOTEBOOK_IMAGE } from "./config.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function eventDetails(e) {
  const bits = [];
  if (e.duration) bits.push(`${e.duration} min`);
  if (e.amount != null) bits.push(`${e.amount}${e.unit ? ` ${e.unit}` : ""}`);
  if (e.colour) bits.push(e.colour);
  if (e.text) bits.push(e.text);
  return bits.join(" · ");
}

const COLUMNS = [
  { key: "day", label: "Day", num: true },
  { key: "week", label: "Week", num: true },
  { key: "feeds", label: "Feeds", num: true },
  { key: "avgFeedMin", label: "Avg feed", num: true, fmt: (v) => (v == null ? "–" : `${Math.round(v)} min`) },
  { key: "sleepMin", label: "Sleep", num: true, fmt: fmtHM },
  { key: "longestSleepMin", label: "Longest sleep", num: true, fmt: fmtHM },
  { key: "wet", label: "Wet", num: true },
  { key: "dirty", label: "Dirty", num: true },
  { key: "fussyMin", label: "Fussy time", num: true, fmt: fmtHM },
  { key: "temp", label: "Temp", num: true, fmt: (v) => (v == null ? "" : `${v.toFixed(1)}°C`) },
  { key: "bath", label: "Bath", fmt: (v) => (v ? "Yes" : "") },
  { key: "weightKg", label: "Weight", num: true, fmt: (v) => (v == null ? "" : `${v.toFixed(2)} kg`) },
  { key: "notesText", label: "Notes", cls: "wrap" },
];

const DICTIONARY = [
  ["day", "Days since birth. Day 1 is the day she was born.", "Worked out from the notebook date, then the date was removed."],
  ["time", "Time the event started (24-hour clock).", "As written. Many were noted afterwards, so treat them as approximate."],
  ["type", "feed, sleep, wet, dirty, fussy, bath, temperature, weight or note.", "One row per entry in the notebook."],
  ["duration_min", "How long a feed, sleep or fussy spell lasted, in minutes.", "From written start and end times, or a written length."],
  ["amount + unit", "Weight (kg), temperature (°C) or bottle volume (ml).", "Weights from midwife and health visitor weigh-ins. Temperatures taken under the arm."],
  ["colour", "Colour of a dirty nappy.", "As described in the notebook (for example 'yellow, seedy')."],
  ["text", "Feeding side, written notes, or temperament.", "Copied word for word, minus anything identifying."],
  ["flag", "'unclear' when the handwriting couldn't be read with confidence.", "Flagged rather than guessed."],
  ["Feeds (daily)", "Number of feeds that started that day, including cluster feeds.", "Count of feed rows."],
  ["Sleep (daily)", "Total minutes asleep between midnight and midnight.", "Sleeps crossing midnight are split between the two days."],
  ["Longest sleep", "Longest single sleep that started that day.", "From sleep durations."],
  ["Fussy time", "Total minutes of fussy or crying spells that day.", "From fussy rows; compared with the NHS colic definition (over 3 hours)."],
];

let sortKey = "day", sortDir = 1, weekFilter = "";

function rawRows(days) {
  return days.filter((d) => d.logged).map((d) => ({
    ...d,
    temp: d.temps.length ? Math.max(...d.temps.map((t) => t.value)) : null,
    notesText: [d.temperament && `Temperament: ${d.temperament}`, ...d.notes.map((n) => n.text + (n.flag ? " [unclear]" : ""))].filter(Boolean).join(" · "),
  }));
}

function renderRaw(rows) {
  const table = $("#raw-table");
  let data = weekFilter ? rows.filter((r) => r.week === +weekFilter) : rows.slice();
  data.sort((a, b) => {
    const x = a[sortKey], y = b[sortKey];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === "string" ? x.localeCompare(y) : x - y) * sortDir;
  });
  $("#raw-count").textContent = `${data.length} days`;
  table.innerHTML = `
    <thead><tr>${COLUMNS.map((c) => `<th scope="col" aria-sort="${c.key === sortKey ? (sortDir === 1 ? "ascending" : "descending") : "none"}"><button type="button" data-key="${c.key}">${c.label}</button></th>`).join("")}</tr></thead>
    <tbody>${data.map((r) => `<tr>${COLUMNS.map((c) => `<td class="${c.num ? "num" : ""} ${c.cls || ""}">${esc(c.fmt ? c.fmt(r[c.key]) : r[c.key] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>`;
}

export function initBuilt({ events, days }) {
  const logged = days.filter((d) => d.logged).length;
  const feeds = events.filter((e) => e.type === "feed").length;
  const nappies = events.filter((e) => e.type === "wet" || e.type === "dirty").length;
  $("#built-stats").innerHTML = [
    ["days logged by hand", logged],
    ["feeds recorded", feeds],
    ["nappies changed", nappies],
    ["data points in total", events.length],
  ].map(([k, v]) => `<div><strong>${v.toLocaleString("en-GB")}</strong><span>${k}</span></div>`).join("");

  // Notebook → data
  const img = $("#notebook-img");
  img.src = NOTEBOOK_IMAGE;
  $("#notebook-caption").textContent = `Notebook photo · Day ${NOTEBOOK_DAY}. The redacted page goes here once the photos are in.`;
  $("#notebook-title").textContent = `Day ${NOTEBOOK_DAY}, transcribed`;
  const dayEvents = events.filter((e) => e.day === NOTEBOOK_DAY);
  $("#notebook-count").textContent = `${dayEvents.length} rows`;
  $("#notebook-rows").innerHTML = `
    <thead><tr><th>Day</th><th>Time</th><th>Type</th><th>Details</th></tr></thead>
    <tbody>${dayEvents.map((e) => `<tr><td>${e.day}</td><td>${esc(e.time)}</td><td>${esc(e.type)}</td><td>${esc(eventDetails(e))}${e.flag ? ' <span class="flag-unclear">unclear</span>' : ""}</td></tr>`).join("")}</tbody>`;

  // Raw table
  const rows = rawRows(days);
  const weekSel = $("#raw-week");
  const weeks = [...new Set(rows.map((r) => r.week))];
  weekSel.innerHTML = `<option value="">All ${weeks.length} weeks</option>` + weeks.map((w) => `<option value="${w}">Week ${w}</option>`).join("");
  weekSel.addEventListener("change", () => { weekFilter = weekSel.value; renderRaw(rows); });
  $("#raw-table").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-key]");
    if (!b) return;
    if (sortKey === b.dataset.key) sortDir *= -1; else { sortKey = b.dataset.key; sortDir = 1; }
    renderRaw(rows);
    $(`#raw-table button[data-key="${sortKey}"]`)?.focus();
  });
  renderRaw(rows);

  $("#dict-table").innerHTML = `<thead><tr><th>Field</th><th>What it means</th><th>How it was recorded</th></tr></thead>
    <tbody>${DICTIONARY.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
}
