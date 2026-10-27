// Generates clearly labelled SAMPLE data in the same shape as the real notebook
// transcription (one row per event). Run:  node tools/generate-sample-data.mjs
// Output: data/events.csv. Delete/replace that file when the real data is ready.
//
// Patterns built in (from the brief):
//  - weight dips ~8% by day 5, birth weight regained ~day 13
//  - feeds drop from ~11 to ~9 a day
//  - night sleep stretches lengthen
//  - fussiness peaks around weeks 5-6 then eases

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "..", "data", "events.csv");
const DAYS = 49;

// Seeded random numbers so the sample is the same every time.
let seed = 20260101;
function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

const events = [];
const add = (absMin, type, fields = {}) => {
  const day = Math.floor(absMin / 1440) + 1;
  if (day < 1 || day > DAYS) return;
  const m = Math.round(absMin % 1440);
  const time = `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  events.push({ day, time, type, duration_min: "", amount: "", unit: "", colour: "", text: "", flag: "", ...fields });
};

// ---- Fussy spell per day (evening), peaking weeks 5-6 ----
function fussyPlan(day) {
  const w = (day - 1) / 7; // weeks since birth (0-7)
  // bell-ish curve centred ~ day 35
  const peak = Math.exp(-Math.pow((day - 36) / 10, 2));
  const base = day < 4 ? 0 : lerp(15, 40, w / 3);
  let mins = base + peak * 150 + between(-20, 25);
  if (day >= 33 && day <= 40 && rand() < 0.35) mins += between(30, 60); // a few >3h days
  mins = Math.max(day < 4 ? 0 : 10, Math.round(mins / 5) * 5);
  const start = 17 * 60 + 15 + between(0, 120) + (day > 21 ? -10 : 10); // ~17:15-19:30
  return { start: Math.round(start / 5) * 5, mins };
}

// ---- Simulate the continuous feed / awake / sleep cycle ----
let t = 30; // day 1, 00:30 - first logged feed
const fussyDone = new Set();
while (t < DAYS * 1440) {
  const day = Math.floor(t / 1440) + 1;
  const prog = (day - 1) / (DAYS - 1); // 0 -> 1 across the 7 weeks
  const minuteOfDay = t % 1440;

  // Feed
  const feedLen = Math.round(lerp(32, 19, prog) + between(-7, 8));
  const feed = { duration_min: feedLen, text: pick(["L", "R", "L+R", "L+R", "R+L"]) };
  if (day > 24 && rand() < 0.08) {
    Object.assign(feed, { amount: Math.round(between(60, 100) / 5) * 5, unit: "ml", text: "expressed milk, bottle" });
  }
  if (rand() < 0.015) feed.flag = "unclear";
  add(t, "feed", feed);
  t += feedLen;

  // Nappies usually checked around feeds (counts set per day below)
  const md = t % 1440;
  const isNight = md >= 22 * 60 || md < 6 * 60;

  // Awake window (or the evening fussy spell)
  const plan = fussyPlan(day);
  let awake = Math.round(lerp(15, 35, prog) + between(-5, 12));
  if (isNight) awake = Math.round(between(5, 15));
  if (!fussyDone.has(day) && plan.mins > 0 && md >= plan.start - 40 && md < 22 * 60) {
    fussyDone.add(day);
    add(t, "fussy", { duration_min: plan.mins, text: pick(["unsettled, wanted holding", "crying on and off", "cluster feeding + crying", "windy, pulling legs up", "hard to settle"]) });
    // long evening spells usually include cluster feeds
    for (let k = 1; k * 75 < plan.mins; k++) add(t + k * 75, "feed", { duration_min: Math.round(between(10, 18)), text: "cluster feed" });
    awake = plan.mins;
  }
  t += awake;

  // Sleep stretch
  const m2 = t % 1440;
  let sleep;
  const firstNight = m2 >= 21 * 60 || m2 < 2 * 60;
  const lateNight = m2 >= 2 * 60 && m2 < 6 * 60;
  if (firstNight) sleep = lerp(120, 300, prog) + between(-25, 25);
  else if (lateNight) sleep = lerp(85, 130, prog) + between(-20, 20);
  else sleep = lerp(60, 72, prog) + between(-25, 30);
  if (day <= 2) sleep = between(60, 110);
  sleep = Math.max(20, Math.round(sleep / 5) * 5);
  add(t, "sleep", { duration_min: sleep });
  t += sleep;
}

// ---- Nappies: per-day counts placed after feeds ----
const feedTimesByDay = {};
for (const e of events) if (e.type === "feed") (feedTimesByDay[e.day] ||= []).push(e.time);
for (let day = 1; day <= DAYS; day++) {
  let wet, dirty, colour;
  if (day <= 2) { wet = pick([1, 2, 2]); dirty = pick([1, 1, 2]); colour = "black-green (meconium)"; }
  else if (day <= 4) { wet = pick([3, 3, 4]); dirty = pick([2, 2, 3]); colour = "green-brown"; }
  else if (day <= 6) { wet = day === 6 ? 4 : pick([5, 6]); dirty = pick([2, 3, 3]); colour = "yellow"; }
  else if (day <= 28) { wet = Math.round(between(6, 9.4)); dirty = Math.round(between(2, 5.4)); colour = "yellow, seedy"; }
  else { wet = Math.round(between(6, 9.4)); dirty = Math.round(between(0, 3.4)); colour = "yellow, seedy"; }
  const slots = [...(feedTimesByDay[day] || [])].sort(() => rand() - 0.5);
  const toMin = (s) => +s.slice(0, 2) * 60 + +s.slice(3);
  const at = (i) => (day - 1) * 1440 + Math.min(1439, toMin(slots[i % slots.length]) + 5 + Math.floor(rand() * 10));
  for (let i = 0; i < wet; i++) add(at(i), "wet", {});
  for (let i = 0; i < dirty; i++) add(at(i + wet), "dirty", { colour });
}

// ---- Weigh-ins (kg) ----
const weights = { 1: 3.1, 5: 2.86, 10: 2.99, 13: 3.12, 21: 3.44, 28: 3.73, 35: 4.0, 42: 4.27, 49: 4.52 };
for (const [d, kg] of Object.entries(weights)) add((d - 1) * 1440 + 11 * 60, "weight", { amount: kg, unit: "kg", text: d == 1 ? "birth weight" : "weighed by midwife / health visitor" });

// ---- Temperatures (°C, under the arm), roughly every 2-3 days ----
for (let d = 1; d <= DAYS; d += pick([2, 3])) {
  const temp = d === 18 ? 37.6 : +(between(36.5, 37.2)).toFixed(1);
  add((d - 1) * 1440 + 9 * 60 + Math.floor(between(0, 120)), "temperature", { amount: temp, unit: "°C", text: d === 18 ? "felt warm after being wrapped up - rechecked 20 min later, 37.0" : "" });
}

// ---- Baths ----
for (let d = 5; d <= DAYS; d += pick([2, 3, 3])) add((d - 1) * 1440 + 19 * 60 + Math.floor(between(0, 40)), "bath", { text: d === 5 ? "first bath at home" : "" });

// ---- Daily temperament + written notes ----
const notes = {
  1: "Born at 37 weeks. Skin to skin, first feed within the hour.",
  3: "Milk coming in. Very sleepy, had to wake her for feeds.",
  5: "Midwife visit and heel prick test. Weight down a bit - midwife happy, keep feeding often.",
  8: "Cord stump came off.",
  10: "Midwife check, weight going back up.",
  12: "Health visitor new birth visit.",
  13: "Back to birth weight!",
  16: "First proper walk in the pram.",
  20: "Grunting a lot in her sleep - [handwriting unclear].",
  24: "Tried a bottle of expressed milk - took it fine.",
  26: "Spat up a bit after most feeds today, otherwise happy.",
  31: "Evenings getting harder. Lots of crying 6-9pm.",
  34: "Rough evening. Tried the sling - helped a little.",
  37: "Possibly first smile?",
  41: "Evenings a bit calmer.",
  44: "6-8 week GP check - all fine.",
  47: "Longest night stretch so far.",
};
const tempers = (d) => {
  if (d <= 3) return pick(["sleepy", "sleepy", "settled"]);
  if (d >= 30 && d <= 40) return pick(["unsettled in evening", "grizzly", "unsettled in evening", "settled in the day"]);
  return pick(["settled", "content", "alert", "settled", "a bit windy"]);
};
for (let d = 1; d <= DAYS; d++) {
  add((d - 1) * 1440 + 21 * 60 + 30, "note", { text: `Temperament: ${tempers(d)}` });
  if (notes[d]) add((d - 1) * 1440 + 21 * 60 + 31, "note", { text: notes[d], flag: d === 20 ? "unclear" : "" });
}

// ---- Write CSV ----
events.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
const cols = ["day", "time", "type", "duration_min", "amount", "unit", "colour", "text", "flag"];
const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = [cols.join(","), ...events.map((e) => cols.map((c) => esc(e[c])).join(","))].join("\n") + "\n";
writeFileSync(OUT, csv);

// Quick sanity summary
const per = {};
for (const e of events) {
  const p = (per[Math.ceil(e.day / 7)] ||= { feed: 0, sleep: 0, fussy: 0, longest: [] });
  if (e.type === "feed") p.feed++;
  if (e.type === "sleep") p.sleep += +e.duration_min;
  if (e.type === "fussy") p.fussy += +e.duration_min;
}
for (const [w, p] of Object.entries(per)) console.log(`week ${w}: feeds/day ${(p.feed / 7).toFixed(1)}, sleep h/day ${(p.sleep / 7 / 60).toFixed(1)}, fussy min/day ${(p.fussy / 7).toFixed(0)}`);
console.log(`${events.length} events -> ${OUT}`);
