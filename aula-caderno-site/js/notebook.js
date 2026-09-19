/**
 * notebook.js — notebook side-panel engine.
 * Manages the page list and a single InkSurface whose strokes are
 * swapped in/out as the current page changes.
 */
const Notebook = (function () {
  const PAGE_W = 1275, PAGE_H = 1650;
  const STORAGE_KEY = "te_notebook_pages_v3";

  let pages = [];
  let index = 0;
  let ink = null;

  const panel = document.getElementById("nbPanel");
  const toggleBtn = document.getElementById("nbToggleBtn");
  const pageCard = document.getElementById("nbPageCard");
  const pageHeader = document.getElementById("nbPageHeader");
  const badgeEl = pageHeader.querySelector(".badge");
  const qtextEl = pageHeader.querySelector(".qtext");
  const metaEl = pageHeader.querySelector(".meta");
  const paperWrap = document.getElementById("nbPaperWrap");
  const pageListEl = document.getElementById("nbPageList");
  const undoBtn = document.getElementById("nbUndoBtn");
  const redoBtn = document.getElementById("nbRedoBtn");
  const pencilBadge = document.getElementById("nbPencilBadge");
  const fingerToggle = document.getElementById("nbFingerToggle");
  const newPagePop = document.getElementById("newPagePop");
  const addPageBtn = document.getElementById("addPageBtn");

  function init() {
    pages = loadFromStorage() || (window.DEFAULT_NOTEBOOK ? clonePages(window.DEFAULT_NOTEBOOK.pages) : [blankPage("lined")]);

    ink = new InkSurface({
      container: document.getElementById("nbCanvasWrap"),
      bgCanvas: document.getElementById("nbBg"),
      inkCanvas: document.getElementById("nbInk"),
      liveCanvas: document.getElementById("nbLive"),
      refWidth: 700,
      getPaperDrawer: (ctx, w, h) => drawPaper(ctx, w, h, pages[index]),
      onStrokeCommitted: () => { scheduleSave(); },
      onEraseCommitted: () => { scheduleSave(); updateUndoRedo(); },
      onPencilDetected: () => { pencilBadge.classList.add("show"); updatePencilLabel(); },
    });
    new ResizeObserver(() => { if (panel.classList.contains("open")) ink.resize(); }).observe(paperWrap);

    toggleBtn.addEventListener("click", () => panel.classList.contains("open") ? close() : open());
    document.getElementById("nbCloseBtn").addEventListener("click", close);
    document.getElementById("nbFullToggle").addEventListener("click", function () {
      panel.classList.toggle("fullwide");
      this.classList.toggle("active", panel.classList.contains("fullwide"));
      requestAnimationFrame(() => ink.resize());
    });

    document.getElementById("nbToolGroup").addEventListener("click", (e) => {
      const btn = e.target.closest(".nb-btn"); if (!btn) return;
      ink.setTool(btn.dataset.tool);
      document.querySelectorAll("#nbToolGroup .nb-btn").forEach((b) => b.classList.toggle("active", b === btn));
    });
    document.getElementById("nbColorGroup").addEventListener("click", (e) => {
      const sw = e.target.closest(".nb-swatch"); if (!sw) return;
      ink.setColor(sw.dataset.color);
      document.querySelectorAll("#nbColorGroup .nb-swatch").forEach((s) => s.classList.toggle("active", s === sw));
    });
    document.getElementById("nbWidthGroup").addEventListener("click", (e) => {
      const btn = e.target.closest(".nb-wbtn"); if (!btn) return;
      ink.setWidth(parseFloat(btn.dataset.w));
      document.querySelectorAll("#nbWidthGroup .nb-wbtn").forEach((b) => b.classList.toggle("active", b === btn));
    });
    document.getElementById("nbClearBtn").addEventListener("click", () => {
      if (!ink.getStrokes().length) return;
      if (!confirm("Limpar todas as anotações desta página?")) return;
      ink.clearAll(); updateUndoRedo(); scheduleSave();
    });
    undoBtn.addEventListener("click", () => { ink.undo(); updateUndoRedo(); scheduleSave(); });
    redoBtn.addEventListener("click", () => { ink.redo(); updateUndoRedo(); scheduleSave(); });

    fingerToggle.addEventListener("click", () => {
      const v = !ink.fingerOverride;
      ink.setFingerOverride(v);
      fingerToggle.classList.toggle("active", v);
      updatePencilLabel();
    });

    addPageBtn.addEventListener("click", () => {
      const rect = addPageBtn.getBoundingClientRect();
      newPagePop.style.left = Math.min(rect.left, window.innerWidth - 210) + "px";
      newPagePop.style.top = Math.max(10, rect.top - 190) + "px";
      newPagePop.classList.add("show");
    });
    newPagePop.addEventListener("click", (e) => {
      const opt = e.target.closest(".np-opt"); if (!opt) return;
      pages.push(blankPage(opt.dataset.style));
      newPagePop.classList.remove("show");
      renderSidebar(); switchTo(pages.length - 1); scheduleSave();
    });
    document.addEventListener("click", (e) => {
      if (!newPagePop.contains(e.target) && e.target !== addPageBtn && !addPageBtn.contains(e.target)) newPagePop.classList.remove("show");
    });

    renderSidebar();
    renderHeader();
    updateUndoRedo();
  }

  // ---------------- data helpers ----------------
  function blankPage(style) { return { id: "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6), type: "blank", paper: style, strokes: [] }; }
  function clonePages(arr) { return (arr || []).map((p) => Object.assign({}, p, { strokes: (p.strokes || []).slice() })); }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch (e) { return null; }
  }
  let saveTimer = null;
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 350); }
  function saveNow() {
    pages[index].strokes = ink.getStrokes();
    try {
      const slim = pages.map((p) => ({ id: p.id, type: p.type, badge: p.badge, topic: p.topic, question: p.question, answer: p.answer, paper: p.paper, strokes: p.strokes }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch (e) { /* storage full/unavailable — session state still fine */ }
  }

  // ---------------- rendering ----------------
  function drawPaper(ctx, wCss, hCss, page) {
    ctx.save();
    ctx.fillStyle = "#FBF7EF"; ctx.fillRect(0, 0, wCss, hCss);
    ctx.strokeStyle = "#D8CFC0"; ctx.fillStyle = "#C9BEA9";
    const headerOffset = page.type === "exercise" ? hCss * 0.22 : 0;
    const style = page.paper || "blank";
    if (style === "lined") {
      const step = 30; ctx.lineWidth = 1;
      for (let y = headerOffset + step; y < hCss; y += step) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(wCss, y + 0.5); ctx.stroke(); }
    } else if (style === "grid") {
      const step = 26; ctx.lineWidth = 1;
      for (let y = headerOffset + step; y < hCss; y += step) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(wCss, y + 0.5); ctx.stroke(); }
      for (let x = step; x < wCss; x += step) { ctx.beginPath(); ctx.moveTo(x + 0.5, headerOffset); ctx.lineTo(x + 0.5, hCss); ctx.stroke(); }
    } else if (style === "dotted") {
      const step = 24;
      for (let y = headerOffset + step; y < hCss; y += step) for (let x = step / 2; x < wCss; x += step) { ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  function renderSidebar() {
    pageListEl.innerHTML = "";
    pages.forEach((p, i) => {
      const item = document.createElement("div");
      item.className = "pg-item" + (i === index ? " current" : "");
      const num = document.createElement("div"); num.className = "pg-num"; num.textContent = "PÁG. " + (i + 1);
      item.appendChild(num);
      if (p.badge) { const b = document.createElement("div"); b.className = "pg-badge"; b.textContent = p.badge; item.appendChild(b); }
      const title = document.createElement("div"); title.className = "pg-title";
      title.textContent = p.type === "exercise" ? (p.topic || "Exercício") : "Página em branco";
      item.appendChild(title);
      const del = document.createElement("div"); del.className = "pg-del"; del.textContent = "×"; del.title = "Excluir página";
      del.addEventListener("click", (ev) => { ev.stopPropagation(); remove(i); });
      item.appendChild(del);
      item.addEventListener("click", () => switchTo(i));
      pageListEl.appendChild(item);
    });
  }
  function remove(i) {
    if (pages.length <= 1) { alert("Precisa ter ao menos uma página."); return; }
    if (!confirm("Excluir esta página e tudo que está escrito nela?")) return;
    pages.splice(i, 1);
    if (index >= pages.length) index = pages.length - 1;
    renderSidebar(); renderHeader(); ink.loadStrokes(pages[index].strokes); ink.resize(); updateUndoRedo(); scheduleSave();
  }
  function switchTo(i) {
    if (i < 0 || i >= pages.length) return;
    pages[index].strokes = ink.getStrokes();
    index = i;
    renderHeader();
    ink.loadStrokes(pages[index].strokes);
    ink.resize();
    renderSidebar();
    updateUndoRedo();
  }
  function renderHeader() {
    const p = pages[index];
    if (p.type === "exercise") {
      pageHeader.classList.remove("blank-header");
      badgeEl.textContent = p.badge || "";
      qtextEl.innerHTML = p.question || "";
      metaEl.innerHTML = p.answer ? 'resposta: <span id="nbAnsBlur" style="filter:blur(5px); cursor:pointer;">' + p.answer + "</span>" : "";
      const ab = document.getElementById("nbAnsBlur");
      if (ab) ab.addEventListener("click", function () { this.style.filter = this.style.filter === "none" ? "blur(5px)" : "none"; });
    } else {
      pageHeader.classList.add("blank-header");
      badgeEl.textContent = ""; qtextEl.innerHTML = ""; metaEl.innerHTML = "";
    }
  }
  function updatePencilLabel() {
    const lbl = pencilBadge.querySelector(".lbl");
    lbl.textContent = ink.fingerOverride ? "Pencil ativa · dedo ok" : "Pencil ativa";
  }
  function updateUndoRedo() {
    undoBtn.disabled = !ink.canUndo();
    redoBtn.disabled = !ink.canRedo();
  }

  function open() {
    panel.classList.add("open");
    toggleBtn.classList.add("active");
    requestAnimationFrame(() => ink.resize());
  }
  function close() { panel.classList.remove("open"); toggleBtn.classList.remove("active"); }

  // ---------------- JSON import / export ----------------
  function replaceAll(newPages) {
    pages = clonePages(newPages);
    index = 0;
    renderSidebar(); renderHeader();
    ink.loadStrokes(pages[0].strokes || []);
    ink.resize();
    updateUndoRedo();
    scheduleSave();
    if (!panel.classList.contains("open")) open();
  }
  function exportData() {
    pages[index].strokes = ink.getStrokes();
    return { title: "Caderno", pages: pages.map((p) => ({ id: p.id, type: p.type, badge: p.badge, topic: p.topic, question: p.question, answer: p.answer, paper: p.paper, strokes: p.strokes })) };
  }
  function getPageSize() { return { w: PAGE_W, h: PAGE_H }; }
  function getInk() { return ink; }
  function getPages() { pages[index].strokes = ink.getStrokes(); return pages; }
  function getCurrentIndex() { return index; }
  function isOpen() { return panel.classList.contains("open"); }

  return { init, open, close, isOpen, replaceAll, exportData, getPageSize, getInk, getPages, getCurrentIndex, drawPaper, switchTo };
})();
