"use client";

import {
  AlertTriangle, ArrowRight, CheckCircle2, Circle, FileUp, Globe, Loader2, Orbit, RotateCcw, ShieldCheck, Sparkles, Square,
  TableProperties, Type, XCircle,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { AgentId, AgentLog, AuditRecord, Signal, StageStatus } from "@/lib/types";
import { AGENTS, MAX_WORDS } from "@/lib/types";
import { SAMPLE_TEXT, SAMPLE_TITLE } from "@/lib/sample";
import type { RunRequest } from "./useAuditRun";
import { Button } from "./ui";

const countWords = (t: string) => t.trim().match(/\S+/g)?.length ?? 0;

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "running") return <Loader2 size={16} className="animate-spin text-cyan" aria-label="running" />;
  if (status === "done") return <CheckCircle2 size={16} className="text-cyan" aria-label="done" />;
  if (status === "warn") return <AlertTriangle size={16} className="text-amber" aria-label="fallback" />;
  if (status === "error") return <XCircle size={16} className="text-rose" aria-label="failed" />;
  return <Circle size={16} className="text-line" aria-label="pending" />;
}

function Pipeline({ stages, logs }: { stages: Record<AgentId, StageStatus>; logs: AgentLog[] }) {
  const last = logs[logs.length - 1];
  return (
    <div className="surface fade-in rounded-2xl p-5">
      <ol className="grid grid-cols-3 gap-y-4 sm:grid-cols-6">
        {AGENTS.map((a, i) => (
          <li key={a.id} className="relative flex flex-col items-center gap-2 text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute right-1/2 top-2 hidden h-px w-full -translate-x-3 sm:block ${stages[a.id] === "pending" ? "bg-line-soft" : "bg-cyan/40"}`}
              />
            )}
            <span className="relative z-10 bg-slate px-1">
              <StageIcon status={stages[a.id]} />
            </span>
            <span className={`text-xs ${stages[a.id] === "pending" ? "text-mute" : "text-ice"}`}>{a.label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-5 h-5 truncate font-mono text-xs text-mute" aria-live="polite">
        {last ? (
          <>
            <span className="text-silver">{last.agent}</span> › {last.message}
          </>
        ) : (
          "Starting agents…"
        )}
      </p>
    </div>
  );
}

function ScoreTile({ label, value, color, hint }: { label: string; value: number; color: string; hint: string }) {
  return (
    <div className="rounded-xl border border-line-soft bg-void/40 p-4" title={hint}>
      <div className="text-xs text-mute">{label}</div>
      <div className="tnum mt-1.5 text-3xl font-semibold tracking-tight text-ice">
        {value}
        <span className="ml-0.5 text-sm font-normal text-mute">/100</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-line-soft">
        <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${value}%`, background: color }} />
      </div>
      <div className="mt-2 text-[11px] leading-snug text-mute">{hint}</div>
    </div>
  );
}

const TONE: Record<Signal["tone"], { color: string; Icon: typeof ShieldCheck; label: string }> = {
  truth: { color: "text-cyan", Icon: ShieldCheck, label: "Truth signal" },
  bias: { color: "text-amber", Icon: AlertTriangle, label: "Bias warning" },
  neutral: { color: "text-silver", Icon: Sparkles, label: "Context" },
};

function ExecutiveSignals({ audit, onGo }: { audit: AuditRecord; onGo: (z: "map" | "audit") => void }) {
  const s = audit.result.summary;
  const st = audit.result.stats;
  return (
    <div className="fade-in space-y-4">
      <div className="surface rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
          <span className="uppercase tracking-[0.14em]">Executive signal</span>
          <span>·</span>
          <span className={audit.engine === "claude" ? "text-cyan" : "text-amber"}>
            {audit.engine === "claude" ? "Claude multi-agent" : audit.engine === "hybrid" ? "Claude + heuristic fallback" : "Offline heuristic engine"}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-semibold leading-snug tracking-tight text-ice sm:text-2xl">{s.headline}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-silver">{s.overview}</p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ScoreTile label="Credibility" value={s.credibilityScore} color="#00F0FF" hint="Share of claims that check out, minus contradictions." />
          <ScoreTile label="Bias index" value={s.biasIndex} color="#FFB800" hint="Emotive density, opinion share and framing concentration." />
          <ScoreTile label="Emotional intensity" value={s.emotionalIntensity} color="#FFB800" hint="Weighted loaded-language hits per 1,000 words." />
        </div>
      </div>

      <div className="surface rounded-2xl p-2">
        <ul>
          {s.signals.map((g, i) => {
            const t = TONE[g.tone];
            return (
              <li key={i} className="flex gap-3 rounded-xl px-4 py-3">
                <t.Icon size={17} className={`mt-0.5 shrink-0 ${t.color}`} aria-label={t.label} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ice">{g.label}</div>
                  <div className="mt-0.5 text-[13px] leading-relaxed text-silver">{g.detail}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => onGo("map")} className="surface group flex items-center gap-3 rounded-2xl p-4 text-left transition-colors hover:border-cyan/40">
          <Orbit size={20} className="text-cyan" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ice">Explore the bias constellation</div>
            <div className="text-xs text-mute">{audit.result.frames.length} frames · {audit.result.perspectives.length} voices · {audit.result.emotionalTerms.length} loaded terms</div>
          </div>
          <ArrowRight size={16} className="text-mute transition-transform group-hover:translate-x-0.5" aria-hidden />
        </button>
        <button type="button" onClick={() => onGo("audit")} className="surface group flex items-center gap-3 rounded-2xl p-4 text-left transition-colors hover:border-cyan/40">
          <TableProperties size={20} className="text-cyan" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ice">Review {st.claims} verified claims</div>
            <div className="tnum text-xs text-mute">
              {st.verdicts.verified} verified · {st.verdicts.unverified} unverified · {st.verdicts.contradicted} contradicted
            </div>
          </div>
          <ArrowRight size={16} className="text-mute transition-transform group-hover:translate-x-0.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function IngestionZone({
  audit,
  running,
  stages,
  logs,
  error,
  onRun,
  onCancel,
  onNew,
  onGo,
}: {
  audit: AuditRecord | null;
  running: boolean;
  stages: Record<AgentId, StageStatus>;
  logs: AgentLog[];
  error: string | null;
  onRun: (r: RunRequest) => void;
  onCancel: () => void;
  onNew: () => void;
  onGo: (z: "map" | "audit") => void;
}) {
  const [mode, setMode] = useState<"text" | "url">("text");
  const [text, setText] = useState("");
  const [title, setTitle] = useState<string | undefined>();
  const [fromFile, setFromFile] = useState(false);
  const [url, setUrl] = useState("");
  const [drag, setDrag] = useState(false);
  const [composing, setComposing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const words = useMemo(() => countWords(text), [text]);
  const over = words > MAX_WORDS;

  const showInput = !audit || composing;
  const canRun = !running && (mode === "url" ? /^https?:\/\/\S+\.\S+/.test(url.trim()) : words >= 20 && !over);

  const loadFile = useCallback(async (f: File) => {
    if (f.size > 6 * 1024 * 1024) return;
    const raw = await f.text();
    setMode("text");
    setText(raw);
    setTitle(f.name.replace(/\.[a-z0-9]+$/i, ""));
    setFromFile(true);
  }, []);

  const submit = () => {
    if (!canRun) return;
    setComposing(false);
    onRun(mode === "url" ? { mode: "url", url: url.trim() } : { mode: fromFile ? "file" : "text", text, title });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {showInput ? (
          <div className="fade-in">
            <h1 className="text-2xl font-semibold tracking-tight text-ice">What should we verify?</h1>
            <p className="mt-1.5 text-sm text-silver">Paste an article, report or transcript — or point at a URL. Up to 50,000 words.</p>

            <div className="mt-6 inline-flex rounded-lg border border-line-soft bg-slate/60 p-1" role="radiogroup" aria-label="Input type">
              {(
                [
                  ["text", "Text", Type],
                  ["url", "URL", Globe],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={mode === id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors ${mode === id ? "bg-white/[0.07] text-ice" : "text-mute hover:text-silver"}`}
                >
                  <Icon size={14} aria-hidden />
                  {label}
                </button>
              ))}
            </div>

            {mode === "text" ? (
              <div
                className={`relative mt-4 rounded-2xl border transition-colors ${drag ? "border-cyan/60 bg-cyan/[0.03]" : "border-line bg-slate/50 focus-within:border-line"}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void loadFile(f);
                }}
              >
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (!e.target.value) {
                      setTitle(undefined);
                      setFromFile(false);
                    }
                  }}
                  onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit()}
                  placeholder="Paste text here, or drop a .txt / .md / .html file…"
                  aria-label="Document text"
                  spellCheck={false}
                  className="block h-[38vh] min-h-56 w-full resize-none rounded-2xl bg-transparent p-5 text-[15px] leading-relaxed text-ice placeholder:text-mute focus:outline-none"
                />
                <div className="flex h-12 items-center gap-1 border-t border-line-soft px-3">
                  <Button onClick={() => fileRef.current?.click()} className="h-8 px-2.5 text-xs">
                    <FileUp size={14} aria-hidden /> File
                  </Button>
                  <Button
                    onClick={() => {
                      setText(SAMPLE_TEXT);
                      setTitle(SAMPLE_TITLE);
                      setFromFile(false);
                    }}
                    className="h-8 px-2.5 text-xs"
                  >
                    <Sparkles size={14} aria-hidden /> Load sample
                  </Button>
                  <span className={`tnum ml-auto text-xs ${over ? "text-rose" : "text-mute"}`}>
                    {words.toLocaleString()} / {MAX_WORDS.toLocaleString()} words
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void loadFile(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-line bg-slate/50 p-2">
                <div className="flex items-center gap-2">
                  <Globe size={16} className="ml-3 shrink-0 text-mute" aria-hidden />
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="https://example.com/article"
                    aria-label="Article URL"
                    inputMode="url"
                    className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ice placeholder:text-mute focus:outline-none"
                  />
                </div>
                <p className="px-3 pb-2 pt-1 text-xs text-mute">The scraper strips navigation, ads and scripts, then keeps the article body.</p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {running ? (
                <Button variant="outline" onClick={onCancel}>
                  <Square size={14} aria-hidden /> Stop
                </Button>
              ) : (
                <Button variant="primary" onClick={submit} disabled={!canRun} className="h-10 px-5">
                  Run verification <ArrowRight size={16} aria-hidden />
                </Button>
              )}
              {audit && !running && (
                <Button onClick={() => setComposing(false)}>Back to results</Button>
              )}
              <span className="hidden text-xs text-mute sm:inline">⌘/Ctrl + Enter</span>
            </div>
          </div>
        ) : (
          <div className="surface fade-in mb-4 flex items-center gap-3 rounded-2xl px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ice">{audit.title}</div>
              <div className="tnum truncate text-xs text-mute">
                {audit.sourceUrl ?? (audit.sourceType === "file" ? "Uploaded file" : "Pasted text")} · {audit.wordCount.toLocaleString()} words ·{" "}
                {new Date(audit.createdAt).toLocaleString()}
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setComposing(true);
                onNew();
              }}
              disabled={running}
            >
              <RotateCcw size={14} aria-hidden /> New audit
            </Button>
          </div>
        )}

        {(running || error) && (
          <div className="mt-6 space-y-3">
            {running && <Pipeline stages={stages} logs={logs} />}
            {error && (
              <div role="alert" className="fade-in flex items-start gap-2.5 rounded-xl border border-rose/30 bg-rose/[0.06] px-4 py-3 text-sm text-rose">
                <XCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> {error}
              </div>
            )}
          </div>
        )}

        {audit && !showInput && !running && <ExecutiveSignals audit={audit} onGo={onGo} />}
      </div>
    </div>
  );
}
