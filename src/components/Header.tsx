"use client";

import { Check, Download, FileJson, FileText, History, Link2, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AgentId, AuditRecord, StageStatus } from "@/lib/types";
import { AGENTS } from "@/lib/types";
import { download, toMarkdown } from "@/lib/report";
import { fmtMs } from "@/lib/text";

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="11" fill="none" stroke="#00F0FF" strokeWidth="2.5" />
        <circle cx="16" cy="16" r="5.5" fill="none" stroke="#00F0FF" strokeOpacity="0.35" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="2.6" fill="#FFB800" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-ice">
        TruthLens <span className="font-normal text-mute">OS</span>
      </span>
    </div>
  );
}

function AgentStatus({
  running,
  stages,
  engine,
  audit,
}: {
  running: boolean;
  stages: Record<AgentId, StageStatus>;
  engine: { engine: string; model: string | null } | null;
  audit: AuditRecord | null;
}) {
  const active = AGENTS.find((a) => stages[a.id] === "running");
  const done = AGENTS.filter((a) => stages[a.id] === "done" || stages[a.id] === "warn").length;
  let dot = "bg-mute";
  let label: React.ReactNode = "Connecting…";
  if (running) {
    dot = "bg-cyan pulse-dot";
    label = (
      <>
        <span className="text-ice">{active?.label ?? "Orchestrator"}</span>
        <span className="hidden text-mute sm:inline"> · {active?.role.toLowerCase() ?? "starting"}</span>
        <span className="tnum ml-2 text-mute">{done}/{AGENTS.length}</span>
      </>
    );
  } else if (engine) {
    dot = engine.engine === "claude" ? "bg-cyan" : "bg-amber";
    label = (
      <>
        <span className="text-ice">{engine.engine === "claude" ? "Claude agents ready" : "Offline engine ready"}</span>
        <span className="hidden text-mute md:inline">
          {" "}· {engine.model ?? "heuristic, no API key"}
          {audit ? ` · last run ${fmtMs(audit.durationMs)}` : ""}
        </span>
      </>
    );
  }
  return (
    <div role="status" aria-live="polite" className="flex h-8 min-w-0 items-center gap-2 rounded-full border border-line-soft bg-slate/60 px-3 text-xs">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{label}</span>
    </div>
  );
}

function ExportMenu({ audit }: { audit: AuditRecord | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const base = audit ? `truthlens-${audit.id.slice(-8)}` : "truthlens";
  const items = [
    { icon: FileText, label: "Markdown report", run: () => audit && download(`${base}.md`, toMarkdown(audit), "text/markdown") },
    { icon: FileJson, label: "Raw JSON", run: () => audit && download(`${base}.json`, JSON.stringify(audit, null, 2), "application/json") },
    {
      icon: copied ? Check : Link2,
      label: copied ? "Link copied" : "Copy share link",
      run: async () => {
        if (!audit) return;
        await navigator.clipboard.writeText(`${location.origin}/?audit=${audit.id}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      keepOpen: true,
    },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={!audit}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-ice/90 ring-1 ring-line transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Share2 size={15} aria-hidden />
        <span className="hidden sm:inline">Export</span>
      </button>
      <div
        role="menu"
        className={`glass absolute right-0 top-11 z-40 w-52 origin-top-right rounded-xl p-1.5 shadow-2xl shadow-black/40 transition-[opacity,transform] duration-150 ${
          open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        }`}
      >
        {items.map((it) => (
          <button
            key={it.label}
            role="menuitem"
            type="button"
            onClick={() => {
              void it.run();
              if (!it.keepOpen) setOpen(false);
            }}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-silver hover:bg-white/[0.05] hover:text-ice"
          >
            <it.icon size={15} aria-hidden />
            {it.label}
            {!it.keepOpen && <Download size={13} className="ml-auto text-mute" aria-hidden />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Header(props: {
  running: boolean;
  stages: Record<AgentId, StageStatus>;
  engine: { engine: string; model: string | null } | null;
  audit: AuditRecord | null;
  onHistory: () => void;
}) {
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-4 border-b border-line-soft px-4 sm:px-6">
      <Logo />
      <div className="flex min-w-0 flex-1 justify-center">
        <AgentStatus running={props.running} stages={props.stages} engine={props.engine} audit={props.audit} />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={props.onHistory}
          className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-silver transition-colors hover:bg-white/[0.04] hover:text-ice"
        >
          <History size={15} aria-hidden />
          <span className="hidden sm:inline">History</span>
        </button>
        <ExportMenu audit={props.audit} />
      </div>
    </header>
  );
}
