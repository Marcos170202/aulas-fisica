#!/usr/bin/env node
/**
 * generate-lesson.mjs — the autonomous agent's entry point.
 *
 * Usage: node generate-lesson.mjs <slug> [--length short|medium|long]
 *
 * Reads conteudo/<slug>/config.json + the PDF/Markdown/text files sitting
 * next to it, asks Claude to produce a slide deck and an exercise
 * notebook that follow the site's existing HTML/CSS component vocabulary,
 * and writes:
 *   data/lessons/<slug>/lesson.json
 *   data/lessons/<slug>/notebook.json
 *   data/manifest.json   (slug added/updated)
 *
 * This is what the GitHub Action (.github/workflows/generate-content.yml)
 * runs on every push to conteudo/** or on manual dispatch — the whole
 * point being that nobody has to open Claude Code to publish a new lesson.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

import { extractFolderText } from "./lib/extract-content.mjs";
import {
  buildLessonSystemPrompt,
  buildLessonUserPrompt,
  buildNotebookSystemPrompt,
  buildNotebookUserPrompt,
} from "./lib/prompt.mjs";
import { LESSON_TOOL, NOTEBOOK_TOOL, checkLessonShape, normalizeNotebook } from "./lib/schema.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MODEL = process.env.LESSON_MODEL || "claude-opus-5";
const MAX_TOKENS = { short: 6000, medium: 12000, long: 24000 };

function parseArgs(argv) {
  const [slug, ...rest] = argv;
  if (!slug) {
    console.error("Uso: node generate-lesson.mjs <slug> [--length short|medium|long]");
    process.exit(1);
  }
  let length = null;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--length") length = rest[i + 1];
  }
  return { slug, lengthOverride: length };
}

async function readConfig(folder) {
  const configPath = path.join(folder, "config.json");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Não encontrei/consegui ler ${configPath}. Crie um config.json com {"title": "...", "subject": "...", "length": "short|medium|long"}.`
    );
  }
}

/**
 * One forced-tool-use call, streamed (recommended for high max_tokens —
 * avoids HTTP timeouts on a large generated deck), with a single retry
 * on transient failure.
 */
async function callTool(client, { system, user, tool, maxTokens }) {
  const attempt = async () => {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    });
    return stream.finalMessage();
  };

  let res;
  try {
    res = await attempt();
  } catch (err) {
    console.warn(`  (chamada falhou, tentando mais uma vez: ${err.message})`);
    await new Promise((r) => setTimeout(r, 3000));
    res = await attempt();
  }

  if (res.stop_reason === "refusal") {
    throw new Error(`Claude recusou o pedido (${tool.name}): ${res.stop_details?.explanation || "sem detalhes"}`);
  }
  if (res.stop_reason === "max_tokens") {
    throw new Error(`Resposta truncada por max_tokens em ${tool.name} — aumente MAX_TOKENS ou reduza o material-fonte.`);
  }
  const block = res.content.find((b) => b.type === "tool_use" && b.name === tool.name);
  if (!block) throw new Error(`Claude não chamou a ferramenta ${tool.name} como esperado.`);
  return block.input;
}

async function updateManifest(entry) {
  const manifestPath = path.join(REPO_ROOT, "data", "manifest.json");
  let manifest = { lessons: [] };
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (err) {
    /* first lesson ever generated — start fresh */
  }
  const idx = manifest.lessons.findIndex((l) => l.slug === entry.slug);
  if (idx >= 0) manifest.lessons[idx] = entry;
  else manifest.lessons.push(entry);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

async function main() {
  const { slug, lengthOverride } = parseArgs(process.argv.slice(2));
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY não está definida no ambiente.");
  }

  const contentFolder = path.join(REPO_ROOT, "conteudo", slug);
  const config = await readConfig(contentFolder);
  const length = lengthOverride || config.length || "medium";
  if (!["short", "medium", "long"].includes(length)) {
    throw new Error(`length inválido: "${length}" (use short, medium ou long).`);
  }

  console.log(`→ Lendo conteúdo-fonte de conteudo/${slug}/ ...`);
  const sourceText = await extractFolderText(contentFolder);
  console.log(`  ${sourceText.length} caracteres extraídos.`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const promptCtx = { title: config.title || slug, subject: config.subject, sourceText };

  console.log(`→ Gerando slides (nível "${length}") com ${MODEL} ...`);
  const lesson = await callTool(client, {
    system: buildLessonSystemPrompt(length),
    user: buildLessonUserPrompt(promptCtx),
    tool: LESSON_TOOL,
    maxTokens: MAX_TOKENS[length],
  });
  const warnings = checkLessonShape(lesson, length);
  warnings.forEach((w) => console.warn(`  aviso: ${w}`));
  console.log(`  ${lesson.slides.length} slides gerados.`);

  console.log(`→ Gerando caderno de exercícios ...`);
  const notebook = await callTool(client, {
    system: buildNotebookSystemPrompt(length),
    user: buildNotebookUserPrompt(promptCtx),
    tool: NOTEBOOK_TOOL,
    maxTokens: MAX_TOKENS[length],
  });
  normalizeNotebook(notebook);
  console.log(`  ${notebook.pages.length} páginas geradas.`);

  const outDir = path.join(REPO_ROOT, "data", "lessons", slug);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "lesson.json"), JSON.stringify(lesson, null, 2) + "\n");
  await fs.writeFile(path.join(outDir, "notebook.json"), JSON.stringify(notebook, null, 2) + "\n");

  await updateManifest({
    slug,
    title: lesson.title,
    subtitle: lesson.subtitle || "",
    length,
    generatedAt: new Date().toISOString(),
    source: "agent",
  });

  console.log(`✓ Aula "${slug}" publicada em data/lessons/${slug}/.`);
}

main().catch((err) => {
  console.error("✗ " + err.message);
  process.exit(1);
});
