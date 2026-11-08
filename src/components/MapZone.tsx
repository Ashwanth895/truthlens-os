"use client";

import { Activity, ArrowRight, Orbit, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { AuditRecord, Claim } from "@/lib/types";
import { toParagraphs } from "@/lib/text";
import { buildLayout, COLORS } from "./constellation/layout";
import { ConstellationCanvas, type Layers } from "./constellation/ConstellationCanvas";
import { SentimentSpread } from "./constellation/SentimentSpread";
import { Chip, Collapsible, ConfidenceBar, EmptyState, VERDICT, VerdictBadge } from "./ui";

const pct = (n: number) => `${Math.round(n * 100)}%`;

function ShareRow({ label, share, color, onClick, active }: { label: string; share: number; color: string; onClick: () => void; active: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}`}>
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="truncate text-ice/90">{label}</span>
        <span className="tnum shrink-0 text-xs text-mute">{pct(share)}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line-soft">
        <div className="h-full rounded-full" style={{ width: pct(share), background: color }} />
      </div>
    </button>
  );
}

function Detail({ audit, nodeId, onSelect, onOpenClaim }: { audit: AuditRecord; nodeId: string; onSelect: (id: string | null) => void; onOpenClaim: (id: string) => void }) {
  const r = audit.result;
  const [kind, ref] = [nodeId.split(":")[0], nodeId.slice(nodeId.indexOf(":") + 1)];
  const claimList = (list: Claim[]) => (
    <ul className="mt-2 space-y-1">
      {list.slice(0, 40).map((c) => {
        const V = VERDICT[c.verdict];
        return (
          <li key={c.id}>
            <button type="button" onClick={() => onSelect(`claim:${c.id}`)} className="flex w-full gap-2 rounded-md px-2 py-1.5 text-left text-xs text-silver hover:bg-white/[0.04] hover:text-ice">
              <V.Icon size={13} className={`mt-0.5 shrink-0 ${V.text}`} aria-label={V.label} />
              <span className="line-clamp-2">{c.text}</span>
            </button>
          </li>
        );
      })}
      {list.length > 40 && <li className="px-2 text-xs text-mute">+{list.length - 40} more in the claims table</li>}
    </ul>
  );

  if (kind === "claim") {
    const c = r.claims.find((x) => x.id === ref);
    if (!c) return null;
    return (
      <div className="space-y-4">
        <VerdictBadge verdict={c.verdict} />
        <p className="text-sm leading-relaxed text-ice">{c.text}</p>
        <div className="flex items-center justify-between text-xs text-mute">
          Confidence <ConfidenceBar value={c.confidence} color={VERDICT[c.verdict].color} />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-mute">Rationale</div>
          <p className="mt-1 text-[13px] leading-relaxed text-silver">{c.rationale}</p>
        </div>
        {c.counterArgument && (
          <div className="rounded-lg border border-amber/20 bg-amber/[0.04] p-3">
            <div className="text-[11px] uppercase tracking-wider text-amber/80">Counter-argument</div>
            <p className="mt-1 text-[13px] leading-relaxed text-silver">{c.counterArgument}</p>
          </div>
        )}
        <button type="button" onClick={() => onOpenClaim(c.id)} className="inline-flex items-center gap-1.5 text-xs text-cyan hover:underline">
          Open in claims table <ArrowRight size={12} />
        </button>
      </div>
    );
  }
  if (kind === "frame") {
    const f = r.frames.find((x) => x.id === ref);
    if (!f) return null;
    const members = r.claims.filter((c) => c.frameId === f.id);
    return (
      <div>
        <div className="text-[11px] uppercase tracking-wider text-violet">Frame · {pct(f.weight)} of framing</div>
        <h3 className="mt-1 text-base font-medium text-ice">{f.label}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-silver">{f.description}</p>
        <div className="mt-4 text-xs text-mute">{members.length} claims carry this frame</div>
        {claimList(members)}
      </div>
    );
  }
  if (kind === "voice") {
    const p = r.perspectives.find((x) => x.id === ref);
    if (!p) return null;
    const members = r.claims.filter((c) => c.perspectiveId === p.id);
    return (
      <div>
        <div className="text-[11px] uppercase tracking-wider text-sky">Voice · {pct(p.share)} of statements</div>
        <h3 className="mt-1 text-base font-medium text-ice">{p.label}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-silver">{p.description}</p>
        <div className="mt-4 text-xs text-mute">{members.length} claims voiced</div>
        {claimList(members)}
      </div>
    );
  }
  if (kind === "emotion") {
    const t = r.emotionalTerms.find((x) => x.id === ref);
    if (!t) return null;
    const paras = [...new Set(t.paragraphs)].sort((a, b) => a - b);
    return (
      <div>
        <div className="text-[11px] uppercase tracking-wider text-amber">Loaded term</div>
        <h3 className="mt-1 text-base font-medium text-ice">“{t.term}”</h3>
        <dl className="tnum mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            ["Uses", String(t.count)],
            ["Valence", `${t.valence > 0 ? "+" : ""}${t.valence.toFixed(2)}`],
            ["Intensity", t.intensity.toFixed(2)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line-soft py-2">
              <dt className="text-[10px] uppercase tracking-wider text-mute">{k}</dt>
              <dd className="text-sm text-ice">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 text-xs text-mute">Appears in paragraph{paras.length > 1 ? "s" : ""} {paras.map((p) => p + 1).join(", ")}</div>
        {claimList(r.claims.filter((c) => paras.includes(c.paragraph)))}
      </div>
    );
  }
  return null;
}

export function MapZone({ audit, onOpenClaim }: { audit: AuditRecord | null; onOpenClaim: (id: string) => void }) {
  const [layers, setLayers] = useState<Layers>({ frame: true, claim: true, emotion: true, voice: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches);
  const [spreadOpen, setSpreadOpen] = useState(false);
  const layout = useMemo(() => (audit ? buildLayout(audit.result) : null), [audit]);
  const paragraphs = useMemo(() => (audit ? toParagraphs(audit.input) : []), [audit]);

  if (!audit || !layout) {
    return <EmptyState icon={<Orbit size={24} />} title="No constellation yet" body="Run a verification in Ingestion. Framing, voices and emotional language will be mapped here." />;
  }
  const r = audit.result;
  const peak = r.sentiment.reduce<{ i: number; v: number } | null>((b, s) => (s.intensity > (b?.v ?? 0) ? { i: s.paragraph, v: s.intensity } : b), null);
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  return (
    <div className="flex h-full flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={layers.frame} onClick={() => toggle("frame")} color={COLORS.frame}>Frames</Chip>
        <Chip active={layers.claim} onClick={() => toggle("claim")} color={COLORS.verified}>Claims</Chip>
        <Chip active={layers.voice} onClick={() => toggle("voice")} color={COLORS.voice}>Voices</Chip>
        <Chip active={layers.emotion} onClick={() => toggle("emotion")} color={COLORS.emotion}>Emotional language</Chip>
        <div className="ml-auto hidden items-center gap-3 text-[11px] text-mute lg:flex">
          {(["verified", "unverified", "contradicted"] as const).map((v) => {
            const V = VERDICT[v];
            return (
              <span key={v} className="flex items-center gap-1.5">
                <V.Icon size={12} className={V.text} aria-hidden /> {V.short}
              </span>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setPanel((p) => !p)}
          aria-label={panel ? "Hide details panel" : "Show details panel"}
          className="grid h-8 w-8 place-items-center rounded-lg text-mute ring-1 ring-line-soft hover:text-ice"
        >
          {panel ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 gap-3">
        <div className="surface relative min-w-0 flex-1 overflow-hidden rounded-2xl">
          <ConstellationCanvas layout={layout} layers={layers} selected={selected} onSelect={setSelected} />
          {(layout.shownClaims < layout.totalClaims || layout.shownTerms < layout.totalTerms) && (
            <div className="tnum pointer-events-none absolute left-3 top-3 rounded-md bg-void/70 px-2 py-1 text-[11px] text-mute">
              Showing {layout.shownClaims}/{layout.totalClaims} claims · {layout.shownTerms}/{layout.totalTerms} terms
            </div>
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 hidden text-[11px] text-mute sm:block">Drag to pan · scroll to zoom · click a node</div>
        </div>

        <aside
          className={`surface absolute inset-y-0 right-0 z-20 w-[min(20rem,85%)] overflow-hidden rounded-2xl shadow-2xl shadow-black/40 transition-[opacity,transform] duration-200 md:static md:shadow-none ${
            panel ? "opacity-100" : "pointer-events-none translate-x-4 opacity-0 md:hidden"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-line-soft px-4">
              <span className="text-sm font-medium text-ice">{selected ? "Node details" : "Map overview"}</span>
              {selected ? (
                <button type="button" onClick={() => setSelected(null)} aria-label="Clear selection" className="text-mute hover:text-ice">
                  <X size={15} />
                </button>
              ) : (
                <button type="button" onClick={() => setPanel(false)} aria-label="Close panel" className="text-mute hover:text-ice md:hidden">
                  <X size={15} />
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selected ? (
                <div key={selected} className="fade-in">
                  <Detail audit={audit} nodeId={selected} onSelect={setSelected} onOpenClaim={onOpenClaim} />
                </div>
              ) : (
                <div className="space-y-5">
                  <section>
                    <h4 className="mb-1 px-2.5 text-[11px] uppercase tracking-wider text-mute">Framing</h4>
                    {r.frames.map((f) => (
                      <ShareRow key={f.id} label={f.label} share={f.weight} color={COLORS.frame} active={false} onClick={() => setSelected(`frame:${f.id}`)} />
                    ))}
                  </section>
                  <section>
                    <h4 className="mb-1 px-2.5 text-[11px] uppercase tracking-wider text-mute">Voices</h4>
                    {r.perspectives.map((p) => (
                      <ShareRow key={p.id} label={p.label} share={p.share} color={COLORS.voice} active={false} onClick={() => setSelected(`voice:${p.id}`)} />
                    ))}
                  </section>
                  <section>
                    <h4 className="mb-2 px-2.5 text-[11px] uppercase tracking-wider text-mute">Loaded language</h4>
                    <div className="flex flex-wrap gap-1.5 px-2.5">
                      {r.emotionalTerms.slice(0, 14).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelected(`emotion:${t.id}`)}
                          className="rounded-full border border-amber/25 px-2 py-0.5 text-xs text-amber/90 hover:bg-amber/[0.08]"
                        >
                          {t.term} <span className="tnum text-mute">×{t.count}</span>
                        </button>
                      ))}
                      {!r.emotionalTerms.length && <span className="text-xs text-mute">None detected.</span>}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <Collapsible
        title="Sentiment spread"
        icon={<Activity size={15} className="text-amber" aria-hidden />}
        meta={peak ? `peak intensity in ¶${peak.i + 1}` : "no emotive peaks"}
        open={spreadOpen}
        onToggle={() => setSpreadOpen((o) => !o)}
        className="shrink-0"
      >
        <SentimentSpread series={r.sentiment} paragraphs={paragraphs} />
      </Collapsible>
    </div>
  );
}
