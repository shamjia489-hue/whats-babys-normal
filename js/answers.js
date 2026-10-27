// Tab 2: Find an answer - guidance box (server-side Claude call, with an offline fallback),
// Reddit search, and links to professionals.
import { SOURCES, SOURCE_BY_ID, matchSources } from "./sources.js";

const API_URL = "/api/ask";
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SUGGESTED = [
  "How many wet nappies should she have at 3 weeks?",
  "Is spitting up after feeds normal?",
  "How much crying is too much?",
  "When should she be back to birth weight?",
  "How often should a newborn feed?",
  "What temperature is too high for a newborn?",
];

const REDDIT_EXAMPLES = [
  "evening fussiness 5 weeks",
  "cluster feeding every hour",
  "contact naps only",
  "grunting while asleep newborn",
  "first bath at home tips",
];

const NOT_COVERED = "The source library doesn't cover this question, so I can't answer it here. Your health visitor or GP can help, or contact NHS 111 if you need advice now.";

function sourcesHTML(sources, heading = "Sources") {
  if (!sources.length) return "";
  return `<div class="lbl" style="margin:4px 0 0">${heading}</div><ul class="srcs">${sources.map((s) => `
    <li class="src"><span class="org">${esc(s.publisher)}</span>
      <a href="${s.url}" target="_blank" rel="noopener">${esc(s.title)} ↗</a>
      <ul>${s.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    </li>`).join("")}</ul>`;
}

function renderAIAnswer(question, data) {
  const out = $("#guidance-answer");
  if (!data.covered || !data.claims?.length) {
    const near = matchSources(question);
    out.innerHTML = `<p class="q">${esc(question)}</p><p class="notice">${esc(data.closing || NOT_COVERED)}</p>${sourcesHTML(near, "Related sources you may still find useful")}`;
    return;
  }
  const used = [];
  const num = (id) => {
    if (!used.includes(id)) used.push(id);
    return used.indexOf(id) + 1;
  };
  const claims = data.claims.map((c) => {
    const ids = (c.source_ids || []).filter((id) => SOURCE_BY_ID[id]);
    const cites = ids.map((id) => `<a class="cite" href="${SOURCE_BY_ID[id].url}" target="_blank" rel="noopener" title="${esc(SOURCE_BY_ID[id].publisher)}: ${esc(SOURCE_BY_ID[id].title)}">[${num(id)}] ${esc(SOURCE_BY_ID[id].publisher)}</a>`).join(" ");
    return `<li>${esc(c.text)} ${cites}</li>`;
  }).join("");
  out.innerHTML = `
    <p class="q">${esc(question)}</p>
    <ul class="claims">${claims}</ul>
    ${data.closing ? `<p class="closing">${esc(data.closing)}</p>` : ""}
    ${sourcesHTML(used.map((id) => SOURCE_BY_ID[id]))}`;
}

function renderFallback(question) {
  const out = $("#guidance-answer");
  const matches = matchSources(question);
  if (!matches.length) {
    out.innerHTML = `<p class="q">${esc(question)}</p><p class="notice">${NOT_COVERED}</p>`;
    return;
  }
  out.innerHTML = `
    <p class="q">${esc(question)}</p>
    <p class="notice">The guidance assistant isn't available right now, so here are the sources from the library that best match your question.</p>
    ${sourcesHTML(matches, "Matching sources")}`;
}

async function ask(question) {
  const out = $("#guidance-answer");
  const btn = $("#guidance-form button");
  out.innerHTML = `<p class="q">${esc(question)}</p><p class="loading">Checking the source library…</p>`;
  btn.disabled = true;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    if (!data || typeof data.covered !== "boolean") throw new Error("bad response");
    renderAIAnswer(question, data);
  } catch (err) {
    console.info("Guidance API unavailable, showing source summaries instead:", err.message);
    renderFallback(question);
  } finally {
    btn.disabled = false;
  }
}

export function initAnswers() {
  const q = $("#guidance-q");
  $("#guidance-suggestions").innerHTML = SUGGESTED.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join("");
  $("#guidance-suggestions").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    q.value = chip.textContent;
    ask(q.value);
  });
  $("#guidance-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = q.value.trim();
    if (text) ask(text.slice(0, 500));
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#guidance-form").requestSubmit(); }
  });
  $("#library-list").innerHTML = SOURCES.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.publisher)}: ${esc(s.title)}</a></li>`).join("");

  // Reddit
  const rq = $("#reddit-q");
  $("#reddit-examples").innerHTML = REDDIT_EXAMPLES.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join("");
  $("#reddit-examples").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) { rq.value = chip.textContent; rq.focus(); }
  });
  $("#reddit-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const term = rq.value.trim();
    if (!term) return;
    const sub = $("#reddit-sub").value;
    const qs = encodeURIComponent(term);
    const url = sub
      ? `https://www.reddit.com/r/${sub}/search/?q=${qs}&restrict_sr=1`
      : `https://www.reddit.com/search/?q=${qs}`;
    window.open(url, "_blank", "noopener");
  });
}
