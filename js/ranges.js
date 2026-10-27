// Reference ranges for the dashboard. "Normal is a range, not a number."
// Each returns {min, max} for a given day of life (Day 1 = birth day),
// or null when there is no set range.

export const RANGES = {
  feeds: {
    color: "feed",
    label: "Feeds",
    source: "mayo-feeds",
    note: "8–12 a day",
    for: () => ({ min: 8, max: 12 }),
  },
  sleepMin: {
    color: "sleep",
    label: "Total sleep",
    source: "nhs-sleep",
    note: "8–18 hours a day",
    for: () => ({ min: 8 * 60, max: 18 * 60 }),
  },
  wet: {
    color: "wet",
    label: "Wet nappies",
    source: "nhs-nappies",
    note: "1+ days 1–2, 3+ days 3–4, 5+ days 5–6, 6+ from day 7",
    for: (day) => ({ min: day <= 2 ? 1 : day <= 4 ? 3 : day <= 6 ? 5 : 6, max: null }),
  },
  dirty: {
    color: "dirty",
    label: "Dirty nappies",
    source: "nhs-nappies",
    note: "1+ days 1–2, 2+ days 3–28, no set minimum after 4 weeks",
    for: (day) => (day <= 2 ? { min: 1, max: null } : day <= 28 ? { min: 2, max: null } : null),
  },
  fussyMin: {
    color: "fussy",
    label: "Fussy time",
    source: "nhs-colic",
    note: "Flag over 3 hours a day",
    for: () => ({ min: null, max: 180 }),
  },
};

// true / false / null (no range that day)
export function inRange(measure, day, value) {
  const r = RANGES[measure]?.for(day);
  if (!r || value == null) return null;
  if (r.min != null && value < r.min) return false;
  if (r.max != null && value > r.max) return false;
  return true;
}
