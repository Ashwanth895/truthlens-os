import "server-only";
// Orchestrates the agent pipeline: ingest -> extract -> verify -> map -> synthesize -> archive.
// Each Claude stage falls back to the heuristic engine on failure, so a run always completes;
// the resulting audit is labelled "hybrid" when that happens.

import type { AgentId, AgentLog, AuditRecord, AuditResult, Claim, EngineId, LogLevel, RunEvent, Verdict } from "./types";
import { MAX_WORDS } from "./types";
import { cleanText, countWords, deriveTitle, fmtMs, splitSentences, toParagraphs } from "./text";
import { computeScores, peakParagraph, sentimentSeries } from "./scoring";
import { heuristicEngine } from "./engines/heuristic";
import { claudeAvailable, claudeEngine, CLAUDE_MODEL } from "./engines/claude";
import type { Engine, Logger } from "./engines/contract";
import { saveAudit } from "./db";

export interface RunInput {
  text: string;
  title?: string;
  sourceType: "text" | "url" | "file";
  sourceUrl?: string | null;
}

export async function runAudit(input: RunInput, emit: (e: RunEvent) => void): Promise<AuditRecord> {
  const t0 = Date.now();
  const logs: AgentLog[] = [];
  const log: Logger = (agent: AgentId, level: LogLevel, message: string) => {
    const entry = { t: Date.now() - t0, agent, level, message };
    logs.push(entry);
    emit({ type: "log", log: entry });
  };
  const useClaude = claudeAvailable();
  const primary: Engine = useClaude ? claudeEngine : heuristicEngine;
  let degraded = false;

  async function stage<T>(agent: AgentId, run: (e: Engine) => Promise<T>): Promise<T> {
    emit({ type: "stage", agent, status: "running" });
    try {
      const out = await run(primary);
      emit({ type: "stage", agent, status: "done" });
      return out;
    } catch (err) {
      if (primary === heuristicEngine) throw err;
      degraded = true;
      log(agent, "warn", `Claude stage failed (${(err as Error).message}). Falling back to the heuristic engine.`);
      const out = await run(heuristicEngine);
      emit({ type: "stage", agent, status: "warn", detail: "heuristic fallback" });
      return out;
    }
  }

  // 1. Ingest
  emit({ type: "stage", agent: "ingest", status: "running" });
  const text = cleanText(input.text);
  const words = countWords(text);
  if (words < 20) throw new Error("Add at least 20 words of text to audit.");
  if (words > MAX_WORDS) throw new Error(`This document has ${words.toLocaleString()} words; the limit is ${MAX_WORDS.toLocaleString()}.`);
  const paragraphs = toParagraphs(text);
  const title = (input.title?.trim() || deriveTitle(text)).slice(0, 200);
  log("ingest", "info", `Cleaned input: ${words.toLocaleString()} words, ${paragraphs.length} paragraphs.`);
  log("ingest", "info", useClaude ? `Engine: Claude multi-agent (${CLAUDE_MODEL}).` : "Engine: offline heuristic (no Claude credentials configured).");
  emit({ type: "stage", agent: "ingest", status: "done" });

  // 2. Extract
  const extraction = await stage("extractor", (e) => e.extract(paragraphs, log));

  // 3 + 4. Verify and map run in parallel — they only depend on extraction.
  const [verdicts, cartography] = await Promise.all([
    stage("verifier", (e) => e.verify(extraction.claims, paragraphs, log)),
    stage("cartographer", (e) => e.map(extraction.claims, extraction.opinions, paragraphs, log)),
  ]);

  const vById = new Map(verdicts.map((v) => [v.id, v]));
  const claims: Claim[] = extraction.claims.map((c) => {
    const v = vById.get(c.id);
    return {
      id: c.id,
      text: c.text,
      paragraph: c.paragraph,
      verdict: v?.verdict ?? "unverified",
      confidence: v?.confidence ?? 40,
      rationale: v?.rationale ?? "No verdict returned.",
      counterArgument: v?.counterArgument ?? "",
      evidence: v?.evidence ?? [],
      frameId: cartography.claimFrame[c.id] ?? null,
      perspectiveId: cartography.claimPerspective[c.id] ?? null,
    };
  });

  const verdictCounts: Record<Verdict, number> = { verified: 0, unverified: 0, contradicted: 0 };
  claims.forEach((c) => verdictCounts[c.verdict]++);
  const sentiment = sentimentSeries(paragraphs, extraction.emotionalTerms);
  const scores = computeScores({
    claims, opinions: extraction.opinions, emotionalTerms: extraction.emotionalTerms,
    frames: cartography.frames, perspectives: cartography.perspectives, words,
  });
  const stats = {
    words,
    paragraphs: paragraphs.length,
    sentences: extraction.sentences || paragraphs.reduce((n, p) => n + splitSentences(p).length, 0),
    claims: claims.length,
    opinions: extraction.opinions.length,
    verdicts: verdictCounts,
  };

  // 5. Synthesize
  const synthesis = await stage("synthesizer", (e) =>
    e.synthesize(
      {
        title,
        stats,
        scores,
        frames: cartography.frames,
        perspectives: cartography.perspectives,
        topEmotional: extraction.emotionalTerms.slice(0, 8),
        contradicted: claims.filter((c) => c.verdict === "contradicted").slice(0, 5).map((c) => ({ text: c.text, counterArgument: c.counterArgument })),
        sampleClaims: claims.slice(0, 12).map((c) => ({ text: c.text, verdict: c.verdict })),
        peakParagraph: peakParagraph(sentiment),
      },
      log,
    ),
  );

  const result: AuditResult = {
    summary: {
      ...synthesis,
      ...scores,
      dominantFrame: cartography.frames[0]?.label ?? "—",
    },
    claims,
    opinions: extraction.opinions,
    frames: cartography.frames,
    perspectives: cartography.perspectives,
    emotionalTerms: extraction.emotionalTerms,
    sentiment,
    stats,
  };

  // 6. Archive
  emit({ type: "stage", agent: "archivist", status: "running" });
  const engine: EngineId = !useClaude ? "heuristic" : degraded ? "hybrid" : "claude";
  log("archivist", "done", `Audit complete in ${fmtMs(Date.now() - t0)}.`);
  const record = await saveAudit({
    title,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl ?? null,
    wordCount: words,
    engine,
    durationMs: Date.now() - t0,
    input: text,
    result,
    logs,
  });
  emit({ type: "stage", agent: "archivist", status: "done" });
  return record;
}
