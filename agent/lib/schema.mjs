export const LESSON_TOOL = {
  name: "emit_lesson",
  description: "Emite a aula gerada (título, subtítulo e slides).",
  input_schema: {
    type: "object",
    required: ["title", "subtitle", "slides"],
    properties: {
      title: { type: "string" },
      subtitle: { type: "string" },
      slides: {
        type: "array",
        minItems: 4,
        items: {
          type: "object",
          required: ["id", "html"],
          properties: {
            id: { type: "string" },
            html: { type: "string" },
          },
        },
      },
    },
  },
};

export const NOTEBOOK_TOOL = {
  name: "emit_notebook",
  description: "Emite o caderno de exercícios gerado (título e páginas).",
  input_schema: {
    type: "object",
    required: ["title", "pages"],
    properties: {
      title: { type: "string" },
      pages: {
        type: "array",
        minItems: 3,
        items: {
          type: "object",
          required: ["id", "type", "paper", "strokes"],
          properties: {
            id: { type: "string" },
            type: { type: "string", enum: ["exercise", "blank"] },
            badge: { type: "string" },
            topic: { type: "string" },
            question: { type: "string" },
            answer: { type: "string" },
            paper: { type: "string", enum: ["blank", "lined", "grid", "dotted"] },
            strokes: { type: "array", maxItems: 0 },
          },
        },
      },
    },
  },
};

const TIER_BOUNDS = {
  short: [6, 10],
  medium: [10, 16],
  long: [16, 26],
};

/** Light validation — logs a warning instead of failing hard, since a
 * slightly-off slide count is still a usable lesson. */
export function checkLessonShape(lesson, length) {
  const warnings = [];
  if (!Array.isArray(lesson.slides) || !lesson.slides.length) {
    throw new Error("A aula gerada não tem slides.");
  }
  const [min, max] = TIER_BOUNDS[length] || TIER_BOUNDS.medium;
  const n = lesson.slides.length;
  if (n < min || n > max * 1.3) {
    warnings.push(`esperado ~${min}-${max} slides para o nível "${length}", veio ${n}`);
  }
  lesson.slides.forEach((s, i) => {
    if (!s.id) s.id = "s" + (i + 1);
    if (typeof s.html !== "string" || !s.html.trim()) {
      throw new Error(`Slide ${i + 1} veio sem conteúdo HTML.`);
    }
  });
  return warnings;
}

export function normalizeNotebook(notebook) {
  notebook.pages.forEach((p, i) => {
    if (!p.id) p.id = (p.type === "blank" ? "blank" : "ex") + (i + 1);
    p.strokes = []; // never trust generated strokes — always start blank
  });
  return notebook;
}
