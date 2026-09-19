/**
 * app.js — bootstraps the page: wires the Slides and Notebook modules
 * together, the lesson JSON import/export, and the toolbar menus.
 */
(function () {
  "use strict";

  Slides.init();
  Slides.load(window.DEFAULT_LESSON || { title: "Aula", slides: [] });
  Notebook.init();

  // ---------------- generic dropdown-menu wiring ----------------
  function wireMenu(btnId, menuId) {
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains("show");
      document.querySelectorAll(".tb-menu.show").forEach((m) => m.classList.remove("show"));
      if (!isOpen) menu.classList.add("show");
    });
    menu.addEventListener("click", (e) => { if (e.target.closest("button")) menu.classList.remove("show"); });
  }
  wireMenu("lessonExportMenuBtn", "lessonExportMenu");
  wireMenu("nbExportMenuBtn", "nbExportMenu");
  document.addEventListener("click", () => document.querySelectorAll(".tb-menu.show").forEach((m) => m.classList.remove("show")));

  // ---------------- lesson: load / export JSON ----------------
  const lessonFileInput = document.getElementById("lessonFileInput");
  document.getElementById("loadLessonBtn").addEventListener("click", () => lessonFileInput.click());
  lessonFileInput.addEventListener("change", () => {
    const file = lessonFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.slides)) throw new Error("formato inválido");
        Slides.load(parsed);
      } catch (err) {
        alert('Não foi possível abrir essa aula: o arquivo .json precisa ter um campo "slides" (lista de páginas).');
      }
      lessonFileInput.value = "";
    };
    reader.readAsText(file);
  });
  document.getElementById("saveLessonJsonBtn").addEventListener("click", async () => {
    const lesson = Slides.getLesson();
    const blob = new Blob([JSON.stringify(lesson, null, 2)], { type: "application/json" });
    await Exporter.saveBlob(blob, Exporter.slugify(lesson.title) + ".json");
  });

  // ---------------- lesson: PDF / PPTX exports ----------------
  document.getElementById("exportSlidesPdfBtn").addEventListener("click", () => Exporter.exportSlidesPdf());
  document.getElementById("exportSlidesPptxBtn").addEventListener("click", () => Exporter.exportSlidesPptx());

  // ---------------- notebook: JSON import / export ----------------
  const notebookFileInput = document.getElementById("notebookFileInput");
  document.getElementById("nbOpenJsonBtn").addEventListener("click", () => notebookFileInput.click());
  notebookFileInput.addEventListener("change", () => {
    const file = notebookFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.pages)) throw new Error("formato inválido");
        Notebook.replaceAll(parsed.pages);
      } catch (err) {
        alert('Não foi possível abrir esse caderno: o arquivo .json precisa ter um campo "pages" (lista de páginas).');
      }
      notebookFileInput.value = "";
    };
    reader.readAsText(file);
  });
  document.getElementById("nbSaveJsonBtn").addEventListener("click", async () => {
    const data = Notebook.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    await Exporter.saveBlob(blob, "caderno.json");
  });

  // ---------------- notebook: PDF / PNG exports ----------------
  document.getElementById("nbExportPdfBtn").addEventListener("click", () => Exporter.exportNotebookPdf());
  document.getElementById("nbExportPngBtn").addEventListener("click", async () => {
    const ink = Notebook.getInk();
    const { w, h } = Notebook.getPageSize();
    const pages = Notebook.getPages();
    const page = pages[Notebook.getCurrentIndex()];
    const scale = 2;
    const off = document.createElement("canvas");
    off.width = w * scale; off.height = h * scale;
    const octx = off.getContext("2d");
    octx.scale(scale, scale);
    Notebook.drawPaper(octx, w, h, page);
    if (page.type === "exercise") {
      octx.save();
      octx.fillStyle = "rgba(255,255,255,0.55)";
      const headerH = h * 0.22;
      octx.fillRect(0, 0, w, headerH);
      octx.fillStyle = "#8A5A1E";
      octx.font = "600 " + Math.round(w * 0.02) + "px Arial";
      octx.fillText(page.badge || "", w * 0.025, h * 0.04);
      octx.fillStyle = "#2B2620";
      octx.font = Math.round(w * 0.019) + "px Arial";
      wrapText(octx, stripHtml(page.question || ""), w * 0.025, h * 0.07, w * 0.95, w * 0.024);
      octx.restore();
    }
    ink.getStrokes().forEach((s) => InkSurface.paintStroke(octx, s, w, h, 700));
    off.toBlob(async (blob) => { if (blob) await Exporter.saveBlob(blob, "pagina-" + (Notebook.getCurrentIndex() + 1) + ".png"); }, "image/png");
  });

  function stripHtml(html) { const tmp = document.createElement("div"); tmp.innerHTML = html; return tmp.textContent || ""; }
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" "); let line = "";
    for (let i = 0; i < words.length; i++) {
      const test = line + words[i] + " ";
      if (ctx.measureText(test).width > maxWidth && line) { ctx.fillText(line, x, y); line = words[i] + " "; y += lineHeight; }
      else { line = test; }
    }
    ctx.fillText(line, x, y);
  }
})();
