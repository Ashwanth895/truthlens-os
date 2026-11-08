"use client";

import { FileInput, Orbit, TableProperties } from "lucide-react";
import { useRef } from "react";

export type ZoneId = "ingest" | "map" | "audit";

const TABS: { id: ZoneId; n: number; label: string; Icon: typeof FileInput }[] = [
  { id: "ingest", n: 1, label: "Ingestion", Icon: FileInput },
  { id: "map", n: 2, label: "Constellation Map", Icon: Orbit },
  { id: "audit", n: 3, label: "Audit Logs & Data", Icon: TableProperties },
];

export function Tabs({ active, onChange, badges }: { active: ZoneId; onChange: (z: ZoneId) => void; badges: Partial<Record<ZoneId, string>> }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = TABS.findIndex((t) => t.id === active);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (idx + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    onChange(TABS[next].id);
    refs.current[next]?.focus();
  };

  return (
    <nav className="relative z-20 shrink-0 border-b border-line-soft px-4 sm:px-6">
      <div role="tablist" aria-label="Focus zones" onKeyDown={onKey} className="relative grid h-12 max-w-3xl grid-cols-3">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-controls={`zone-${t.id}`}
            aria-selected={active === t.id}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`flex min-w-0 items-center justify-center gap-2 text-sm transition-colors sm:justify-start sm:px-3 ${
              active === t.id ? "text-ice" : "text-mute hover:text-silver"
            }`}
          >
            <t.Icon size={16} aria-hidden className={active === t.id ? "text-cyan" : ""} />
            <span className="truncate">
              <span className="tnum mr-1 hidden text-mute sm:inline">{t.n}.</span>
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(" ")[0]}</span>
            </span>
            {badges[t.id] && <span className="tnum hidden rounded-full bg-white/[0.06] px-1.5 text-[11px] text-silver md:inline">{badges[t.id]}</span>}
          </button>
        ))}
        {/* Sliding indicator: transform-only for 60fps */}
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-[2px] w-1/3 rounded-full bg-cyan transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translate3d(${idx * 100}%,0,0)`, boxShadow: "0 0 12px rgb(0 240 255 / 0.6)" }}
        />
      </div>
    </nav>
  );
}
