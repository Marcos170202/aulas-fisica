/**
 * slides.js — slide-deck engine.
 * Renders LESSON.slides into #stage, handles navigation, the generic
 * exercise-option click logic (works for any lesson JSON), and the
 * "annotate over the current slide" ink layer.
 */
const Slides = (function () {
  let LESSON = { title: "Aula", slides: [] };
  let slideEls = [];
  let index = 0;
  let ink = null;

  const stage = document.getElementById("stage");
  const lessonSubtitle = document.getElementById("lessonSubtitle");
  const curNum = document.getElementById("curNum");
  const totNum = document.getElementById("totNum");
  const progressFill = document.getElementById("progress-fill");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const slideZone = document.getElementById("slideZone");

  function init() {
    ink = new InkSurface({
      container: document.getElementById("slideInkWrap"),
      inkCanvas: document.getElementById("slideInk"),
      liveCanvas: document.getElementById("slideLive"),
      refWidth: 900,
    });
    new ResizeObserver(() => ink.resize()).observe(slideZone);

    prevBtn.addEventListener("click", prev);
    nextBtn.addEventListener("click", next);
    document.addEventListener("keydown", (e) => {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") setAnnotateMode(false);
    });
    stage.addEventListener("click", (e) => {
      if (annotateOn()) return;
      if (e.target.closest(".opt") || e.target.closest("a") || e.target.closest("button")) return;
      const rect = slideZone.getBoundingClientRect();
      const rx = e.clientX - rect.left;
      if (rx < rect.width * 0.14) prev();
      else if (rx > rect.width * 0.86) next();
    });
    let touchX = null;
    stage.addEventListener("touchstart", (e) => { if (!annotateOn()) touchX = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener("touchend", (e) => {
      if (annotateOn() || touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 60) { dx < 0 ? next() : prev(); }
      touchX = null;
    }, { passive: true });

    stage.addEventListener("click", onOptionClick);

    initAnnotateToolbar();
  }

  function load(lesson) {
    LESSON = lesson && Array.isArray(lesson.slides) ? lesson : { title: "Aula", slides: [] };
    stage.innerHTML = "";
    slideEls = LESSON.slides.map((s, i) => {
      const sec = document.createElement("section");
      sec.className = "slide";
      sec.dataset.index = i;
      sec.innerHTML = s.html;
      stage.appendChild(sec);
      return sec;
    });
    index = 0;
    totNum.textContent = slideEls.length || 1;
    lessonSubtitle.textContent = LESSON.title || "";
    render();
  }

  function render() {
    slideEls.forEach((el, i) => el.classList.toggle("active", i === index));
    curNum.textContent = slideEls.length ? index + 1 : 0;
    progressFill.style.width = slideEls.length ? ((index + 1) / slideEls.length) * 100 + "%" : "0%";
    prevBtn.classList.toggle("disabled", index === 0);
    nextBtn.classList.toggle("disabled", index >= slideEls.length - 1);
    if (ink) { ink.loadStrokes([]); ink.resize(); }
  }
  function goTo(i) { index = Math.max(0, Math.min(slideEls.length - 1, i)); render(); }
  function next() { goTo(index + 1); }
  function prev() { goTo(index - 1); }

  function onOptionClick(e) {
    const opt = e.target.closest(".opt");
    if (!opt) return;
    const list = opt.closest(".opt-list");
    if (!list || list.classList.contains("locked")) return;
    const correct = list.dataset.correct;
    const picked = opt.dataset.letter;
    list.classList.add("locked");
    Array.from(list.children).forEach((o) => {
      o.classList.add("locked");
      if (o.dataset.letter === correct) o.classList.add("correct");
      else if (o.dataset.letter === picked) o.classList.add("wrong");
      else o.classList.add("dim");
    });
    const wrap = opt.closest(".ex-wrap");
    if (!wrap) return;
    const fb = wrap.querySelector(".feedback");
    const res = wrap.querySelector(".resolution");
    if (fb) {
      fb.classList.add("show");
      if (picked === correct) { fb.textContent = "Isso mesmo! Resposta correta."; fb.classList.add("ok"); }
      else { fb.textContent = "Não foi dessa vez — a alternativa correta é a " + correct + "."; fb.classList.add("no"); }
    }
    if (res) res.classList.add("show");
  }

  // ---------------- annotate-over-slide toolbar ----------------
  const wrapEl = () => document.getElementById("slideInkWrap");
  function annotateOn() { return wrapEl().classList.contains("on"); }
  function setAnnotateMode(on) {
    wrapEl().classList.toggle("on", on);
    document.getElementById("drawFab").classList.toggle("on", on);
    document.getElementById("drawToolbar").classList.toggle("show", on);
  }
  function initAnnotateToolbar() {
    document.getElementById("drawFab").addEventListener("click", () => setAnnotateMode(!annotateOn()));
    document.querySelectorAll("#drawToolbar .swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        document.querySelectorAll("#drawToolbar .swatch").forEach((s) => s.classList.remove("active"));
        sw.classList.add("active");
        ink.setColor(sw.dataset.color);
        ink.setTool("pen");
        document.getElementById("eraseBtn").classList.remove("active");
      });
    });
    document.querySelectorAll("#drawToolbar .toolbtn[data-w]").forEach((b) => {
      b.addEventListener("click", () => ink.setWidth(parseFloat(b.dataset.w)));
    });
    document.getElementById("eraseBtn").addEventListener("click", function () {
      const isEraser = ink.tool !== "eraser";
      ink.setTool(isEraser ? "eraser" : "pen");
      this.classList.toggle("active", isEraser);
    });
    document.getElementById("clearDrawBtn").addEventListener("click", () => ink.clearAll());
  }

  function current() { return { lesson: LESSON, index }; }
  function getLesson() { return LESSON; }
  function count() { return slideEls.length; }
  function getSlideElements() { return slideEls; }

  return { init, load, next, prev, goTo, current, getLesson, count, getSlideElements };
})();
