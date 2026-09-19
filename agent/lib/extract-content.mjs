import fs from "node:fs/promises";
import path from "node:path";

const TEXT_EXT = new Set([".md", ".markdown", ".txt"]);

/**
 * Reads every source file in a content folder (PDF, Markdown, plain text)
 * and concatenates their extracted text, each tagged with its filename so
 * the model can cite where a fact came from if useful.
 */
export async function extractFolderText(folder) {
  const names = (await fs.readdir(folder)).filter((n) => !n.startsWith("."));
  const chunks = [];
  for (const name of names) {
    const full = path.join(folder, name);
    const stat = await fs.stat(full);
    if (!stat.isFile()) continue;
    const ext = path.extname(name).toLowerCase();
    if (ext === ".pdf") {
      const buf = await fs.readFile(full);
      const { default: pdfParse } = await import("pdf-parse");
      const data = await pdfParse(buf);
      chunks.push(`--- ${name} ---\n${data.text.trim()}`);
    } else if (TEXT_EXT.has(ext)) {
      const text = await fs.readFile(full, "utf8");
      chunks.push(`--- ${name} ---\n${text.trim()}`);
    }
    // config.json and anything else is skipped here on purpose.
  }
  if (!chunks.length) {
    throw new Error(
      `Nenhum arquivo de conteúdo (.pdf, .md, .txt) encontrado em ${folder}`
    );
  }
  return chunks.join("\n\n");
}
