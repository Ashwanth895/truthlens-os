"use client";

import { FileText, ScrollText, Search, TableProperties, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentLog, AuditRecord, Claim, Opinion, Verdict } from "@/lib/types";
import { AGENTS } from "@/lib/types";
import { fmtMs, toParagraphs } from "@/lib/text";
import { Chip, Collapsible, ConfidenceBar, EmptyState, VERDICT, VerdictBadge } from "./ui";

const ROW = 60;
const OVERSCAN = 8;

/** Fixed-row-height virtual list: only visible rows are in the DOM, rows are positioned with transforms. */
function VirtualRows<T>({
  items,
  render,
  scrollToIndex,
  empty,
}: {
  items: T[];
  render: (item: T, index: number) => React.ReactNode;
  scrollToIndex: { index: number; n: number } | null;
  empty: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const raf = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setHeight(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset on new data first, then honour an explicit scroll request (effects run in order).
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [items]);

  useEffect(() => {
    const el = ref.current;
    if (el && scrollToIndex && scrollToIndex.index >= 0) {
      el.scrollTo({ top: Math.max(0, scrollToIndex.index * ROW - el.clientHeight / 3) });
    }
  }, [scrollToIndex]);

  const onScroll = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setScrollTop(ref.current?.scrollTop ?? 0);
    });
  };

  const start = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / ROW) + OVERSCAN);
  const slice = [];
  for (let i = start; i < end; i++) slice.push(i);

  return (
    <div ref={ref} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto" style={{ contain: "strict" }}>
      {items.length === 0 ? (
        empty
      ) : (
        <div style={{ height: items.length * ROW, position: "relative" }}>
          {slice.map((i) => (
            <div key={i} style={{ position: "absolute", top: 0, left: 0, right: 0, height: ROW, transform: `translate3d(0,${i * ROW}px,0)` }}>
              {render(items[i], i)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function highlight(paragraph: string, needle: string) {
  const idx = paragraph.toLowerCase().indexOf(needle.toLowerCase().replace(/[.!?]$/, "").slice(0, 80));
  if (idx < 0) return <>{paragraph}</>;
  const len = Math.min(needle.length, paragraph.length - idx);
  return (
    <>
      {paragraph.slice(0, idx)}
      <mark className="rounded bg-cyan/15 px-0.5 text-ice">{paragraph.slice(idx, idx + len)}</mark>
      {paragraph.slice(idx + len)}
    </>
  );
}

function ClaimDrawer({ audit, claim, paragraphs, onClose }: { audit: AuditRecord; claim: Claim | null; paragraphs: string[]; onClose: () => void }) {
  const r = audit.result;
  const frame = claim && r.frames.find((f) => f.id === claim.frameId);
  const voice = claim && r.perspectives.find((p) => p.id === claim.perspectiveId);
  return (
    <aside
      className="slide-over absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col rounded-l-2xl border-l border-line bg-slate shadow-2xl shadow-black/60"
      data-open={claim != null}
      aria-hidden={claim == null}
    >
      {claim && (
        <>
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line-soft px-5">
            <span className="tnum text-xs text-mute">{claim.id.toUpperCase()} · paragraph {claim.paragraph + 1}</span>
            <button type="button" onClick={onClose} aria-label="Close claim details" className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-mute hover:bg-white/[0.05] hover:text-ice">
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <div className="flex items-center justify-between gap-3">
              <VerdictBadge verdict={claim.verdict} />
              <ConfidenceBar value={claim.confidence} color={VERDICT[claim.verdict].color} />
            </div>
            <p className="text-[15px] leading-relaxed text-ice">{claim.text}</p>
            <section>
              <h4 className="text-[11px] uppercase tracking-wider text-mute">Rationale</h4>
              <p className="mt-1 text-sm leading-relaxed text-silver">{claim.rationale}</p>
            </section>
            {claim.counterArgument && (
              <section className="rounded-xl border border-amber/20 bg-amber/[0.04] p-4">
                <h4 className="text-[11px] uppercase tracking-wider text-amber/80">Counter-argument</h4>
                <p className="mt-1 text-sm leading-relaxed text-silver">{claim.counterArgument}</p>
              </section>
            )}
            {claim.evidence.length > 0 && (
              <section>
                <h4 className="text-[11px] uppercase tracking-wider text-mute">Evidence trail</h4>
                <ul className="mt-2 space-y-1.5">
                  {claim.evidence.map((e, i) => (
                    <li key={i} className="flex gap-2 text-[13px] text-silver">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-mute" />
                      {e}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-line-soft p-3">
                <div className="text-mute">Frame</div>
                <div className="mt-0.5 text-violet">{frame?.label ?? "—"}</div>
              </div>
              <div className="rounded-lg border border-line-soft p-3">
                <div className="text-mute">Voice</div>
                <div className="mt-0.5 truncate text-sky">{voice?.label ?? "—"}</div>
              </div>
            </section>
            {paragraphs[claim.paragraph] && (
              <section>
                <h4 className="text-[11px] uppercase tracking-wider text-mute">Source context</h4>
                <p className="mt-2 border-l-2 border-line pl-3 text-[13px] leading-relaxed text-silver">{highlight(paragraphs[claim.paragraph], claim.text)}</p>
              </section>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

const LEVEL_COLOR: Record<AgentLog["level"], string> = { info: "text-silver", warn: "text-amber", error: "text-rose", done: "text-cyan" };

function LogList({ logs }: { logs: AgentLog[] }) {
  const label = Object.fromEntries(AGENTS.map((a) => [a.id, a.label]));
  return (
    <ol className="max-h-[32vh] overflow-y-auto px-4 pb-4 font-mono text-xs">
      {logs.map((l, i) => (
        <li key={i} className="grid grid-cols-[4.5rem_6.5rem_1fr] gap-2 py-1">
          <span className="tnum text-mute">{fmtMs(l.t)}</span>
          <span className="text-ice/70">{label[l.agent] ?? l.agent}</span>
          <span className={LEVEL_COLOR[l.level]}>{l.message}</span>
        </li>
      ))}
    </ol>
  );
}

type Sort = "doc" | "conf-desc" | "conf-asc";

export function ClaimsZone({ audit, focus }: { audit: AuditRecord | null; focus: { id: string; n: number } | null }) {
  const [view, setView] = useState<"claims" | "opinions">("claims");
  const [filter, setFilter] = useState<Verdict | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("doc");
  const [openId, setOpenId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [srcOpen, setSrcOpen] = useState(false);
  const [scrollTo, setScrollTo] = useState<{ index: number; n: number } | null>(null);

  const paragraphs = useMemo(() => (audit ? toParagraphs(audit.input) : []), [audit]);

  useEffect(() => {
    setOpenId(null);
    setFilter("all");
    setQuery("");
  }, [audit?.id]);

  const claims = useMemo(() => {
    if (!audit) return [];
    const q = query.trim().toLowerCase();
    let list = audit.result.claims.filter((c) => (filter === "all" || c.verdict === filter) && (!q || c.text.toLowerCase().includes(q)));
    if (sort !== "doc") list = [...list].sort((a, b) => (sort === "conf-desc" ? b.confidence - a.confidence : a.confidence - b.confidence));
    return list;
  }, [audit, filter, query, sort]);

  const opinions = useMemo(() => {
    if (!audit) return [];
    const q = query.trim().toLowerCase();
    return audit.result.opinions.filter((o) => !q || o.text.toLowerCase().includes(q));
  }, [audit, query]);

  // Focus requests from the constellation map.
  useEffect(() => {
    if (!focus || !audit) return;
    setView("claims");
    setFilter("all");
    setQuery("");
    setSort("doc");
    setOpenId(focus.id);
    setScrollTo({ index: audit.result.claims.findIndex((c) => c.id === focus.id), n: focus.n });
  }, [focus, audit]);

  const close = useCallback(() => setOpenId(null), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (!audit) {
    return <EmptyState icon={<TableProperties size={24} />} title="No audit loaded" body="Verified claims, confidence scores, counter-arguments and agent logs will appear here after a run." />;
  }

  const r = audit.result;
  const counts = r.stats.verdicts;
  const open = r.claims.find((c) => c.id === openId) ?? null;
  const cols = "grid grid-cols-[1fr_auto] md:grid-cols-[3.5rem_1fr_11rem_7.5rem_3rem] items-center gap-3 px-4";

  return (
    <div className="relative flex h-full flex-col gap-3 overflow-hidden p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line-soft bg-slate/60 p-1" role="radiogroup" aria-label="Statement type">
          {(["claims", "opinions"] as const).map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={view === v}
              type="button"
              onClick={() => setView(v)}
              className={`tnum h-7 rounded-md px-3 text-xs capitalize transition-colors ${view === v ? "bg-white/[0.07] text-ice" : "text-mute hover:text-silver"}`}
            >
              {v} {v === "claims" ? r.claims.length : r.opinions.length}
            </button>
          ))}
        </div>
        {view === "claims" && (
          <div className="flex flex-wrap gap-1.5">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
            {(["verified", "unverified", "contradicted"] as const).map((v) => (
              <Chip key={v} active={filter === v} onClick={() => setFilter(filter === v ? "all" : v)} color={VERDICT[v].color}>
                {VERDICT[v].short} <span className="tnum text-mute">{counts[v]}</span>
              </Chip>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mute" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search statements"
              className="h-8 w-40 rounded-lg border border-line-soft bg-slate/60 pl-8 pr-2 text-xs text-ice placeholder:text-mute focus:border-line focus:outline-none sm:w-52"
            />
          </label>
          {view === "claims" && (
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort claims"
              className="h-8 rounded-lg border border-line-soft bg-slate/60 px-2 text-xs text-silver focus:outline-none"
            >
              <option value="doc">Document order</option>
              <option value="conf-desc">Confidence ↓</option>
              <option value="conf-asc">Confidence ↑</option>
            </select>
          )}
        </div>
      </div>

      <div className="surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl" role="table" aria-label={view === "claims" ? "Atomic claims" : "Opinion statements"}>
        <div role="row" className={`${cols} h-10 shrink-0 border-b border-line-soft text-[11px] uppercase tracking-wider text-mute`}>
          {view === "claims" ? (
            <>
              <span className="hidden md:block">ID</span>
              <span>Claim</span>
              <span className="hidden md:block">Verdict</span>
              <span className="hidden md:block">Confidence</span>
              <span className="hidden text-right md:block">¶</span>
              <span className="md:hidden">Verdict</span>
            </>
          ) : (
            <>
              <span className="hidden md:block">ID</span>
              <span>Opinion</span>
              <span className="hidden md:block">Markers</span>
              <span className="hidden md:block" />
              <span className="hidden text-right md:block">¶</span>
              <span className="md:hidden">¶</span>
            </>
          )}
        </div>
        {view === "claims" ? (
          <VirtualRows<Claim>
            items={claims}
            scrollToIndex={scrollTo}
            empty={<p className="p-8 text-center text-sm text-mute">No claims match.</p>}
            render={(c) => (
              <button
                type="button"
                role="row"
                onClick={() => setOpenId(c.id)}
                className={`${cols} h-full w-full border-b border-line-soft/60 text-left transition-colors hover:bg-white/[0.025] ${openId === c.id ? "bg-white/[0.04]" : ""}`}
              >
                <span className="tnum hidden text-xs text-mute md:block">{c.id.toUpperCase()}</span>
                <span className="line-clamp-2 text-[13px] leading-snug text-ice/90">{c.text}</span>
                <span className="hidden md:block"><VerdictBadge verdict={c.verdict} compact /></span>
                <span className="hidden md:block"><ConfidenceBar value={c.confidence} color={VERDICT[c.verdict].color} /></span>
                <span className="tnum hidden text-right text-xs text-mute md:block">{c.paragraph + 1}</span>
                <span className="md:hidden"><VerdictBadge verdict={c.verdict} compact /></span>
              </button>
            )}
          />
        ) : (
          <VirtualRows<Opinion>
            items={opinions}
            scrollToIndex={null}
            empty={<p className="p-8 text-center text-sm text-mute">No opinions detected.</p>}
            render={(o) => (
              <div role="row" className={`${cols} h-full border-b border-line-soft/60`}>
                <span className="tnum hidden text-xs text-mute md:block">{o.id.toUpperCase()}</span>
                <span className="line-clamp-2 text-[13px] leading-snug text-ice/90">{o.text}</span>
                <span className="hidden truncate md:block">
                  {o.markers.slice(0, 2).map((m) => (
                    <span key={m} className="mr-1 rounded-full border border-amber/25 px-1.5 py-0.5 text-[11px] text-amber/90">{m}</span>
                  ))}
                </span>
                <span className="hidden md:block" />
                <span className="tnum hidden text-right text-xs text-mute md:block">{o.paragraph + 1}</span>
                <span className="tnum text-xs text-mute md:hidden">{o.paragraph + 1}</span>
              </div>
            )}
          />
        )}
      </div>

      <div className="grid shrink-0 gap-3 lg:grid-cols-2">
        <Collapsible
          title="Agent audit log"
          icon={<ScrollText size={15} className="text-cyan" aria-hidden />}
          meta={`${audit.logs.length} entries · ${fmtMs(audit.durationMs)}`}
          open={logOpen}
          onToggle={() => setLogOpen((o) => !o)}
        >
          <LogList logs={audit.logs} />
        </Collapsible>
        <Collapsible
          title="Source document"
          icon={<FileText size={15} className="text-silver" aria-hidden />}
          meta={`${paragraphs.length} paragraphs · ${audit.wordCount.toLocaleString()} words`}
          open={srcOpen}
          onToggle={() => setSrcOpen((o) => !o)}
        >
          {srcOpen && (
            <ol className="max-h-[32vh] space-y-3 overflow-y-auto px-4 pb-4 text-[13px] leading-relaxed text-silver">
              {paragraphs.map((p, i) => (
                <li key={i} className="grid grid-cols-[2rem_1fr] gap-2">
                  <span className="tnum text-xs text-mute">¶{i + 1}</span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
          )}
        </Collapsible>
      </div>

      <ClaimDrawer audit={audit} claim={open} paragraphs={paragraphs} onClose={close} />
    </div>
  );
}
