import "server-only";
// Claude-backed multi-agent engine. Each stage is a separate, narrowly scoped agent with a
// structured-output contract (Zod -> JSON schema), so the orchestrator never parses free text.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { AgentId, Frame, Perspective } from "../types";
import { clamp, countWords, slug } from "../text";
import type { Cartography, Engine, Extraction, RawClaim, Synthesis, VerdictRecord } from "./contract";

const MODEL = process.env.TRUTHLENS_MODEL || "claude-opus-5-5";
const CHUNK_WORDS = 5_000;
const VERIFY_BATCH = 30;
const CONCURRENCY = 4;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ maxRetries: 3 }));

type Effort = "low" | "medium" | "high";

async function runAgent<T extends z.ZodType>(opts: {
  agent: AgentId;
  system: string;
  shared?: string; // stable context shared across parallel calls (prompt-cached)
  task: string;
  schema: T;
  effort: Effort;
  maxTokens?: number;
}): Promise<z.infer<T>> {
  const content: Anthropic.Beta.BetaTextBlockParam[] = [];
  if (opts.shared) content.push({ type: "text", text: opts.shared, cache_control: { type: "ephemeral" } });
  content.push({ type: "text", text: opts.task });

  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16_000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    messages: [{ role: "user", content }],
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
  });
  if (res.stop_reason === "refusal") {
    throw new Error(`${opts.agent} request was declined (${res.stop_details?.category ?? "policy"}).`);
  }
  if (res.stop_reason === "max_tokens") throw new Error(`${opts.agent} output hit the token limit.`);
  if (res.parsed_output == null) throw new Error(`${opts.agent} returned output that didn't match its schema.`);
  return res.parsed_output as z.infer<T>;
}

async function pMap<I, O>(items: I[], limit: number, fn: (item: I, i: number) => Promise<O>): Promise<O[]> {
  const out = new Array<O>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

const numbered = (paragraphs: string[], offset = 0) => paragraphs.map((p, i) => `[P${i + offset}] ${p}`).join("\n\n");

// ---------- Agent contracts ----------

const ExtractSchema = z.object({
  claims: z.array(
    z.object({
      text: z.string().describe("One self-contained, checkable proposition, minimally rephrased from the source."),
      paragraph: z.number().int().describe("Paragraph index from the [P#] tag."),
      source: z.string().describe("Named source the text attributes this claim to, or empty string."),
    }),
  ),
  opinions: z.array(
    z.object({
      text: z.string(),
      paragraph: z.number().int(),
      markers: z.array(z.string()).describe("Words or phrases that make this subjective."),
    }),
  ),
  emotional: z.array(
    z.object({
      term: z.string().describe("Loaded or emotive word/phrase exactly as written."),
      valence: z.number().describe("-1 (very negative) to 1 (very positive)."),
      intensity: z.number().describe("0 (mild) to 1 (extreme)."),
      paragraphs: z.array(z.number().int()).describe("Paragraph index for every occurrence."),
    }),
  ),
});

const VerifySchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      verdict: z.enum(["verified", "unverified", "contradicted"]),
      confidence: z.number().int().describe("0-100: how strongly the evidence supports this verdict."),
      rationale: z.string().describe("One or two sentences explaining the verdict."),
      counterArgument: z.string().describe("The strongest counter-argument, caveat or missing context."),
      evidence: z.array(z.string()).describe("Short evidence notes: established facts, attributions, conflicts."),
    }),
  ),
});

const MapSchema = z.object({
  frames: z.array(
    z.object({
      label: z.string().describe("Short frame name, e.g. Economic, Conflict, Human Interest, Morality, Responsibility, Security."),
      weight: z.number().describe("Relative prominence 0-1."),
      description: z.string().describe("How this frame shows up in this text, one sentence."),
      claimIds: z.array(z.string()),
    }),
  ),
  perspectives: z.array(
    z.object({
      label: z.string().describe("Neutral name for the voice or viewpoint (who is speaking / what position)."),
      share: z.number().describe("Share of the text's statements voicing this perspective, 0-1."),
      description: z.string(),
      claimIds: z.array(z.string()),
    }),
  ),
});

const SynthSchema = z.object({
  headline: z.string().describe("Under 12 words. Calm, specific, no hype."),
  overview: z.string().describe("Three sentences maximum."),
  signals: z.array(
    z.object({
      label: z.string().describe("Under 8 words."),
      tone: z.enum(["truth", "bias", "neutral"]),
      detail: z.string().describe("One sentence."),
    }),
  ),
});

// ---------- System prompts ----------

