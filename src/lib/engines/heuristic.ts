// Offline, deterministic engine. It never claims to have checked a fact against the
// outside world: "verified" here means "attributed to a named source with specific detail",
// and every rationale says so. Used when no Claude credentials are configured, and as the
// per-stage fallback when a Claude call fails.

import type { EmotionalTerm, Frame, Opinion, Perspective, Signal, Verdict } from "../types";
import { clamp, keywords, slug, splitSentences, tokenize } from "../text";
import type { Cartography, Engine, Extraction, RawClaim, Synthesis, SynthesisInput, VerdictRecord } from "./contract";
import {
  ABSOLUTES, ATTRIBUTION_PATTERNS, CAUSAL, EMOTIVE, FACTUAL_VERBS, FRAMES, HEDGES, OPINION_MARKERS, QUANT, SOURCE_NOUNS,
} from "./lexicon";

const has = (s: string, phrase: string) => new RegExp(`(^|[^a-z'])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z']|$)`, "i").test(s);
const findAll = (s: string, list: string[]) => list.filter((p) => has(s, p));

const SOURCE_STOP = new Set(["The", "A", "An", "In", "On", "But", "And", "However", "This", "That", "It", "He", "She", "They", "We", "I", "Officials", "Critics", "Experts"]);

const INSTITUTION = "office|authority|department|ministry|agency|council|commission|bureau|institute|group|association|board|court|police|government|administration|spokesperson|spokesman|spokeswoman|committee|campaign|company|firm|union";
const LOWER_SOURCE = new RegExp(
  `\\b(the [a-z][\\w'-]*(?: [a-z][\\w'-]*){0,3} (?:${INSTITUTION}))\\b,? (?:said|says|estimated|estimates|reported|stated|announced|confirmed|found|projected|projects|warned|noted|wrote)`,
  "i",
);
const ACCORDING_TO = /according to (?:the |a |an )?([a-z][\w.&' -]{2,60}?)(?=,|\.|;| that | which |$)/i;

const tidySource = (raw: string) => {
  const words = raw.trim().replace(/[,.;:]+$/, "").replace(/^the\s+/i, "").split(/\s+/).filter((w) => !SOURCE_STOP.has(w)).slice(0, 6);
  const name = words.join(" ");
  return name.length >= 2 ? name.replace(/^./, (c) => c.toUpperCase()) : null;
};

export function detectSource(sentence: string): string | null {
  for (const re of ATTRIBUTION_PATTERNS) {
    const m = sentence.match(re);
    if (!m) continue;
    const name = tidySource(m[1]);
    if (name && /[A-Z]/.test(m[1].trim()[0] ?? "")) return name;
  }
  const inst = sentence.match(LOWER_SOURCE);
  if (inst) return tidySource(inst[1]);
  const acc = sentence.match(ACCORDING_TO);
  if (acc) return tidySource(acc[1]);
  if (/\b(officials|critics|experts|analysts|researchers|scientists)\b (said|say|warned|argue|found)/i.test(sentence)) {
    return sentence.match(/\b(officials|critics|experts|analysts|researchers|scientists)\b/i)![1].replace(/^./, (c) => c.toUpperCase());
  }
  return null;
}

/** For quoted speech, judge the quote itself — attribution says who spoke, not that it's factual. */
function quoteContent(s: string): string | null {
  const t = s.trim();
  const lead = t.match(/^[“"]([^”"]{8,})[”"],?\s+/);
  if (lead) return lead[1];
  const trail = t.match(/[,:]\s*[“"]([^”"]{8,})[”"]\.?$/);
  return trail ? trail[1] : null;
}

function scoreSentence(s: string) {
  let claim = 0;
  let opinion = 0;
  const source = detectSource(s);
  const quote = quoteContent(s);
  const body = quote ?? s;
  const words = body.split(/\s+/).length;
  const quant = QUANT.test(body);
  if (quant) claim += 2;
  if (source && !quote) claim += 2;
  if (SOURCE_NOUNS.test(body)) claim += 1;
  if (FACTUAL_VERBS.test(body)) claim += 1;
  if (/\s[A-Z][a-z]+/.test(body.slice(1))) claim += 0.5;
  if (body.trim().endsWith("?")) claim -= 2;
  if (words < 5) claim -= 1;

  const markers = findAll(body, OPINION_MARKERS);
  const superlative = body.match(/\bthe (most|least) [a-z]+/i);
  if (superlative) markers.push(superlative[0].toLowerCase());
  opinion += markers.length * 1.5;
  if (quote) opinion += 0.5;
  if (body.includes("!")) opinion += 1;
  if (/^(i|we)\s/i.test(body.trim()) && !source) opinion += 1;
  if (body.trim().endsWith("?")) opinion += 1;
  for (const t of tokenize(body)) {
    const hit = matchEmotive(t);
    if (!hit) continue;
    const intensity = EMOTIVE[hit][1];
    opinion += intensity >= 0.6 ? 0.75 : intensity >= 0.4 ? 0.4 : 0;
    if (intensity >= 0.4 && !markers.includes(t)) markers.push(t);
  }
  return { claim, opinion, markers, source };
}

/** Split compound sentences into atomic propositions when both halves stand on their own. */
function atomize(sentence: string): string[] {
  const parts = sentence.split(/;\s+|\s+—\s+|,\s+(?:while|whereas|but)\s+/);
  if (parts.length === 1) return [sentence];
  const ok = parts.every((p) => p.split(/\s+/).length >= 5 && FACTUAL_VERBS.test(p));
  return ok ? parts.map((p) => p.trim().replace(/^[a-z]/, (c) => c.toUpperCase()).replace(/[^.!?]$/, "$&.")) : [sentence];
}

const emotiveKeys = Object.keys(EMOTIVE).sort((a, b) => b.length - a.length);
export function matchEmotive(token: string): string | null {
  for (const k of emotiveKeys) {
    if (k.length <= 4) {
      const dbl = k + k.slice(-1);
      if (token === k || token === `${k}s` || token === `${k}d` || token === `${k}ing` || token === `${k}ed` || token === `${dbl}ed` || token === `${dbl}ing`) return k;
    } else if (token.startsWith(k) && token.length <= k.length + 4) {
      return k;
    }
  }
  return null;
}

export function scanEmotive(paragraphs: string[]): EmotionalTerm[] {
  type Acc = { forms: Map<string, number>; count: number; paragraphs: number[] };
  const acc = new Map<string, Acc>();
  paragraphs.forEach((p, pi) => {
    for (const tok of tokenize(p)) {
      const k = matchEmotive(tok);
      if (!k) continue;
      const e: Acc = acc.get(k) ?? { forms: new Map<string, number>(), count: 0, paragraphs: [] };
      e.count++;
      e.paragraphs.push(pi);
      e.forms.set(tok, (e.forms.get(tok) ?? 0) + 1);
      acc.set(k, e);
    }
  });
  return [...acc.entries()]
    .map(([k, e]) => {
      const term = [...e.forms.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const [valence, intensity] = EMOTIVE[k];
      return { id: `emo-${slug(k)}`, term, valence, intensity, count: e.count, paragraphs: e.paragraphs };
    })
    .sort((a, b) => b.count * b.intensity - a.count * a.intensity);
}

const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w);
const stemSet = (s: string) => new Set(keywords(s).map(stem));

interface Quantity { value: number; next: string }
function numbersOf(s: string): { quantities: Quantity[]; years: string[]; unit: string } {
  const years = (s.match(/\b(19|20)\d\d\b/g) ?? []).sort();
  const quantities: Quantity[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(%|[a-z]+)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (/^(19|20)\d\d$/.test(m[1])) continue;
    quantities.push({ value: parseFloat(m[1].replace(/,/g, "")), next: (m[2] ?? "").toLowerCase().replace(/^percent$/, "%") });
  }
  const unit = /%|percent/i.test(s) ? "pct" : /[$€£]|dollar|euro|pound/i.test(s) ? "money" : "count";
  return { quantities, years, unit };
}

/** Vote tallies such as "7 to 4", "7-4" or "6 votes in favor and 5 against". */
function tally(s: string): string | null {
  if (!/\bvot/i.test(s)) return null;
  const m = s.match(/\b(\d{1,3})\s*(?:to|-|–)\s*(\d{1,3})\b/) ?? s.match(/\b(\d{1,3}) votes? in favou?r and (\d{1,3}) (?:votes? )?against/i);
  return m ? `${m[1]}-${m[2]}` : null;
}

const NEG = /\b(not|no|never|none|neither|nor|without|denied|denies|false)\b|n't/i;

function findContradictions(claims: RawClaim[]): Map<string, { other: RawClaim; reason: string }> {
  const out = new Map<string, { other: RawClaim; reason: string }>();
  const kw = claims.map((c) => stemSet(c.text));
  const nums = claims.map((c) => numbersOf(c.text));
  const tallies = claims.map((c) => tally(c.text));
  const index = new Map<string, number[]>();
  kw.forEach((set, i) => set.forEach((w) => index.set(w, [...(index.get(w) ?? []), i])));
  const flag = (i: number, j: number, reason: string) => {
    if (!out.has(claims[i].id)) out.set(claims[i].id, { other: claims[j], reason });
    if (!out.has(claims[j].id)) out.set(claims[j].id, { other: claims[i], reason });
  };
  for (let i = 0; i < claims.length; i++) {
    const counts = new Map<number, number>();
    for (const w of kw[i]) for (const j of index.get(w) ?? []) if (j > i) counts.set(j, (counts.get(j) ?? 0) + 1);
    for (const [j, shared] of counts) {
      if (shared < 2) continue;
      const jac = shared / new Set([...kw[i], ...kw[j]]).size;
      const a = nums[i];
      const b = nums[j];
      if (tallies[i] && tallies[j] && tallies[i] !== tallies[j]) {
        flag(i, j, `Reports a different vote tally (${tallies[i]} vs ${tallies[j]}).`);
        continue;
      }
      const yearClash = a.years.length > 0 && b.years.length > 0 && a.years.join() !== b.years.join();
      if (yearClash || a.unit !== b.unit) continue;
      // Same measure: a shared word right after the number ("billion", "riders", "%") plus topical overlap.
      const pair = a.quantities.flatMap((qa) => b.quantities.filter((qb) => qb.next && qb.next === qa.next).map((qb) => [qa, qb] as const));
      const conflicting = pair.length > 0 && pair.every(([qa, qb]) => qa.value !== qb.value);
      if (conflicting && jac >= 0.12) {
        const [qa, qb] = pair[0];
        const fmt = (q: Quantity) => `${q.value.toLocaleString()}${q.next === "%" ? "%" : q.next ? ` ${q.next}` : ""}`;
        flag(i, j, `Reports a different figure (${fmt(qa)} vs ${fmt(qb)}) for what appears to be the same measure.`);
      } else if (jac >= 0.5 && NEG.test(claims[i].text) !== NEG.test(claims[j].text)) {
        flag(i, j, "Asserts the opposite of another statement in the same document.");
      }
    }
  }
  return out;
}

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const heuristicEngine: Engine = {
  id: "heuristic",

  async extract(paragraphs, log) {
    const claims: RawClaim[] = [];
    const opinions: Opinion[] = [];
    let sentences = 0;
    paragraphs.forEach((p, pi) => {
      for (const s of splitSentences(p)) {
        sentences++;
        const sc = scoreSentence(s);
        if (sc.claim >= 2 && sc.claim > sc.opinion) {
          for (const atom of atomize(s)) {
            claims.push({ id: `c${claims.length + 1}`, text: atom, paragraph: pi, source: detectSource(atom) ?? sc.source });
          }
        } else if (sc.opinion >= 1.5) {
          opinions.push({ id: `o${opinions.length + 1}`, text: s, paragraph: pi, markers: sc.markers.slice(0, 4) });
        }
      }
    });
    const emotionalTerms = scanEmotive(paragraphs);
    log("extractor", "info", `Scanned ${sentences} sentences across ${paragraphs.length} paragraphs.`);
    log("extractor", "info", `Isolated ${claims.length} atomic claims and ${opinions.length} opinion statements.`);
    log("extractor", "info", `Flagged ${emotionalTerms.reduce((n, t) => n + t.count, 0)} emotive term occurrences (${emotionalTerms.length} distinct).`);
    return { claims, opinions, emotionalTerms, sentences } satisfies Extraction;
  },

  async verify(claims, _paragraphs, log) {
    const contradictions = findContradictions(claims);
    const records: VerdictRecord[] = claims.map((c) => {
      const hedges = findAll(c.text, HEDGES);
      const absolutes = findAll(c.text, ABSOLUTES);
      const causal = findAll(c.text, CAUSAL);
      const quant = QUANT.test(c.text);
      const sourceNoun = SOURCE_NOUNS.test(c.text);
      const evidence: string[] = [];
      if (c.source) evidence.push(`Attributed to ${c.source}`);
      if (quant) evidence.push("Contains specific quantitative detail");
      if (sourceNoun) evidence.push("References a study, report or dataset");
      if (hedges.length) evidence.push(`Hedged: “${hedges.join("”, “")}”`);
      if (absolutes.length) evidence.push(`Absolute wording: “${absolutes.join("”, “")}”`);

      const conflict = contradictions.get(c.id);
      let verdict: Verdict;
      let confidence: number;
      let rationale: string;
      let counter: string;

      if (conflict) {
        verdict = "contradicted";
        confidence = 62 + (QUANT.test(conflict.other.text) ? 8 : 0);
        rationale = `${conflict.reason} Internal-consistency check only; no external source was consulted.`;
        counter = `Conflicts with ${conflict.other.id.toUpperCase()}: “${short(conflict.other.text)}”`;
        evidence.push(`Conflicting statement in paragraph ${conflict.other.paragraph + 1}`);
      } else if (c.source && (quant || sourceNoun)) {
        verdict = "verified";
        confidence = clamp(58 + (quant ? 8 : 0) + (sourceNoun ? 8 : 0) - hedges.length * 6 - absolutes.length * 5, 35, 82);
        rationale = `Source-attributed and specific, so it is checkable at the source. The offline engine traced attribution, not the underlying record.`;
        counter = `Confirm ${c.source} is the primary source and that the figure is quoted with its original scope and timeframe.`;
      } else {
        verdict = "unverified";
        confidence = clamp(60 + absolutes.length * 6 + (quant && !c.source ? 6 : 0) - hedges.length * 4, 40, 80);
        rationale = c.source
          ? `Attributed to ${c.source} but lacks specific, checkable detail.`
          : quant
            ? "States a specific figure without naming where it comes from."
            : "Presented as fact with no attribution or supporting detail in the text.";
        counter = absolutes.length
          ? `Absolute wording (“${absolutes[0]}”) means a single counterexample would falsify it.`
          : causal.length
            ? `Causal claim (“${causal[0]}”): alternative explanations and confounders are not ruled out.`
            : quant
              ? "Ask for the source, base period and denominator behind the number."
              : "Look for an independent, primary source before treating this as established.";
      }
      return { id: c.id, verdict, confidence: Math.round(confidence), rationale, counterArgument: counter, evidence };
    });
    const n = (v: Verdict) => records.filter((r) => r.verdict === v).length;
    log("verifier", "info", `Cross-referenced ${claims.length} claims against attribution and internal consistency.`);
    log("verifier", n("contradicted") ? "warn" : "info", `${n("verified")} source-attributed · ${n("unverified")} unverified · ${n("contradicted")} contradicted.`);
    log("verifier", "warn", "Offline engine: verdicts reflect attribution and consistency, not external fact-checking.");
    return records;
  },

  async map(claims, opinions, paragraphs, log) {
    // Frames: term hits across every sentence of the document.
    const totals = new Map<string, number>();
    const claimFrame: Record<string, string | null> = {};
    const frameHits = (s: string) => {
      const toks = tokenize(s);
      return FRAMES.map((f) => ({ id: f.id, hits: toks.filter((t) => f.terms.includes(t)).length }));
    };
    paragraphs.forEach((p) => frameHits(p).forEach((h) => totals.set(h.id, (totals.get(h.id) ?? 0) + h.hits)));
    const sum = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
    const frames: Frame[] = FRAMES.map((f) => ({ id: f.id, label: f.label, description: f.description, weight: (totals.get(f.id) ?? 0) / sum }))
      .filter((f) => f.weight >= 0.04)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6);
    const renorm = frames.reduce((a, f) => a + f.weight, 0) || 1;
    frames.forEach((f) => (f.weight = f.weight / renorm));
    const kept = new Set(frames.map((f) => f.id));
    for (const c of claims) {
      const own = frameHits(c.text);
      const ctx = frameHits(paragraphs[c.paragraph] ?? "");
      const best = own
        .map((h, i) => ({ id: h.id, score: h.hits + ctx[i].hits * 0.3 }))
        .filter((h) => kept.has(h.id) && h.score > 0)
        .sort((a, b) => b.score - a.score)[0];
      claimFrame[c.id] = best?.id ?? frames[0]?.id ?? null;
    }

    // Perspectives: group statements by attributed voice.
    const voice = new Map<string, { label: string; n: number; ids: string[] }>();
    const addVoice = (label: string, id: string) => {
      const key = label.toLowerCase();
      const existing = [...voice.keys()].find((k) => k === key || k.includes(key) || key.includes(k));
      const v = voice.get(existing ?? key) ?? { label, n: 0, ids: [] };
      v.n++;
      v.ids.push(id);
      voice.set(existing ?? key, v);
    };
    for (const c of claims) addVoice(c.source ?? "Author voice", c.id);
    for (const o of opinions) addVoice(detectSource(o.text) ?? "Author voice", o.id);
    const total = claims.length + opinions.length || 1;
    const ranked = [...voice.values()].sort((a, b) => b.n - a.n);
    const top = ranked.slice(0, 6);
    const rest = ranked.slice(6);
    const perspectives: Perspective[] = top.map((v) => ({
      id: `p-${slug(v.label)}`,
      label: v.label,
      share: v.n / total,
      description: v.label === "Author voice" ? "Statements made directly by the author without attribution." : `Statements attributed to ${v.label}.`,
    }));
    if (rest.length) {
      perspectives.push({ id: "p-other", label: "Other sources", share: rest.reduce((a, v) => a + v.n, 0) / total, description: `${rest.length} less-cited sources.` });
    }
    const claimPerspective: Record<string, string | null> = {};
    for (const c of claims) {
      const label = c.source ?? "Author voice";
      const p = perspectives.find((p) => p.label.toLowerCase() === label.toLowerCase() || label.toLowerCase().includes(p.label.toLowerCase()) || p.label.toLowerCase().includes(label.toLowerCase()));
      claimPerspective[c.id] = p?.id ?? (rest.length ? "p-other" : null);
    }

    log("cartographer", "info", `Detected ${frames.length} framing patterns; dominant: ${frames[0]?.label ?? "none"}.`);
    log("cartographer", "info", `Mapped ${perspectives.length} voices; ${Math.round((perspectives.find((p) => p.label === "Author voice")?.share ?? 0) * 100)}% of statements are unattributed.`);
    return { frames, perspectives, claimFrame, claimPerspective } satisfies Cartography;
  },

  async synthesize(input: SynthesisInput, log) {
    const { scores, stats, frames, perspectives } = input;
    const cred = scores.credibilityScore;
    const bias = scores.biasIndex;
    const credWord = cred >= 70 ? "Well-sourced" : cred >= 50 ? "Partly sourced" : "Weakly sourced";
    const biasWord = bias >= 60 ? "heavily framed" : bias >= 35 ? "moderately framed" : "even-toned";
    const headline = stats.claims === 0
      ? "Mostly opinion — few checkable claims found"
      : `${credWord}, ${biasWord} ${frames[0] ? `${frames[0].label.toLowerCase()} narrative` : "text"}`;

    const pct = (n: number) => `${Math.round(n * 100)}%`;
    const authorShare = perspectives.find((p) => p.label === "Author voice")?.share ?? 0;
    const overview =
      `${stats.claims} atomic claims and ${stats.opinions} opinion statements across ${stats.paragraphs} paragraphs. ` +
      `${stats.verdicts.verified} claims are tied to a named source with specific detail, ${stats.verdicts.unverified} rest on the author's word, ` +
      `and ${stats.verdicts.contradicted} conflict with other statements in the text. ` +
      (frames[0] ? `Framing leans ${frames[0].label.toLowerCase()} (${pct(frames[0].weight)} of framing signal). ` : "") +
      `Verdicts come from the offline engine and reflect attribution and internal consistency only.`;

    const signals: Signal[] = [];
    if (stats.claims) {
      signals.push({
        label: `${pct(stats.verdicts.verified / stats.claims)} source-attributed`,
        tone: stats.verdicts.verified / stats.claims >= 0.4 ? "truth" : "neutral",
        detail: "Share of claims that name a source and give checkable specifics.",
      });
    }
    if (stats.verdicts.contradicted) {
      signals.push({ label: `${stats.verdicts.contradicted} internal contradictions`, tone: "bias", detail: input.contradicted[0]?.counterArgument ?? "Statements in the text disagree with each other." });
    }
    if (frames[0]) signals.push({ label: `${frames[0].label} framing dominates`, tone: frames[0].weight > 0.4 ? "bias" : "neutral", detail: frames[0].description });
    if (input.topEmotional.length) {
      signals.push({
        label: `Loaded language: “${input.topEmotional.slice(0, 3).map((t) => t.term).join("”, “")}”`,
        tone: scores.emotionalIntensity >= 40 ? "bias" : "neutral",
        detail: input.peakParagraph != null ? `Emotional intensity peaks in paragraph ${input.peakParagraph + 1}.` : "Most frequent emotive terms.",
      });
    }
    signals.push({
      label: `${pct(authorShare)} unattributed`,
      tone: authorShare > 0.6 ? "bias" : "truth",
      detail: "Statements made in the author's own voice without a cited source.",
    });
    log("synthesizer", "info", `Composed executive signal: “${headline}”.`);
    return { headline, overview, signals: signals.slice(0, 5) } satisfies Synthesis;
  },
};
