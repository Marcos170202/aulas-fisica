/**
 * export.js — turns the current lesson/notebook into files the person
 * can keep: PDF (native browser print — exact to what's on screen) and
 * PowerPoint (rasterized slide-by-slide, generated on demand so the
 * heavy libraries are never loaded unless actually used).
 */
const Exporter = (function () {
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Falha ao carregar biblioteca: " + src));
      document.head.appendChild(s);
    });
  }
  async function ensureHtml2Canvas() {
    if (window.html2canvas) return;
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
  }
  async function ensurePptxGen() {
    if (window.PptxGenJS) return;
    await loadScript("https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js");
  }

  function showOverlay(msg) {
    const el = document.getElementById("exportOverlay");
    el.querySelector(".msg").textContent = msg;
    el.classList.add("show");
  }
  function hideOverlay() { document.getElementById("exportOverlay").classList.remove("show"); }

  function slugify(text) {
    return (text || "arquivo").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "arquivo";
  }

  async function saveBlob(blob, filename) {
    const api = window.claude;
    if (!api || !api.use) { alert("Exportação não disponível neste visualizador."); return false; }
    const downloads = await api.use("downloads");
    if (!downloads) { alert("Exportação não disponível neste visualizador."); return false; }
    try { await downloads.save({ filename, data: blob }); return true; }
    catch (err) { if (err && err.code !== "declined") alert("Não foi possível salvar o arquivo."); return false; }
  }

  // ================= PDF — native print (pixel-exact to the screen) =================
  function exportSlidesPdf() {
    window.print();
  }

  async function exportNotebookPdf() {
    showOverlay("Preparando páginas do caderno…");
    const pages = Notebook.getPages();
    const { w, h } = Notebook.getPageSize();
    const root = document.getElementById("printNbRoot");
    root.innerHTML = "";
    const scale = 1.4;
    pages.forEach((p) => {
      const canvas = document.createElement("canvas");
      canvas.width = w * scale; canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      Notebook.drawPaper(ctx, w, h, p);
      (p.strokes || []).forEach((s) => InkSurface.paintStroke(ctx, s, w, h, 700));

      const pageDiv = document.createElement("div");
      pageDiv.className = "pnb-page";
      if (p.type === "exercise") {
        const b = document.createElement("div"); b.className = "pnb-badge"; b.textContent = p.badge || ""; pageDiv.appendChild(b);
        const q = document.createElement("div"); q.className = "pnb-q"; q.innerHTML = p.question || ""; pageDiv.appendChild(q);
      }
      const img = document.createElement("img");
      img.src = canvas.toDataURL("image/png");
      pageDiv.appendChild(img);
      root.appendChild(pageDiv);
    });
    hideOverlay();
    document.body.classList.add("printing-notebook");
    window.print();
    let cleaned = false;
    function cleanup() {
      if (cleaned) return; cleaned = true;
      document.body.classList.remove("printing-notebook");
      root.innerHTML = "";
      window.removeEventListener("afterprint", cleanup);
    }
    window.addEventListener("afterprint", cleanup);
    setTimeout(cleanup, 15000); // fallback in case afterprint doesn't fire
  }

  // ================= PPTX — rasterized snapshot of each slide =================
  async function exportSlidesPptx() {
    const savedIndex = Slides.current().index;
    const wasNbOpen = Notebook.isOpen();
    try {
      showOverlay("Carregando bibliotecas…");
      await ensureHtml2Canvas();
      await ensurePptxGen();
      if (wasNbOpen) Notebook.close();

      const slideEls = Slides.getSlideElements();
      const lesson = Slides.getLesson();
      const pptx = new window.PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";
      const PW = 13.333, PH = 7.5;

      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      for (let i = 0; i < slideEls.length; i++) {
        showOverlay("Capturando slide " + (i + 1) + " de " + slideEls.length + "…");
        slideEls.forEach((s) => s.classList.remove("active"));
        slideEls[i].classList.add("active");
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const canvas = await window.html2canvas(slideEls[i], { backgroundColor: "#0B1330", scale: 2, useCORS: true, logging: false });
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        const slide = pptx.addSlide();
        slide.addImage({ data: dataUrl, x: 0, y: 0, w: PW, h: PH });
      }

      showOverlay("Gerando arquivo PowerPoint…");
      const blob = await pptx.write({ outputType: "blob" });
      await saveBlob(blob, slugify(lesson.title) + ".pptx");
    } catch (err) {
      console.error(err);
      alert("Não foi possível gerar o PowerPoint (verifique a conexão) — tente novamente, ou use a exportação em PDF, que é mais confiável.");
    } finally {
      Slides.goTo(savedIndex);
      if (wasNbOpen) Notebook.open();
      hideOverlay();
    }
  }

  return { exportSlidesPdf, exportNotebookPdf, exportSlidesPptx, saveBlob, slugify };
})();
