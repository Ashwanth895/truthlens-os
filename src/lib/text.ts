// Text structuring utilities shared by ingestion and both engines.

const ABBREVIATIONS = [
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "inc", "ltd", "co", "corp",
  "gov", "sen", "rep", "gen", "col", "lt", "sgt", "jan", "feb", "mar", "apr", "jun", "jul",
  "aug", "sep", "sept", "oct", "nov", "dec", "no", "fig", "approx", "est", "u.s", "u.k", "e.g", "i.e",
];

export function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Strip markdown syntax and normalise whitespace while keeping paragraph breaks. */
export function cleanText(raw: string): string {
  let t = raw.replace(/\r\n?/g, "\n");
  t = t.replace(/```[\s\S]*?```/g, " "); // fenced code
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " "); // images
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // links -> text
  t = t.replace(/<[^>]+>/g, " "); // stray html
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, ""); // headings
  t = t.replace(/^\s{0,3}>\s?/gm, ""); // blockquotes
  t = t.replace(/^\s*([-*+]|\d+[.)])\s+/gm, ""); // list bullets
  t = t.replace(/^\s*([-*_]\s*){3,}$/gm, ""); // hr
  t = t.replace(/(\*\*|__)(.*?)\1/g, "$2");
  t = t.replace(/(^|[^\w*])\*(?!\s)([^*\n]+)\*(?=[^\w*]|$)/g, "$1$2");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/[ \t ]+/g, " ");
  t = t.replace(/ *\n */g, "\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/** Split cleaned text into paragraphs. Long unbroken blocks are chunked every ~5 sentences. */
export function toParagraphs(text: string): string[] {
  let blocks = text.split(/\n\s*\n/).map((b) => b.replace(/\n/g, " ").trim()).filter(Boolean);
  // A single-newline-only document: treat lines as paragraphs.
  if (blocks.length === 1 && text.includes("\n")) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) blocks = lines;
  }
  const out: string[] = [];
  for (const b of blocks) {
    const sentences = splitSentences(b);
    if (sentences.length <= 8) {
      out.push(b);
      continue;
    }
    for (let i = 0; i < sentences.length; i += 5) out.push(sentences.slice(i, i + 5).join(" "));
  }
  return out;
}

/** Sentence splitter that respects common abbreviations, decimals and initials. */
export function splitSentences(paragraph: string): string[] {
  const out: string[] = [];
  const re = /[.!?]+["'”’)\]]*\s+(?=["'“‘(\[]?[A-Z0-9])/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(paragraph))) {
    const end = m.index + m[0].length;
    const candidate = paragraph.slice(start, m.index + 1);
    const lastWord = candidate.trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z.]/g, "") ?? "";
    const bare = lastWord.replace(/\.$/, "");
    if (ABBREVIATIONS.includes(bare) || /^[a-z]$/.test(bare)) continue; // initials / abbreviations
    out.push(paragraph.slice(start, end).trim());
    start = end;
  }
  const tail = paragraph.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter((s) => s.length > 1);
}

export function tokenize(s: string): string[] {
  return s.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [];
}

const STOP = new Set(
  "a an the and or but if then of in on at to for from by with without as is are was were be been being this that these those it its it's he she they them his her their our we you your i me my not no yes do does did done have has had will would can could should may might must shall than so such very more most less least about into over under after before between during while also just only up down out off again there here when where why how all any both each few other some own same too s t don".split(" "),
);

export function keywords(s: string): string[] {
  return tokenize(s).filter((w) => w.length > 3 && !STOP.has(w));
}

export function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";
}

/** Derive a short title from the first sentence of the document. */
export function deriveTitle(text: string): string {
  const first = text.split(/\n/)[0]?.trim() ?? "";
  const sentence = splitSentences(first)[0] ?? first;
  const words = sentence.split(/\s+/).slice(0, 12).join(" ");
  return words.length < sentence.length ? `${words}…` : words || "Untitled document";
}
