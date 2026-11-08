import type { AuditRecord } from "./types";

const VERDICT_LABEL = { verified: "Verified Fact", unverified: "Unverified Assertion", contradicted: "Contradicted Statement" } as const;
const ENGINE_LABEL = { claude: "Claude multi-agent", heuristic: "Offline heuristic", hybrid: "Claude + heuristic fallback" } as const;

export function toMarkdown(a: AuditRecord): string {
  const r = a.result;
  const s = r.summary;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const esc = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const lines = [
    `# TruthLens Audit — ${a.title}`,
    "",
    `- **Created:** ${new Date(a.createdAt).toLocaleString()}`,
    `- **Source:** ${a.sourceUrl ?? a.sourceType} · ${a.wordCount.toLocaleString()} words`,
    `- **Engine:** ${ENGINE_LABEL[a.engine]} · ${a.durationMs < 1000 ? `${a.durationMs} ms` : `${(a.durationMs / 1000).toFixed(1)} s`}`,
    "",
    `## ${s.headline}`,
    "",
    s.overview,
    "",
    `| Credibility | Bias index | Emotional intensity | Dominant frame |`,
    `|---|---|---|---|`,
    `| ${s.credibilityScore}/100 | ${s.biasIndex}/100 | ${s.emotionalIntensity}/100 | ${s.dominantFrame} |`,
    "",
    "### Signals",
    ...s.signals.map((g) => `- **${g.label}** (${g.tone}) — ${g.detail}`),
    "",
    "## Framing",
    ...r.frames.map((f) => `- **${f.label}** ${pct(f.weight)} — ${f.description}`),
    "",
    "## Voices",
    ...r.perspectives.map((p) => `- **${p.label}** ${pct(p.share)} — ${p.description}`),
    "",
    "## Emotional language",
    r.emotionalTerms.slice(0, 15).map((t) => `“${t.term}” ×${t.count}`).join(" · ") || "_None detected._",
    "",
    `## Claims (${r.claims.length})`,
    "",
    "| # | Claim | Verdict | Confidence | Counter-argument |",
    "|---|---|---|---|---|",
    ...r.claims.map((c) => `| ${c.id.toUpperCase()} | ${esc(c.text)} | ${VERDICT_LABEL[c.verdict]} | ${c.confidence} | ${esc(c.counterArgument)} |`),
    "",
    `## Opinions (${r.opinions.length})`,
    ...r.opinions.map((o) => `- ${o.text}`),
    "",
  ];
  return lines.join("\n");
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
