// Shared domain types for TruthLens OS. Used on both server and client.

export type Verdict = "verified" | "unverified" | "contradicted";
export type EngineId = "claude" | "heuristic" | "hybrid";
export type SignalTone = "truth" | "bias" | "neutral";

export interface Claim {
  id: string;
  text: string;
  paragraph: number;
  verdict: Verdict;
  confidence: number; // 0–100
  rationale: string;
  counterArgument: string;
  evidence: string[];
  frameId: string | null;
  perspectiveId: string | null;
}

export interface Opinion {
  id: string;
  text: string;
  paragraph: number;
  markers: string[];
}

export interface Frame {
  id: string;
  label: string;
  weight: number; // 0–1 share of framing signal
  description: string;
}

export interface Perspective {
  id: string;
  label: string;
  share: number; // 0–1 share of attributed voice
  description: string;
}

export interface EmotionalTerm {
  id: string;
  term: string;
  valence: number; // -1..1
  intensity: number; // 0..1
  count: number;
  paragraphs: number[];
}

export interface SentimentPoint {
  paragraph: number;
  sentiment: number; // -1..1
  intensity: number; // 0..1
}

export interface Signal {
  label: string;
  tone: SignalTone;
  detail: string;
}

export interface AuditSummary {
  headline: string;
  overview: string;
  credibilityScore: number; // 0–100, higher = more verifiable
  biasIndex: number; // 0–100, higher = more skewed framing
  emotionalIntensity: number; // 0–100
  dominantFrame: string;
  signals: Signal[];
}

export interface AuditStats {
  words: number;
  paragraphs: number;
  sentences: number;
  claims: number;
  opinions: number;
  verdicts: Record<Verdict, number>;
}

export interface AuditResult {
  summary: AuditSummary;
  claims: Claim[];
  opinions: Opinion[];
  frames: Frame[];
  perspectives: Perspective[];
  emotionalTerms: EmotionalTerm[];
  sentiment: SentimentPoint[];
  stats: AuditStats;
}

export type LogLevel = "info" | "warn" | "error" | "done";

export interface AgentLog {
  t: number; // ms since run start
  agent: AgentId;
  level: LogLevel;
  message: string;
}

export type AgentId = "ingest" | "extractor" | "verifier" | "cartographer" | "synthesizer" | "archivist";

export const AGENTS: { id: AgentId; label: string; role: string }[] = [
  { id: "ingest", label: "Ingest", role: "Cleans markup and structures paragraphs" },
  { id: "extractor", label: "Extractor", role: "Splits atomic claims from opinions" },
  { id: "verifier", label: "Verifier", role: "Scores each claim and drafts counter-arguments" },
  { id: "cartographer", label: "Cartographer", role: "Maps framing, voices and emotional language" },
  { id: "synthesizer", label: "Synthesizer", role: "Writes the executive signal" },
  { id: "archivist", label: "Archivist", role: "Persists the audit report" },
];

export interface AuditRecord {
  id: string;
  createdAt: string;
  title: string;
  sourceType: "text" | "url" | "file";
  sourceUrl: string | null;
  wordCount: number;
  engine: EngineId;
  durationMs: number;
  input: string;
  result: AuditResult;
  logs: AgentLog[];
}

export interface AuditListItem {
  id: string;
  createdAt: string;
  title: string;
  sourceType: string;
  wordCount: number;
  engine: EngineId;
  credibility: number;
  biasIndex: number;
}

export type StageStatus = "pending" | "running" | "done" | "warn" | "error";

export type RunEvent =
  | { type: "stage"; agent: AgentId; status: StageStatus; detail?: string }
  | { type: "log"; log: AgentLog }
  | { type: "result"; audit: AuditRecord }
  | { type: "error"; message: string };

export const MAX_WORDS = 50_000;
