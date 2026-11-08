"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Layout, MapNode, NodeKind } from "./layout";
import { COLORS } from "./layout";

export type Layers = Record<"frame" | "claim" | "emotion" | "voice", boolean>;

const KIND_LABEL: Record<NodeKind, string> = { core: "Document", frame: "Frame", claim: "Claim", emotion: "Loaded term", voice: "Voice" };
const VERDICT_LABEL = { verified: "Verified Fact", unverified: "Unverified Assertion", contradicted: "Contradicted" } as const;

function visible(n: MapNode, layers: Layers) {
  if (n.kind === "core") return true;
  return layers[n.kind];
}

export function ConstellationCanvas({
  layout,
  layers,
  selected,
  onSelect,
}: {
  layout: Layout;
  layers: Layers;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const frame = useRef(0);
  const hoverRef = useRef<string | null>(null);
  const props = useRef({ layout, layers, selected });
  props.current = { layout, layers, selected };
  const [hover, setHover] = useState<{ node: MapNode; sx: number; sy: number } | null>(null);
  const [zoomPct, setZoomPct] = useState(100);

  const toScreen = useCallback((x: number, y: number) => {
    const { w, h } = size.current;
    const v = view.current;
    return { sx: w / 2 + v.x + x * v.k, sy: h / 2 + v.y + y * v.k };
  }, []);

  const draw = useCallback(() => {
    frame.current = 0;
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const { w, h, dpr } = size.current;
    const { layout: L, layers: lay, selected: sel } = props.current;
    const v = view.current;
    const focus = hoverRef.current ?? sel;
    const lit = focus ? new Set([focus, ...(L.neighbors.get(focus) ?? [])]) : null;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * (w / 2 + v.x), dpr * (h / 2 + v.y));

    // Orbit guides
    ctx.lineWidth = 1 / v.k;
    ctx.strokeStyle = "rgba(42,59,82,0.35)";
    ctx.setLineDash([2 / v.k, 6 / v.k]);
    for (const n of L.nodes) {
      if (n.kind !== "frame") continue;
      ctx.beginPath();
      ctx.arc(0, 0, Math.hypot(n.x, n.y), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    ctx.setLineDash([]);

    // Edges
    for (const e of L.edges) {
      const a = L.byId.get(e.a)!;
      const b = L.byId.get(e.b)!;
      if (!visible(a, lay) || !visible(b, lay)) continue;
      const hot = focus != null && (e.a === focus || e.b === focus);
      if (e.kind === "voice" && !hot) continue;
      let alpha = { spine: 0.28, member: 0.1, emotion: 0.2, voice: 0.55 }[e.kind];
      if (lit && !hot) alpha *= 0.25;
      if (hot) alpha = Math.max(alpha, 0.6);
      ctx.strokeStyle = e.kind === "emotion" ? `rgba(255,184,0,${alpha})` : e.kind === "voice" ? `rgba(125,211,252,${alpha})` : `rgba(148,163,184,${alpha})`;
      ctx.lineWidth = (hot ? 1.5 : 1) / v.k;
      if (e.kind === "emotion") ctx.setLineDash([3 / v.k, 4 / v.k]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Nodes, back to front
    const order: NodeKind[] = ["emotion", "claim", "voice", "frame", "core"];
    for (const kind of order) {
      for (const n of L.nodes) {
        if (n.kind !== kind || !visible(n, lay)) continue;
        const dim = lit && !lit.has(n.id);
        ctx.globalAlpha = dim ? 0.16 : 1;
        if (n.kind === "frame") {
          ctx.fillStyle = "rgba(167,139,250,0.14)";
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = n.color;
          ctx.lineWidth = 1.5 / v.k;
          ctx.stroke();
        } else if (n.kind === "voice") {
          ctx.strokeStyle = n.color;
          ctx.lineWidth = 1.5 / v.k;
          ctx.setLineDash([4 / v.k, 3 / v.k]);
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(125,211,252,0.08)";
          ctx.fill();
        } else if (n.kind === "core") {
          ctx.fillStyle = "rgba(240,244,248,0.08)";
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 0.55, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // claim / emotion — 2px surface ring keeps overlapping marks distinct
          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#0B0F17";
          ctx.lineWidth = 1.2 / v.k;
          ctx.stroke();
        }
        if (n.id === focus || n.id === sel) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = n.id === sel ? "#F0F4F8" : n.color;
          ctx.lineWidth = 2 / v.k;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 4 / v.k, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;

    // Labels in screen space (crisp at any zoom)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const n of L.nodes) {
      if (!visible(n, lay)) continue;
      const showLabel =
        n.kind === "frame" || n.kind === "voice" || n.kind === "core" ||
        (n.kind === "emotion" && (v.k > 1.15 || (n.rank ?? 99) < 8 || (lit?.has(n.id) ?? false)));
      if (!showLabel) continue;
      const { sx, sy } = toScreen(n.x, n.y);
      if (sx < -80 || sx > w + 80 || sy < -40 || sy > h + 40) continue;
      const dim = lit && !lit.has(n.id);
      ctx.globalAlpha = dim ? 0.25 : 1;
      const text = n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label;
      ctx.font = n.kind === "frame" ? "600 12px Inter, system-ui, sans-serif" : "11px Inter, system-ui, sans-serif";
      ctx.fillStyle = n.kind === "frame" ? "#F0F4F8" : n.kind === "emotion" ? "#FFD466" : n.kind === "voice" ? "#BAE6FD" : "#94A3B8";
      const y = sy + n.r * v.k + 6;
      // Text halo for legibility over edges
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(11,15,23,0.85)";
      ctx.strokeText(text, sx, y);
      ctx.fillText(text, sx, y);
    }
    ctx.globalAlpha = 1;
  }, [toScreen]);

  const requestDraw = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }, [draw]);

  const fit = useCallback(() => {
    const { w, h } = size.current;
    if (!w || !h) return;
    const k = (Math.min(w, h) / (2 * props.current.layout.radius)) * 0.96;
    view.current = { x: 0, y: 0, k: Math.max(0.2, Math.min(k, 2.2)) };
    setZoomPct(Math.round(view.current.k * 100));
    requestDraw();
  }, [requestDraw]);

  // Size canvas to its container (device-pixel aware) without affecting layout.
  useEffect(() => {
    const wrap = wrapRef.current;
    const cvs = canvasRef.current;
    if (!wrap || !cvs) return;
    let first = true;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.current = { w: width, h: height, dpr };
      cvs.width = Math.round(width * dpr);
      cvs.height = Math.round(height * dpr);
      if (first) {
        first = false;
        fit();
      } else requestDraw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fit, requestDraw]);

  useEffect(() => fit(), [layout, fit]);
  useEffect(() => requestDraw(), [layers, selected, requestDraw]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const hitTest = useCallback((sx: number, sy: number): MapNode | null => {
    const { w, h } = size.current;
    const v = view.current;
    const wx = (sx - w / 2 - v.x) / v.k;
    const wy = (sy - h / 2 - v.y) / v.k;
    const { layout: L, layers: lay } = props.current;
    let best: MapNode | null = null;
    let bestD = Infinity;
    for (const n of L.nodes) {
      if (!visible(n, lay)) continue;
      const d = Math.hypot(n.x - wx, n.y - wy);
      const reach = n.r + 5 / v.k; // hit target larger than the mark
      if (d <= reach && d - n.r < bestD) {
        best = n;
        bestD = d - n.r;
      }
    }
    return best;
  }, []);

  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (d.moved || Math.abs(dx) + Math.abs(dy) > 3) {
        d.moved = true;
        view.current.x += dx;
        view.current.y += dy;
        d.x = e.clientX;
        d.y = e.clientY;
        if (hoverRef.current) {
          hoverRef.current = null;
          setHover(null);
        }
        requestDraw();
        return;
      }
    }
    const n = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    const id = n?.id ?? null;
    if (id !== hoverRef.current) {
      hoverRef.current = id;
      if (n) {
        const { sx, sy } = toScreen(n.x, n.y);
        setHover({ node: n, sx, sy: sy - n.r * view.current.k });
      } else setHover(null);
      requestDraw();
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const n = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      onSelect(n && n.kind !== "core" ? n.id : null);
    }
  };
  const onLeave = () => {
    if (hoverRef.current) {
      hoverRef.current = null;
      setHover(null);
      requestDraw();
    }
  };

  const zoomAt = useCallback(
    (factor: number, sx?: number, sy?: number) => {
      const { w, h } = size.current;
      const v = view.current;
      const px = sx ?? w / 2;
      const py = sy ?? h / 2;
      const k = Math.max(0.2, Math.min(5, v.k * factor));
      const wx = (px - w / 2 - v.x) / v.k;
      const wy = (py - h / 2 - v.y) / v.k;
      v.x = px - w / 2 - wx * k;
      v.y = py - h / 2 - wy * k;
      v.k = k;
      setZoomPct(Math.round(k * 100));
      if (hoverRef.current) {
        hoverRef.current = null;
        setHover(null);
      }
      requestDraw();
    },
    [requestDraw],
  );

  // Non-passive wheel listener so the page doesn't scroll while zooming.
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = cvs.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    cvs.addEventListener("wheel", onWheel, { passive: false });
    return () => cvs.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const hn = hover?.node;
  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Bias constellation: ${layout.nodes.length} nodes. The same data is available as a table in Audit Logs & Data.`}
        className={`absolute inset-0 h-full w-full touch-none ${hover ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onLeave}
        onDoubleClick={fit}
      />
      {hn && hover && (
        <div
          className="pointer-events-none absolute left-0 top-0 z-10 max-w-72 rounded-lg border border-line bg-void/95 px-3 py-2 text-xs shadow-xl shadow-black/50"
          style={{ transform: `translate3d(calc(${hover.sx}px - 50%), calc(${hover.sy - 10}px - 100%), 0)` }}
        >
          <div className="mb-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-mute">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: hn.color }} />
            {hn.kind === "claim" && hn.verdict ? VERDICT_LABEL[hn.verdict] : KIND_LABEL[hn.kind]}
          </div>
          <div className="line-clamp-3 leading-snug text-ice">{hn.label}</div>
        </div>
      )}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-lg border border-line-soft bg-void/80 p-0.5">
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.25)} className="grid h-7 w-7 place-items-center rounded-md text-silver hover:bg-white/[0.06] hover:text-ice">
          <Minus size={14} />
        </button>
        <span className="tnum w-11 text-center text-[11px] text-mute">{zoomPct}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.25)} className="grid h-7 w-7 place-items-center rounded-md text-silver hover:bg-white/[0.06] hover:text-ice">
          <Plus size={14} />
        </button>
        <button type="button" aria-label="Fit to view" onClick={fit} className="grid h-7 w-7 place-items-center rounded-md text-silver hover:bg-white/[0.06] hover:text-ice">
          <Maximize2 size={13} />
        </button>
      </div>
    </div>
  );
}

export { COLORS };
