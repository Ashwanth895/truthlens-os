// Deterministic scoring shared by every engine, so scores stay comparable across runs.

import type { Claim, EmotionalTerm, Frame, Opinion, Perspective, SentimentPoint } from "./types";
import { clamp, countWords } from "./text";

/** Normalised Herfindahl concentration: 0 = evenly spread, 1 = a single category. */
function concentration(shares: number[]): number {
  const s = shares.filter((x) => x > 0);
  if (s.length <= 1) return s.length ? 1 : 0;
  const hhi = s.reduce((a, x) => a + x * x, 0);
  return clamp((hhi - 1 / s.length) / (1 - 1 / s.length), 0, 1);
}

export function computeScores(args: {
  claims: Claim[];
  opinions: Opinion[];
  emotionalTerms: EmotionalTerm[];
  frames: Frame[];
  perspectives: Perspective[];
  words: number;
}) {
  const { claims, opinions, emotionalTerms, frames, perspectives, words } = args;
  const n = claims.length;
  const verified = claims.filter((c) => c.verdict === "verified").length;
  const contradicted = claims.filter((c) => c.verdict === "contradicted").length;
  const opinionRatio = n + opinions.length ? opinions.length / (n + opinions.length) : 0;

  const credibilityScore = n
    ? Math.round(clamp(50 + 45 * (verified / n) - 60 * (contradicted / n) - 15 * opinionRatio, 0, 100))
    : 35;

  const weightedHits = emotionalTerms.reduce((a, t) => a + t.count * t.intensity, 0);
  const per1k = words ? (weightedHits / words) * 1000 : 0;
  const emotionalIntensity = Math.round(clamp(per1k * 3, 0, 100));

  const frameConc = concentration(frames.map((f) => f.weight));
  const voiceConc = concentration(perspectives.map((p) => p.share));
  const biasIndex = Math.round(
    clamp(0.35 * emotionalIntensity + 30 * opinionRatio + 20 * frameConc + 15 * voiceConc, 0, 100),
  );
  return { credibilityScore, biasIndex, emotionalIntensity };
}

/** Per-paragraph sentiment derived from emotive term occurrences. */
export function sentimentSeries(paragraphs: string[], terms: EmotionalTerm[]): SentimentPoint[] {
  const sums = paragraphs.map(() => ({ v: 0, a: 0 }));
  for (const t of terms) {
    for (const p of t.paragraphs) {
      if (!sums[p]) continue;
      sums[p].v += t.valence * t.intensity;
      sums[p].a += t.intensity;
    }
  }
  return paragraphs.map((text, i) => {
    const w = Math.max(countWords(text), 1);
    const scale = Math.sqrt(w / 25);
    return {
      paragraph: i,
      sentiment: Math.round(Math.tanh(sums[i].v / scale) * 100) / 100,
      intensity: Math.round(clamp(sums[i].a / scale / 2, 0, 1) * 100) / 100,
    };
  });
}

export function peakParagraph(series: SentimentPoint[]): number | null {
  let best: SentimentPoint | null = null;
  for (const p of series) if (p.intensity > 0 && (!best || p.intensity > best.intensity)) best = p;
  return best?.paragraph ?? null;
}
