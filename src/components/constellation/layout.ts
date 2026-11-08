// Deterministic constellation layout. No physics simulation: hubs sit on a ring and their
// members are placed on phyllotaxis spirals, so layout is O(n), stable between renders and
// never jitters (zero layout shift on the canvas either).

import type { AuditResult, Verdict } from "@/lib/types";

export type NodeKind = "core" | "frame" | "claim" | "emotion" | "voice";

export interface MapNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  r: number;
  color: string;
  label: string;
  verdict?: Verdict;
  ref?: string; // id of the underlying domain object
  rank?: number; // salience order for label priority
}

export interface MapEdge {
  a: string;
  b: string;
  kind: "spine" | "member" | "emotion" | "voice";
}

export interface Layout {
  nodes: MapNode[];
  edges: MapEdge[];
  byId: Map<string, MapNode>;
  neighbors: Map<string, Set<string>>;
  radius: number;
  shownClaims: number;
  totalClaims: number;
  shownTerms: number;
  totalTerms: number;
}

export const COLORS = {
  core: "#F0F4F8",
  frame: "#A78BFA",
  voice: "#7DD3FC",
  emotion: "#FFB800",
  verified: "#00F0FF",
  unverified: "#94A3B8",
  contradicted: "#FF5C7A",
};

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const MAX_CLAIMS = 260;
const MAX_TERMS = 42;
const VERDICT_ORDER: Record<Verdict, number> = { contradicted: 0, verified: 1, unverified: 2 };

