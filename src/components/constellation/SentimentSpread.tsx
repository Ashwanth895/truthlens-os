"use client";

import { useEffect, useRef, useState } from "react";
import type { SentimentPoint } from "@/lib/types";

const POS = "#7DD3FC";
const NEG = "#FFB800";
const H = 132;
const PAD = { l: 30, r: 8, t: 10, b: 20 };

/** Diverging per-paragraph sentiment bars with a hover tooltip. */
export function SentimentSpread({ series, paragraphs }: { series: SentimentPoint[]; paragraphs: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = series.length || 1;
  const innerW = w - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const mid = PAD.t + innerH / 2;
  const band = innerW / n;
  const gap = band > 6 ? 2 : band > 3 ? 1 : 0;
  const barW = Math.max(1, band - gap);
  const p = hover != null ? series[hover] : null;

  return (
    <div ref={ref} className="relative px-4 pb-4">
      <div className="mb-2 flex items-center gap-4 text-[11px] text-mute">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: POS }} />Positive tone</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: NEG }} />Negative tone</span>
        <span className="ml-auto hidden sm:inline">Per paragraph, from loaded-language hits</span>
      </div>
      <svg width={w - 32} height={H} role="img" aria-label="Sentiment by paragraph" onMouseLeave={() => setHover(null)} className="block">
        <text x={PAD.l - 6} y={PAD.t + 4} textAnchor="end" className="fill-mute text-[10px]">+1</text>
        <text x={PAD.l - 6} y={mid + 3} textAnchor="end" className="fill-mute text-[10px]">0</text>
        <text x={PAD.l - 6} y={PAD.t + innerH} textAnchor="end" className="fill-mute text-[10px]">−1</text>
        {hover != null && <rect x={PAD.l + hover * band} y={PAD.t} width={band} height={innerH} fill="rgba(240,244,248,0.05)" />}
        {series.map((s, i) => {
          const hgt = Math.abs(s.sentiment) * (innerH / 2);
          const x = PAD.l + i * band + gap / 2;
          if (hgt < 0.5) return <rect key={i} x={x} y={mid - 0.5} width={barW} height={1} fill="#2A3B52" />;
          const r = Math.min(3, barW / 2, hgt);
          const up = s.sentiment > 0;
          // Rounded data-end, square at the baseline
          const y0 = up ? mid - hgt : mid;
          const d = up
            ? `M${x},${mid} V${y0 + r} Q${x},${y0} ${x + r},${y0} H${x + barW - r} Q${x + barW},${y0} ${x + barW},${y0 + r} V${mid} Z`
            : `M${x},${mid} V${mid + hgt - r} Q${x},${mid + hgt} ${x + r},${mid + hgt} H${x + barW - r} Q${x + barW},${mid + hgt} ${x + barW},${mid + hgt - r} V${mid} Z`;
          return <path key={i} d={d} fill={up ? POS : NEG} opacity={hover == null || hover === i ? 1 : 0.45} />;
        })}
        <line x1={PAD.l} x2={PAD.l + innerW} y1={mid} y2={mid} stroke="#2A3B52" />
        <text x={PAD.l} y={H - 4} className="fill-mute text-[10px]">¶1</text>
        <text x={PAD.l + innerW} y={H - 4} textAnchor="end" className="fill-mute text-[10px]">¶{n}</text>
        {/* Hit targets wider than the bars */}
        {series.map((_, i) => (
          <rect key={`h${i}`} x={PAD.l + i * band} y={PAD.t} width={band} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {p && hover != null && (
        <div
          className="pointer-events-none absolute top-6 z-10 w-64 rounded-lg border border-line bg-void/95 px-3 py-2 text-xs shadow-xl shadow-black/50"
          style={{ left: Math.min(Math.max(16 + PAD.l + hover * band - 128, 8), w - 272) }}
        >
          <div className="tnum flex justify-between text-mute">
            <span>Paragraph {p.paragraph + 1}</span>
            <span>
              tone <span className="text-ice">{p.sentiment > 0 ? "+" : ""}{p.sentiment.toFixed(2)}</span> · intensity <span className="text-ice">{p.intensity.toFixed(2)}</span>
            </span>
          </div>
          <div className="mt-1 line-clamp-3 leading-snug text-silver">{paragraphs[p.paragraph]}</div>
        </div>
      )}
    </div>
  );
}