const EXTRACTOR_SYSTEM = `You are the Extractor agent in TruthLens, a source-verification platform used by analysts.
Separate checkable factual claims from opinions in the document you are given.
- A claim is an atomic proposition that could in principle be checked against records: one fact per claim. Split compound sentences.
- An opinion is evaluative, predictive, normative or speculative language ("should", value judgements, characterisations).
- Skip filler, headings and questions that assert nothing.
- Record the source only when the text explicitly attributes the claim to someone.
- List emotive or loaded terms (words chosen for emotional effect rather than description) with every paragraph they appear in.
Use the [P#] paragraph indices exactly as given.`;

const VERIFIER_SYSTEM = `You are the Verifier agent in TruthLens. For each claim, assign exactly one verdict:
- "verified": consistent with well-established public knowledge you are confident about, or with a reliable named source in the text whose figure is plausible.
- "contradicted": conflicts with well-established knowledge or with another claim in the same document.
- "unverified": cannot be confirmed from established knowledge or the text (including anything after your knowledge cutoff, local events, or private data).
Prefer "unverified" over guessing. Confidence reflects how strongly the evidence supports the verdict, not how important the claim is.
Write the strongest honest counter-argument or missing context for every claim, even verified ones. Be concise.`;

const CARTOGRAPHER_SYSTEM = `You are the Cartographer agent in TruthLens. Map how the document frames its subject.
- frames: 3-6 framing patterns (e.g. Economic, Conflict, Human Interest, Morality, Responsibility, Security & Risk, Science & Health, Political Power). Assign each claim id to at most one frame.
- perspectives: 2-7 distinct voices or viewpoints represented, including the author's own voice. Describe positions neutrally and do not assign partisan labels unless the text itself uses them. Assign each claim id to the perspective that voices it.
Weights and shares are relative and should roughly sum to 1.`;

const SYNTH_SYSTEM = `You are the Synthesizer agent in TruthLens. Write the executive signal an analyst reads first.
Calm, precise, zero hype. Use the numbers you are given; never invent figures. 3-5 signals.
tone "truth" = evidence of reliable sourcing; "bias" = framing, emotional skew or contradictions worth attention; "neutral" = context.`;

// ---------- Engine ----------