export function buildLayout(r: AuditResult): Layout {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  nodes.push({ id: "core", kind: "core", x: 0, y: 0, r: 13, color: COLORS.core, label: "Document" });

  // Pick the claims to show: contradictions first, then by confidence.
  const claims = [...r.claims]
    .sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || b.confidence - a.confidence)
    .slice(0, MAX_CLAIMS);

  const frames = r.frames.length ? r.frames : [{ id: "f-none", label: "Unframed", weight: 1, description: "" }];
  const frameIds = new Set(frames.map((f) => f.id));
  const clusters = new Map<string, typeof claims>(frames.map((f) => [f.id, []]));
  for (const c of claims) {
    const fid = c.frameId && frameIds.has(c.frameId) ? c.frameId : frames[0].id;
    clusters.get(fid)!.push(c);
  }

  const F = frames.length;
  const spacing = 13;
  const hubR = (w: number) => 9 + 16 * Math.sqrt(w);
  const clusterR = (k: number, w: number) => hubR(w) + 10 + spacing * Math.sqrt(k);
  const maxCluster = Math.max(...frames.map((f) => clusterR(clusters.get(f.id)!.length, f.weight)));
  // Ring radius large enough that neighbouring clusters never overlap.
  const R1 = F === 1 ? 0 : Math.max(200, (maxCluster * 1.15) / Math.sin(Math.PI / F));

  const hubAngle = new Map<string, number>();
  frames.forEach((f, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / F;
    hubAngle.set(f.id, angle);
    const hx = Math.cos(angle) * R1;
    const hy = Math.sin(angle) * R1;
    const id = `frame:${f.id}`;
    nodes.push({ id, kind: "frame", x: hx, y: hy, r: hubR(f.weight), color: COLORS.frame, label: f.label, ref: f.id });
    if (F > 1) edges.push({ a: "core", b: id, kind: "spine" });

    const members = clusters.get(f.id)!.sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict]);
    const base = hubR(f.weight) + 12;
    members.forEach((c, j) => {
      const rad = base + spacing * Math.sqrt(j);
      const t = angle + j * GOLDEN;
      const nid = `claim:${c.id}`;
      nodes.push({
        id: nid,
        kind: "claim",
        x: hx + Math.cos(t) * rad,
        y: hy + Math.sin(t) * rad,
        r: 3.5 + c.confidence / 30,
        color: COLORS[c.verdict],
        verdict: c.verdict,
        label: c.text,
        ref: c.id,
      });
      edges.push({ a: id, b: nid, kind: "member" });
    });
  });

  // Emotional terms: attach to the frame whose claims share the most paragraphs.
  const paraFrame = new Map<number, Map<string, number>>();
  for (const c of claims) {
    const fid = c.frameId && frameIds.has(c.frameId) ? c.frameId : frames[0].id;
    const m = paraFrame.get(c.paragraph) ?? new Map();
    m.set(fid, (m.get(fid) ?? 0) + 1);
    paraFrame.set(c.paragraph, m);
  }
  const terms = r.emotionalTerms.slice(0, MAX_TERMS);
  const R2 = R1 + maxCluster + 70;
  const termsByFrame = new Map<string, typeof terms>();
  for (const t of terms) {
    const score = new Map<string, number>();
    for (const p of t.paragraphs) for (const [fid, n] of paraFrame.get(p) ?? []) score.set(fid, (score.get(fid) ?? 0) + n);
    const fid = [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? frames[0].id;
    termsByFrame.set(fid, [...(termsByFrame.get(fid) ?? []), t]);
  }
  for (const [fid, list] of termsByFrame) {
    const center = hubAngle.get(fid) ?? 0;
    const baseDist = F === 1 ? maxCluster + 60 : R2;
    // Widen the arc when a frame owns many terms so labels get room (~44 units apart).
    const arc = F === 1 ? Math.PI * 2 : Math.min(Math.PI * 1.7, Math.max(((2 * Math.PI) / F) * 0.8, (list.length * 44) / baseDist / 2));
    list.forEach((t, j) => {
      const frac = list.length === 1 ? 0.5 : j / (list.length - 1);
      const ang = F === 1 ? center + frac * arc * (1 - 1 / Math.max(list.length, 1)) : center - arc / 2 + frac * arc;
      const dist = baseDist + (j % 3) * 30;
      const nid = `emotion:${t.id}`;
      nodes.push({
        id: nid,
        kind: "emotion",
        x: Math.cos(ang) * dist,
        y: Math.sin(ang) * dist,
        r: 3 + t.intensity * Math.min(Math.sqrt(t.count), 3) * 2.4,
        color: COLORS.emotion,
        label: t.term,
        ref: t.id,
        rank: terms.indexOf(t),
      });
      edges.push({ a: `frame:${fid}`, b: nid, kind: "emotion" });
    });
  }

  // Voices on the outer ring, offset half a step from the frames.
  const R3 = (F === 1 ? maxCluster + 60 : R2) + 60 + 110; // clear of the 3 emotion tiers + labels
  const P = r.perspectives.length;
  r.perspectives.forEach((p, i) => {
    const ang = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / Math.max(P, 1);
    const nid = `voice:${p.id}`;
    nodes.push({ id: nid, kind: "voice", x: Math.cos(ang) * R3, y: Math.sin(ang) * R3, r: 6 + 14 * Math.sqrt(p.share), color: COLORS.voice, label: p.label, ref: p.id });
  });
  for (const c of claims) if (c.perspectiveId) edges.push({ a: `voice:${c.perspectiveId}`, b: `claim:${c.id}`, kind: "voice" });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const valid = edges.filter((e) => byId.has(e.a) && byId.has(e.b));
  const neighbors = new Map<string, Set<string>>();
  for (const e of valid) {
    if (!neighbors.has(e.a)) neighbors.set(e.a, new Set());
    if (!neighbors.has(e.b)) neighbors.set(e.b, new Set());
    neighbors.get(e.a)!.add(e.b);
    neighbors.get(e.b)!.add(e.a);
  }
  const radius = Math.max(...nodes.map((n) => Math.hypot(n.x, n.y) + n.r)) + 56; // room for labels
  return {
    nodes, edges: valid, byId, neighbors, radius,
    shownClaims: claims.length, totalClaims: r.claims.length, shownTerms: terms.length, totalTerms: r.emotionalTerms.length,
  };
}
