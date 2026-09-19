/**
 * ink.js — shared handwriting/ink engine.
 *
 * One InkSurface = one drawable area (a slide overlay, or a single
 * notebook page). It owns three stacked <canvas> elements:
 *   bg   — static paper pattern (optional, caller-drawn)
 *   ink  — committed strokes (persisted)
 *   live — the stroke currently being drawn (redrawn every move, cheap)
 *
 * Strokes are stored in NORMALIZED coordinates (0..1 of the surface's
 * CSS width/height) so they stay correct across resizes and are trivial
 * to serialize to JSON.
 *
 * Rendering builds a filled variable-width polygon per stroke (not a
 * sequence of independently-stroked segments), which is what makes the
 * ink look like a real pen instead of a staircase of straight lines.
 */
class InkSurface {
  constructor(opts) {
    this.container = opts.container;          // element the canvases are absolutely positioned inside
    this.bgCanvas = opts.bgCanvas || null;     // optional paper-pattern canvas
    this.inkCanvas = opts.inkCanvas;
    this.liveCanvas = opts.liveCanvas;
    this.refWidth = opts.refWidth || 700;      // CSS width the width presets were tuned for
    this.onStrokeCommitted = opts.onStrokeCommitted || function () {};
    this.onEraseCommitted = opts.onEraseCommitted || function () {};
    this.getPaperDrawer = opts.getPaperDrawer || null; // fn(ctx,w,h) -> draws background

    this.tool = "pen";      // 'pen' | 'highlighter' | 'eraser'
    this.color = "#1B1B1B";
    this.baseWidth = 3.5;

    this.strokes = [];
    this.undoStack = [];
    this.redoStack = [];

    this.pencilDetected = false;
    this.fingerOverride = false;
    this.onPencilDetected = opts.onPencilDetected || function () {};

    this._activeStroke = null;
    this._activePointerId = null;
    this._erasedThisGesture = [];
    this._cssW = 0; this._cssH = 0;

    this._bindPointerEvents();
  }

  // ---------------- public API ----------------
  setTool(t) { this.tool = t; }
  setColor(c) { this.color = c; }
  setWidth(w) { this.baseWidth = w; }
  setFingerOverride(v) { this.fingerOverride = v; }

  loadStrokes(strokes) {
    this.strokes = (strokes || []).slice();
    this.undoStack = []; this.redoStack = [];
    this.redrawAll();
  }
  getStrokes() { return this.strokes; }

