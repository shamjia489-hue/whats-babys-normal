// Loads the event log (one row per event) and derives daily summaries.
import { DATA_URL, TOTAL_DAYS } from "./config.js";
import { BIRTH_LMS, WHO_GIRLS_WEIGHT_DAILY } from "./growth-reference.js";

// ---------- CSV ----------
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? +m[1] * 60 + +m[2] : null;
};

function normaliseEvent(r) {
  const day = parseInt(r.day, 10);
  const start = toMin(r.time);
  return {
    day,
    time: r.time,
    start, // minutes after midnight
    abs: start == null ? null : (day - 1) * 1440 + start, // minutes since start of Day 1
    type: (r.type || "").toLowerCase(),
    duration: r.duration_min ? +r.duration_min : null,
    amount: r.amount ? +r.amount : null,
    unit: r.unit || "",
    colour: r.colour || "",
    text: r.text || "",
    flag: r.flag || "",
  };
}

// ---------- Daily summaries ----------
// Durations that cross midnight are split across the days they cover.
function minutesWithinDay(events, type, day) {
  const d0 = (day - 1) * 1440, d1 = d0 + 1440;
  let total = 0;
  for (const e of events) {
    if (e.type !== type || e.abs == null || !e.duration) continue;
    const a = Math.max(e.abs, d0), b = Math.min(e.abs + e.duration, d1);
    if (b > a) total += b - a;
  }
  return total;
}

function isNightStart(min) {
  return min >= 19 * 60 || min < 5 * 60;
}

export function summariseDays(events) {
  const days = [];
  for (let day = 1; day <= TOTAL_DAYS; day++) {
    const ev = events.filter((e) => e.day === day);
    const feeds = ev.filter((e) => e.type === "feed");
    const sleeps = ev.filter((e) => e.type === "sleep" && e.duration);
    const fussy = ev.filter((e) => e.type === "fussy" && e.duration);
    const temps = ev.filter((e) => e.type === "temperature" && e.amount != null);
    const weight = ev.find((e) => e.type === "weight" && e.amount != null);
    const notes = ev.filter((e) => e.type === "note");
    const temperament = notes.find((n) => /^temperament:/i.test(n.text));
    const feedDurations = feeds.map((f) => f.duration).filter((d) => d != null);
    const nightSleeps = sleeps.filter((s) => isNightStart(s.start));
    const eveningFussy = fussy.filter((f) => f.start >= 15 * 60).sort((a, b) => b.duration - a.duration)[0];

    days.push({
      day,
      week: Math.ceil(day / 7),
      logged: ev.length > 0,
      feeds: feeds.length,
      avgFeedMin: feedDurations.length ? feedDurations.reduce((a, b) => a + b, 0) / feedDurations.length : null,
      sleepMin: minutesWithinDay(events, "sleep", day),
      longestSleepMin: sleeps.length ? Math.max(...sleeps.map((s) => s.duration)) : null,
      longestNightSleepMin: nightSleeps.length ? Math.max(...nightSleeps.map((s) => s.duration)) : null,
      wet: ev.filter((e) => e.type === "wet").length,
      dirty: ev.filter((e) => e.type === "dirty").length,
      fussyMin: minutesWithinDay(events, "fussy", day),
      fussyStart: eveningFussy ? eveningFussy.start : null,
      temps: temps.map((t) => ({ time: t.time, value: t.amount, text: t.text })),
      bath: ev.some((e) => e.type === "bath"),
      weightKg: weight ? weight.amount : null,
      temperament: temperament ? temperament.text.replace(/^temperament:\s*/i, "") : "",
      notes: notes.filter((n) => n !== temperament).map((n) => ({ text: n.text, flag: n.flag })),
      unclearCount: ev.filter((e) => e.flag).length,
      events: ev,
    });
  }
  return days;
}

// ---------- Growth (UK-WHO, girls) ----------
// Z-score <-> measurement with the LMS method.
const lmsValue = ({ L, M, S }, z) => (L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L));
const lmsZ = ({ L, M, S }, x) => (L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S));

// UK-WHO centile lines are spaced two-thirds of a standard deviation apart.
export const CENTILES = [
  { label: "98th", z: 2 },
  { label: "91st", z: 4 / 3 },
  { label: "50th", z: 0 },
  { label: "9th", z: -4 / 3 },
  { label: "2nd", z: -2 },
];

// Day N of life = age N-1 days.
export function centileLines(maxDay = 57) {
  return CENTILES.map((c) => ({
    ...c,
    birth: lmsValue(BIRTH_LMS, c.z),
    points: WHO_GIRLS_WEIGHT_DAILY.filter((r) => r.ageDays + 1 <= maxDay).map((r) => ({ x: r.ageDays + 1, y: lmsValue(r, c.z) })),
  }));
}

function lmsForDay(day) {
  const age = day - 1;
  if (age === 0) return BIRTH_LMS;
  return WHO_GIRLS_WEIGHT_DAILY.find((r) => r.ageDays === age) || null; // none between birth and 2 weeks
}

// Standard normal CDF (for turning a z-score into a centile).
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export function centilePosition(day, kg) {
  const lms = lmsForDay(day);
  if (!lms) return null;
  const z = lmsZ(lms, kg);
  const pct = normCdf(z) * 100;
  // describe relative to the nearest chart lines
  const lines = [...CENTILES].sort((a, b) => a.z - b.z);
  let text;
  const near = lines.find((l) => Math.abs(l.z - z) < 0.15);
  if (near) text = `on the ${near.label} centile line`;
  else if (z < lines[0].z) text = "below the 2nd centile";
  else if (z > lines[lines.length - 1].z) text = "above the 98th centile";
  else {
    const below = lines.filter((l) => l.z < z).pop();
    const above = lines.find((l) => l.z > z);
    text = `between the ${below.label} and ${above.label} centiles`;
  }
  return { z, pct, text };
}

export function growthSummary(events) {
  const weighIns = events
    .filter((e) => e.type === "weight" && e.amount != null)
    .map((e) => ({ day: e.day, kg: e.amount }))
    .sort((a, b) => a.day - b.day);
  if (!weighIns.length) return null;
  const birth = weighIns[0];
  const lowest = weighIns.reduce((m, w) => (w.kg < m.kg ? w : m), birth);
  const regained = weighIns.find((w) => w.day > lowest.day && w.kg >= birth.kg);
  const latest = weighIns[weighIns.length - 1];
  return {
    weighIns,
    birth,
    lowest,
    lostPct: ((birth.kg - lowest.kg) / birth.kg) * 100,
    regainedDay: regained ? regained.day : null,
    latest,
    latestCentile: centilePosition(latest.day, latest.kg),
    birthCentile: centilePosition(birth.day, birth.kg),
  };
}

// ---------- Loading ----------
export async function loadData() {
  const res = await fetch(DATA_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load ${DATA_URL} (${res.status})`);
  const rows = parseCSV(await res.text());
  const events = rows.map(normaliseEvent).filter((e) => e.day >= 1 && e.day <= TOTAL_DAYS && e.type);
  events.sort((a, b) => (a.abs ?? a.day * 1440) - (b.abs ?? b.day * 1440));
  const days = summariseDays(events);
  return { events, days, growth: growthSummary(events) };
}

// ---------- Helpers shared by the views ----------
export const mean = (arr) => {
  const v = arr.filter((x) => x != null && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function fmtHM(min) {
  if (min == null) return "–";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtClock(min) {
  if (min == null) return "–";
  const h = Math.floor(min / 60) % 24, m = Math.round(min % 60);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}
