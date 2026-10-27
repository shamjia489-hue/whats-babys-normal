// Entry point: loads the data, wires up the tabs and hash routing.
import { loadData } from "./data.js";
import { IS_SAMPLE } from "./config.js";
import { initDashboard, renderAll } from "./dashboard.js";
import { initAnswers } from "./answers.js";
import { initBuilt } from "./built.js";

const TITLES = {
  data: "What's Baby's Normal",
  answers: "Find an answer · What's Baby's Normal",
  built: "How this was built · What's Baby's Normal",
  drafts: "Drafts · What's Baby's Normal",
};

let ready = false;

function route() {
  const hash = location.hash.replace("#", "");
  const tab = ["answers", "built", "drafts"].includes(hash) ? hash : "data";
  document.querySelectorAll("[data-tab-panel]").forEach((p) => (p.hidden = p.dataset.tabPanel !== tab));
  document.querySelectorAll(".tabs a").forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title = TITLES[tab];
  // Drafts are only reachable by URL - keep it out of search engines.
  document.querySelector('meta[name="robots"]')?.remove();
  if (tab === "drafts") {
    const m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex";
    document.head.append(m);
  }
  window.scrollTo(0, 0);
  // SVG charts measure their container, so redraw once the tab is visible.
  if (tab === "data" && ready) requestAnimationFrame(renderAll);
}

async function start() {
  if (!IS_SAMPLE) document.body.classList.add("is-real");
  window.addEventListener("hashchange", route);
  route();
  initAnswers();
  try {
    const data = await loadData();
    initDashboard(data);
    initBuilt(data);
    ready = true;
  } catch (err) {
    console.error(err);
    const box = document.getElementById("load-error");
    box.textContent = "Sorry, the care log couldn't be loaded. If you're running this locally, serve the folder with a local web server rather than opening the file directly.";
    box.hidden = false;
  }
  // Redraw charts if the light/dark setting changes.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => ready && renderAll());
}

start();
