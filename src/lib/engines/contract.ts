import type { AgentId, EmotionalTerm, Frame, LogLevel, Opinion, Perspective, Signal, Verdict } from "../types";

export interface RawClaim {
  id: string;
  text: string;
  paragraph: number;
  source?: string | null; // attributed source detected during extraction
}

export interface Extraction {
  claims: RawClaim[];
  opinions: Opinion[];
  emotionalTerms: EmotionalTerm[];
  sentences: number;
}

export interface VerdictRecord {
  id: string;
  verdict: Verdict;
  confidence: number;
  rationale: string;
  counterArgument: string;
  evidence: string[];
}

export interface Cartography {
  frames: Frame[];
  perspectives: Perspective[];
  claimFrame: Record<string, string | null>;
  claimPerspective: Record<string, string | null>;
}

export interface SynthesisInput {
  title: string;
  stats: { words: number; paragraphs: number; claims: number; opinions: number; verdicts: Record<Verdict, number> };
  scores: { credibilityScore: number; biasIndex: number; emotionalIntensity: number };
  frames: Frame[];
  perspectives: Perspective[];
  topEmotional: EmotionalTerm[];
  contradicted: { text: string; counterArgument: string }[];
  sampleClaims: { text: string; verdict: Verdict }[];
  peakParagraph: number | null;
}

export interface Synthesis {
  headline: string;
  overview: string;
  signals: Signal[];
}

export type Logger = (agent: AgentId, level: LogLevel, message: string) => void;

export interface Engine {
  id: "claude" | "heuristic";
  extract(paragraphs: string[], log: Logger): Promise<Extraction>;
  verify(claims: RawClaim[], paragraphs: string[], log: Logger): Promise<VerdictRecord[]>;
  map(claims: RawClaim[], opinions: Opinion[], paragraphs: string[], log: Logger): Promise<Cartography>;
  synthesize(input: SynthesisInput, log: Logger): Promise<Synthesis>;
}