  clearAll() {
    if (!this.strokes.length) return;
    this.undoStack.push({ type: "erase", strokes: this.strokes.slice() });
    this.redoStack = [];
    this.strokes = [];
    this.redrawAll();
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  undo() {
    const action = this.undoStack.pop();
    if (!action) return;
    if (action.type === "add") {
      const idx = this.strokes.lastIndexOf(action.stroke);
      if (idx > -1) this.strokes.splice(idx, 1);
    } else if (action.type === "erase") {
      action.strokes.forEach((s) => this.strokes.push(s));
    }
    this.redoStack.push(action);
    this.redrawAll();
  }
  redo() {
    const action = this.redoStack.pop();
    if (!action) return;
    if (action.type === "add") {
      this.strokes.push(action.stroke);
    } else if (action.type === "erase") {
      action.strokes.forEach((s) => { const idx = this.strokes.indexOf(s); if (idx > -1) this.strokes.splice(idx, 1); });
    }
    this.undoStack.push(action);
    this.redrawAll();
  }

  /** Call whenever the container's rendered size may have changed. */
  resize() {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    this._cssW = w; this._cssH = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    [this.bgCanvas, this.inkCanvas, this.liveCanvas].forEach((c) => {
      if (!c) return;
      c.style.width = w + "px"; c.style.height = h + "px";
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    this.redrawAll();
  }

  redrawAll() {
    if (this.bgCanvas && this.getPaperDrawer) {
      const ctx = this.bgCanvas.getContext("2d");
      ctx.clearRect(0, 0, this._cssW, this._cssH);
      this.getPaperDrawer(ctx, this._cssW, this._cssH);
    }
    const ictx = this.inkCanvas.getContext("2d");
    ictx.clearRect(0, 0, this._cssW, this._cssH);
    this.strokes.forEach((s) => this._paintStroke(ictx, s));
  }

  /** Draw this surface's paper + ink onto an arbitrary destination context (for export). */
  renderTo(destCtx, w, h) {
    if (this.getPaperDrawer) this.getPaperDrawer(destCtx, w, h);
    const savedW = this._cssW, savedH = this._cssH;
    this._cssW = w; this._cssH = h;
    this.strokes.forEach((s) => this._paintStroke(destCtx, s));
    this._cssW = savedW; this._cssH = savedH;
  }

  // ---------------- geometry / rendering ----------------
  _scale() { return this._cssW / this.refWidth; }

  /** Light smoothing pass to remove raw-sample jitter before building the polygon. */
  _smooth(points) { return InkSurface._smoothPts(points); }

  _paintStroke(ctx, stroke) {
    InkSurface.paintStroke(ctx, stroke, this._cssW, this._cssH, this.refWidth);
  }

  _strokeWidth(stroke, pressure) {
    return InkSurface._widthFor(stroke.width, pressure, this._cssW, this.refWidth);
  }

  // ---------------- pointer handling ----------------
  _toNorm(clientX, clientY) {
    const rect = this.inkCanvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }

  _bindPointerEvents() {
    const el = this.inkCanvas;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (e) => this._onDown(e));
    el.addEventListener("pointermove", (e) => this._onMove(e));
    window.addEventListener("pointerup", (e) => this._onUp(e));
    window.addEventListener("pointercancel", (e) => this._onUp(e));
    // Extra native-touch guard: never let iOS treat a drag on the canvas as a
    // selection/callout gesture, even if Pointer Events are ever delayed.
    el.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    el.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  }

  // ---------------- static helpers (also used for headless export rendering) ----------------
  static _smoothPts(points) {
    if (points.length < 3) return points;
    const out = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      out.push({
        x: (points[i - 1].x + points[i].x + points[i + 1].x) / 3,
        y: (points[i - 1].y + points[i].y + points[i + 1].y) / 3,
        p: points[i].p,
      });
    }
    out.push(points[points.length - 1]);
    return out;
  }

  static _widthFor(baseWidth, pressure, cssW, refWidth) {
    const p = pressure || 0.5;
    const scale = cssW / (refWidth || 700);
    return Math.max(1, baseWidth * (0.45 + p * 1.1) * scale);
  }

  /** Paint one stroke (normalized 0..1 points) onto any 2D context sized wCss x hCss. */
  static paintStroke(ctx, stroke, wCss, hCss, refWidth) {
    const raw = stroke.points;
    if (!raw || !raw.length) return;
    const pts = raw.map((pt) => ({ x: pt.x * wCss, y: pt.y * hCss, p: pt.p }));

    ctx.save();
    if (stroke.tool === "highlighter") { ctx.globalAlpha = 0.32; ctx.globalCompositeOperation = "multiply"; }
    else { ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; }
    ctx.fillStyle = stroke.color;

    const widthAt = (p) => InkSurface._widthFor(stroke.width, p, wCss, refWidth);

    if (pts.length === 1) {
      const r = widthAt(pts[0].p) / 2;
      ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }

    const sm = InkSurface._smoothPts(pts);
    const left = [], right = [];
    for (let i = 0; i < sm.length; i++) {
      const p0 = sm[Math.max(0, i - 1)];
      const p1 = sm[Math.min(sm.length - 1, i + 1)];
      let dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const nx = -dy, ny = dx;
      const w = widthAt(sm[i].p) / 2;
      left.push({ x: sm[i].x + nx * w, y: sm[i].y + ny * w });
      right.push({ x: sm[i].x - nx * w, y: sm[i].y - ny * w });
    }
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fill();
    const rStart = widthAt(sm[0].p) / 2;
    const rEnd = widthAt(sm[sm.length - 1].p) / 2;
    ctx.beginPath(); ctx.arc(sm[0].x, sm[0].y, rStart, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sm[sm.length - 1].x, sm[sm.length - 1].y, rEnd, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _onDown(e) {
    if (e.pointerType === "pen" && !this.pencilDetected) {
      this.pencilDetected = true;
      this.onPencilDetected(true);
    }
    if (this.pencilDetected && e.pointerType === "touch" && !this.fingerOverride) return; // palm rejection
    if (this._activePointerId !== null) return;
    this._activePointerId = e.pointerId;
    try { this.inkCanvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

    const pos = this._toNorm(e.clientX, e.clientY);
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;

    if (this.tool === "eraser") {
      this._erasedThisGesture = [];
      this._eraseAt(pos);
    } else {
      this._activeStroke = { tool: this.tool, color: this.color, width: this.baseWidth, points: [{ x: pos.x, y: pos.y, p: pressure }] };
    }
    e.preventDefault();
  }

  _onMove(e) {
    if (e.pointerId !== this._activePointerId) return;
    e.preventDefault();
    const events = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e];

    if (this.tool === "eraser") {
      events.forEach((ev) => this._eraseAt(this._toNorm(ev.clientX, ev.clientY)));
      return;
    }
    if (!this._activeStroke) return;
    events.forEach((ev) => {
      const pos = this._toNorm(ev.clientX, ev.clientY);
      const pressure = ev.pressure && ev.pressure > 0 ? ev.pressure : 0.5;
      this._activeStroke.points.push({ x: pos.x, y: pos.y, p: pressure });
    });
    // live preview: redraw only the in-progress stroke, on its own canvas
    const lctx = this.liveCanvas.getContext("2d");
    lctx.clearRect(0, 0, this._cssW, this._cssH);
    this._paintStroke(lctx, this._activeStroke);
  }

  _onUp(e) {
    if (e.pointerId !== this._activePointerId) return;
    if (this.tool === "eraser") {
      if (this._erasedThisGesture.length) {
        this.undoStack.push({ type: "erase", strokes: this._erasedThisGesture });
        this.redoStack = [];
        this.onEraseCommitted();
      }
      this._erasedThisGesture = [];
    } else if (this._activeStroke && this._activeStroke.points.length) {
      this.strokes.push(this._activeStroke);
      this.undoStack.push({ type: "add", stroke: this._activeStroke });
      this.redoStack = [];
      this._activeStroke = null;
      this.liveCanvas.getContext("2d").clearRect(0, 0, this._cssW, this._cssH);
      this.redrawAll();
      this.onStrokeCommitted();
    }
    this._activePointerId = null;
  }

  _eraseAt(pos) {
    const radius = 0.026;
    const remaining = [];
    let changed = false;
    this.strokes.forEach((s) => {
      const hit = s.points.some((pt) => {
        const dx = pt.x - pos.x, dy = (pt.y - pos.y) * (this._cssH / this._cssW || 1);
        return Math.sqrt(dx * dx + dy * dy) < radius;
      });
      if (hit) { this._erasedThisGesture.push(s); changed = true; } else { remaining.push(s); }
    });
    if (changed) { this.strokes = remaining; this.redrawAll(); }
  }
}
