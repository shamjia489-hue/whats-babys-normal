// The fixed source library. The "Ask the guidance" box may ONLY answer from these.
// Shared by the website and the server-side function (netlify/functions/ask.mjs).

export const SOURCES = [
  {
    id: "nhs-nappies",
    publisher: "NHS Healthier Together",
    title: "How to change your baby's nappy",
    url: "https://www.healthiertogether.nhs.uk/new-parent-and-baby/how-to-change-your-babys-nappy",
    points: [
      "Days 1–2: 1–2 or more wet nappies and at least 1 dark, sticky meconium poo a day.",
      "Days 3–4: 3 or more wet nappies and at least 2 dirty nappies a day.",
      "Days 5–6: 5 or more heavy wet nappies and at least 2 yellow dirty nappies a day.",
      "Days 7–28: 6 or more heavy wet nappies and at least 2 yellow, 'seedy' dirty nappies a day, each about the size of a £2 coin or larger.",
      "Pale poo: speak to a health visitor or GP.",
    ],
    keywords: ["nappy", "nappies", "wet", "dirty", "poo", "pee", "wee", "meconium", "stool", "pale", "yellow", "seedy", "colour"],
  },
  {
    id: "nhs-fever",
    publisher: "NHS Healthier Together",
    title: "Fever in babies",
    url: "https://www.healthiertogether.nhs.uk/new-parent-and-baby/fever",
    points: [
      "If a baby under 3 months has a temperature above 38°C, see a healthcare professional straight away.",
      "Measure a baby's temperature under the armpit.",
    ],
    keywords: ["temperature", "fever", "hot", "warm", "38", "thermometer", "armpit", "high temperature"],
  },
  {
    id: "nhs-sleep",
    publisher: "NHS Best Start in Life",
    title: "Your baby's sleep patterns",
    url: "https://www.nhs.uk/best-start-in-life/baby/baby-basics/newborn-and-baby-sleeping-advice-for-parents/your-babys-sleep-patterns/",
    points: [
      "Newborns sleep very different amounts: from around 8 hours to around 18 hours a day can both be normal.",
    ],
    keywords: ["sleep", "sleeping", "nap", "naps", "night", "awake", "hours", "tired", "sleepy"],
  },
  {
    id: "nhs-colic",
    publisher: "NHS",
    title: "Colic",
    url: "https://www.nhs.uk/conditions/colic/",
    points: [
      "Colic is when a baby cries for more than 3 hours a day, 3 days a week, for at least a week.",
      "It usually starts when a baby is a few weeks old and normally stops by 3 to 4 months.",
      "Call 999 if your baby has a weak, high-pitched or unusual cry.",
    ],
    keywords: ["cry", "crying", "colic", "fussy", "fussing", "unsettled", "scream", "inconsolable", "evening", "witching"],
  },
  {
    id: "nhs-reflux",
    publisher: "NHS",
    title: "Reflux in babies",
    url: "https://www.nhs.uk/conditions/reflux-in-babies/",
    points: [
      "Reflux (bringing up milk) is very common. It usually starts before 8 weeks and gets better by the time a baby is 1.",
      "Get urgent help for green, yellow or bloody vomit, projectile vomiting, blood in poo, or if a baby refuses feeds.",
    ],
    keywords: ["spit", "spitting", "spit up", "spitting up", "being sick", "sick", "vomit", "vomiting", "reflux", "posset", "bringing up", "projectile", "throw up", "possetting"],
  },
  {
    id: "mayo-feeds",
    publisher: "Mayo Clinic",
    title: "Waking a baby for feedings",
    url: "https://www.mayoclinic.org/healthy-lifestyle/adult-health/expert-answers/sleep/faq-20057752",
    points: [
      "Newborns usually feed 8–12 times a day, roughly every 2–3 hours.",
      "Most babies regain their birth weight within 1–2 weeks.",
    ],
    keywords: ["feed", "feeds", "feeding", "how often", "wake", "waking", "hungry", "breastfeed", "bottle", "milk", "birth weight", "weight"],
  },
  {
    id: "rbh-weight",
    publisher: "Royal Berkshire NHS Foundation Trust",
    title: "Weight loss in newborn babies",
    url: "https://royalberkshire.nhs.uk/media/gdbjjzwp/weight-loss-in-newborn-babies.pdf",
    points: [
      "Weight loss usually stops by day 3–4.",
      "Most babies are back to their birth weight by 3 weeks.",
      "Losing more than 10% of birth weight means a feeding assessment; more than 12.5% means a review by a paediatrician.",
    ],
    keywords: ["weight", "weigh", "lost", "loss", "birth weight", "gain", "regain", "back to birth weight", "percent", "%", "kg", "grams"],
  },
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

// Simple keyword scoring - used for the fallback when the AI isn't available,
// and to show matching sources.
export function matchSources(question, limit = 3) {
  // Whole words or phrases only (so "nap" doesn't match "nappies"), allowing a plural "s".
  const q = ` ${question.toLowerCase().replace(/[^\w£%\s]/g, " ").replace(/\s+/g, " ")} `;
  const has = (k) => q.includes(` ${k} `) || q.includes(` ${k}s `);
  return SOURCES.map((s) => ({
    source: s,
    score: s.keywords.reduce((n, k) => n + (has(k) ? (k.includes(" ") ? 2 : 1) : 0), 0),
  }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.source);
}
