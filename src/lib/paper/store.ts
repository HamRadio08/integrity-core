import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AuditRun } from "@/lib/audit/types";
import { emptyPaperBook, shouldRetick, tickPaper } from "./engine";
import { executionMode } from "./mode";
import type { PaperBook } from "./types";

const BOOK_KEY = "__stackAttestationPaperBook";

type PaperGlobal = Record<string, PaperBook | undefined>;

function persistEnabled(): boolean {
  if (process.env.VITEST === "true") return false;
  if (process.env.PAPER_PERSIST === "0") return false;
  return true;
}

export function paperBookPath(cwd = process.cwd()): string {
  return join(cwd, "data", "paper-book.json");
}

function loadFromDisk(): PaperBook | null {
  if (!persistEnabled()) return null;
  try {
    const raw = readFileSync(paperBookPath(), "utf8");
    const parsed = JSON.parse(raw) as PaperBook;
    if (parsed.mode !== "paper" || parsed.venue !== "paper-ledger") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveToDisk(book: PaperBook): void {
  if (!persistEnabled()) return;
  const path = paperBookPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(book, null, 2)}\n`);
}

export function resetPaperBookForTests(): void {
  const g = globalThis as unknown as PaperGlobal;
  g[BOOK_KEY] = undefined;
}

export function getHeldPaperBook(): PaperBook {
  executionMode();
  const g = globalThis as unknown as PaperGlobal;
  if (!g[BOOK_KEY]) {
    g[BOOK_KEY] = loadFromDisk() ?? emptyPaperBook();
  }
  return g[BOOK_KEY]!;
}

export function replaceHeldPaperBook(book: PaperBook): PaperBook {
  executionMode();
  const g = globalThis as unknown as PaperGlobal;
  g[BOOK_KEY] = book;
  saveToDisk(book);
  return book;
}

export function tickActivePaper(
  run: Pick<AuditRun, "runId" | "records">,
  options: { force?: boolean; nowIso?: string } = {},
): PaperBook {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const held = getHeldPaperBook();
  if (!options.force && !shouldRetick(held, run.runId, Date.parse(nowIso))) {
    return held;
  }
  return replaceHeldPaperBook(tickPaper({ runId: run.runId, records: run.records }, held, nowIso));
}
