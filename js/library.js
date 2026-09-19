/**
 * library.js — lesson library: lists the lessons published under
 * data/lessons/<slug>/ (lesson.json + notebook.json), generated either
 * by hand or by the autonomous agent (see agent/generate-lesson.mjs),
 * and lets the user switch between them from the topbar.
 *
 * Falls back silently to whatever Slides/Notebook already loaded
 * (the inline DEFAULT_LESSON/DEFAULT_NOTEBOOK) when manifest.json
 * can't be fetched — e.g. the page opened directly as a file:// URL
 * instead of served over http.
 */
const Library = (function () {
  let manifest = { lessons: [] };
  let currentSlug = null;

  const menu = document.getElementById("lessonPickerMenu");
  const btn = document.getElementById("lessonPickerBtn");

  async function init() {
    try {
      const res = await fetch("data/manifest.json", { cache: "no-store" });
      if (!res.ok) throw new Error("manifest indisponível");
      manifest = await res.json();
    } catch (err) {
      // No server / no manifest reachable: keep the single inline lesson,
      // hide the picker so there's nothing dead to click.
      if (btn) btn.style.display = "none";
      return;
    }
    if (!manifest.lessons || !manifest.lessons.length) {
      if (btn) btn.style.display = "none";
      return;
    }
    // The page already boots with the inline DEFAULT_LESSON (seed data for
    // "trabalho-energia"); if it's in the manifest, mark it current instead
    // of re-fetching it over the network.
    const seed = manifest.lessons.find((l) => l.slug === "trabalho-energia");
    currentSlug = seed ? seed.slug : manifest.lessons[0].slug;
    renderMenu();
  }

  function lengthLabel(len) {
    if (len === "short") return "curta";
    if (len === "medium") return "média";
    if (len === "long") return "longa";
    return "";
  }

  function renderMenu() {
    if (!menu) return;
    menu.innerHTML = '<div class="tb-menu-label">Escolher aula</div>';
    manifest.lessons.forEach((entry) => {
      const item = document.createElement("button");
      item.className = "lesson-item";
      item.dataset.slug = entry.slug;
      const lbl = lengthLabel(entry.length);
      item.innerHTML =
        '<span class="li-title"></span>' +
        (lbl ? '<span class="li-tag">' + lbl + "</span>" : "");
      item.querySelector(".li-title").textContent = entry.title || entry.slug;
      item.classList.toggle("active", entry.slug === currentSlug);
      item.addEventListener("click", () => {
        menu.classList.remove("show");
        loadLesson(entry.slug);
      });
      menu.appendChild(item);
    });
  }

  async function loadLesson(slug) {
    const entry = manifest.lessons.find((l) => l.slug === slug);
    if (!entry) return;
    try {
      const base = "data/lessons/" + slug + "/";
      const [lesson, notebook] = await Promise.all([
        fetch(base + "lesson.json", { cache: "no-store" }).then((r) => r.json()),
        fetch(base + "notebook.json", { cache: "no-store" }).then((r) => r.json()),
      ]);
      currentSlug = slug;
      Slides.load(lesson);
      Notebook.replaceAll(notebook.pages || []);
      renderMenu();
    } catch (err) {
      alert("Não foi possível carregar essa aula (" + slug + ").");
    }
  }

  function setCurrent(slug) { currentSlug = slug; renderMenu(); }
  function getManifest() { return manifest; }

  return { init, loadLesson, setCurrent, getManifest };
})();