export const claudeEngine: Engine = {
  id: "claude",

  async extract(paragraphs, log) {
    const chunks: { start: number; paras: string[] }[] = [];
    let cur: string[] = [];
    let start = 0;
    let words = 0;
    paragraphs.forEach((p, i) => {
      const w = countWords(p);
      if (cur.length && words + w > CHUNK_WORDS) {
        chunks.push({ start, paras: cur });
        cur = [];
        start = i;
        words = 0;
      }
      cur.push(p);
      words += w;
    });
    if (cur.length) chunks.push({ start, paras: cur });
    log("extractor", "info", `Dispatching ${chunks.length} extraction worker${chunks.length > 1 ? "s" : ""} on ${MODEL}.`);

    const results = await pMap(chunks, CONCURRENCY, async (chunk, i) => {
      const r = await runAgent({
        agent: "extractor",
        system: EXTRACTOR_SYSTEM,
        task: `Document section ${i + 1} of ${chunks.length}:\n\n${numbered(chunk.paras, chunk.start)}`,
        schema: ExtractSchema,
        effort: "medium",
      });
      log("extractor", "info", `Worker ${i + 1}/${chunks.length}: ${r.claims.length} claims, ${r.opinions.length} opinions.`);
      return r;
    });

    const maxP = paragraphs.length - 1;
    const claims: RawClaim[] = [];
    const opinions: Extraction["opinions"] = [];
    const emo = new Map<string, Extraction["emotionalTerms"][number]>();
    for (const r of results) {
      for (const c of r.claims) claims.push({ id: `c${claims.length + 1}`, text: c.text, paragraph: clamp(c.paragraph, 0, maxP), source: c.source || null });
      for (const o of r.opinions) opinions.push({ id: `o${opinions.length + 1}`, text: o.text, paragraph: clamp(o.paragraph, 0, maxP), markers: o.markers.slice(0, 4) });
      for (const e of r.emotional) {
        const key = e.term.toLowerCase();
        const paras = e.paragraphs.map((p) => clamp(p, 0, maxP));
        const prev = emo.get(key);
        if (prev) {
          prev.count += paras.length || 1;
          prev.paragraphs.push(...paras);
        } else {
          emo.set(key, {
            id: `emo-${slug(key)}`,
            term: e.term,
            valence: clamp(e.valence, -1, 1),
            intensity: clamp(e.intensity, 0, 1),
            count: paras.length || 1,
            paragraphs: paras,
          });
        }
      }
    }
    const emotionalTerms = [...emo.values()].sort((a, b) => b.count * b.intensity - a.count * a.intensity);
    const sentences = paragraphs.reduce((n, p) => n + (p.match(/[.!?](\s|$)/g)?.length ?? 1), 0);
    log("extractor", "info", `Merged ${claims.length} claims, ${opinions.length} opinions, ${emotionalTerms.length} emotive terms.`);
    return { claims, opinions, emotionalTerms, sentences };
  },

  async verify(claims, paragraphs, log) {
    if (!claims.length) return [];
    const intro = paragraphs.slice(0, 12).join("\n\n").split(/\s+/).slice(0, 1500).join(" ");
    const allClaims = claims.length <= 300 ? claims.map((c) => `${c.id}: ${c.text}`).join("\n") : null;
    const shared =
      `Document opening (for context):\n${intro}\n\n` +
      (allClaims ? `All claims extracted from the document (use these to detect internal contradictions):\n${allClaims}` : "The document is long; judge each claim on its own merits and on the claims in your batch.");

    const batches: RawClaim[][] = [];
    for (let i = 0; i < claims.length; i += VERIFY_BATCH) batches.push(claims.slice(i, i + VERIFY_BATCH));
    log("verifier", "info", `Dispatching ${batches.length} verification batch${batches.length > 1 ? "es" : ""} (${claims.length} claims).`);

    const out = await pMap(batches, CONCURRENCY, async (batch, i) => {
      const r = await runAgent({
        agent: "verifier",
        system: VERIFIER_SYSTEM,
        shared,
        task: `Verify these claims. Return one verdict per id.\n\n${batch.map((c) => `${c.id}${c.source ? ` [attributed to ${c.source}]` : ""}: ${c.text}`).join("\n")}`,
        schema: VerifySchema,
        effort: "high",
      });
      log("verifier", "info", `Batch ${i + 1}/${batches.length} returned ${r.verdicts.length} verdicts.`);
      return r.verdicts;
    });

    const byId = new Map(out.flat().map((v) => [v.id, v]));
    const records: VerdictRecord[] = [];
    let missing = 0;
    for (const c of claims) {
      const v = byId.get(c.id);
      if (!v) {
        missing++;
        records.push({ id: c.id, verdict: "unverified", confidence: 40, rationale: "The verifier returned no verdict for this claim.", counterArgument: "Re-run verification or check manually.", evidence: [] });
        continue;
      }
      records.push({ ...v, confidence: clamp(Math.round(v.confidence), 0, 100) });
    }
    if (missing) log("verifier", "warn", `${missing} claims came back without a verdict and were marked unverified.`);
    return records;
  },

  async map(claims, _opinions, paragraphs, log) {
    const r = await runAgent({
      agent: "cartographer",
      system: CARTOGRAPHER_SYSTEM,
      task:
        `Document:\n\n${numbered(paragraphs)}\n\nClaim ids:\n` +
        claims.map((c) => `${c.id}: ${c.text.length > 160 ? `${c.text.slice(0, 159)}…` : c.text}`).join("\n"),
      schema: MapSchema,
      effort: "medium",
    });
    const fSum = r.frames.reduce((a, f) => a + Math.max(0, f.weight), 0) || 1;
    const pSum = r.perspectives.reduce((a, p) => a + Math.max(0, p.share), 0) || 1;
    const frames: Frame[] = r.frames
      .map((f) => ({ id: `f-${slug(f.label)}`, label: f.label, weight: Math.max(0, f.weight) / fSum, description: f.description }))
      .sort((a, b) => b.weight - a.weight);
    const perspectives: Perspective[] = r.perspectives
      .map((p) => ({ id: `p-${slug(p.label)}`, label: p.label, share: Math.max(0, p.share) / pSum, description: p.description }))
      .sort((a, b) => b.share - a.share);
    const valid = new Set(claims.map((c) => c.id));
    const claimFrame: Record<string, string | null> = {};
    const claimPerspective: Record<string, string | null> = {};
    r.frames.forEach((f) => f.claimIds.forEach((id) => valid.has(id) && (claimFrame[id] ??= `f-${slug(f.label)}`)));
    r.perspectives.forEach((p) => p.claimIds.forEach((id) => valid.has(id) && (claimPerspective[id] ??= `p-${slug(p.label)}`)));
    log("cartographer", "info", `Mapped ${frames.length} frames and ${perspectives.length} perspectives.`);
    return { frames, perspectives, claimFrame, claimPerspective } satisfies Cartography;
  },

  async synthesize(input, log) {
    const r = await runAgent({
      agent: "synthesizer",
      system: SYNTH_SYSTEM,
      task: `Audit data (JSON):\n${JSON.stringify(input, null, 1)}`,
      schema: SynthSchema,
      effort: "low",
      maxTokens: 4_000,
    });
    log("synthesizer", "info", `Composed executive signal: “${r.headline}”.`);
    return { headline: r.headline, overview: r.overview, signals: r.signals.slice(0, 5) } satisfies Synthesis;
  },
};

export function claudeAvailable(): boolean {
  const mode = process.env.TRUTHLENS_ENGINE ?? "auto";
  if (mode === "heuristic") return false;
  if (mode === "claude") return true;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

export const CLAUDE_MODEL = MODEL;
