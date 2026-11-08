"use client";

import { ChevronDown, CircleHelp, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Verdict } from "@/lib/types";

export const VERDICT: Record<Verdict, { label: string; short: string; color: string; text: string; bg: string; ring: string; Icon: LucideIcon }> = {
  verified: { label: "Verified Fact", short: "Verified", color: "#00F0FF", text: "text-cyan", bg: "bg-cyan/10", ring: "ring-cyan/30", Icon: ShieldCheck },
  unverified: { label: "Unverified Assertion", short: "Unverified", color: "#94A3B8", text: "text-silver", bg: "bg-silver/10", ring: "ring-silver/25", Icon: CircleHelp },
  contradicted: { label: "Contradicted Statement", short: "Contradicted", color: "#FF5C7A", text: "text-rose", bg: "bg-rose/10", ring: "ring-rose/30", Icon: ShieldAlert },
};

export function VerdictBadge({ verdict, compact = false }: { verdict: Verdict; compact?: boolean }) {
  const v = VERDICT[verdict];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${v.text} ${v.bg} ${v.ring}`}>
      <v.Icon size={13} strokeWidth={2} aria-hidden />
      {compact ? v.short : v.label}
    </span>
  );
}

export function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Confidence ${value} of 100`}>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-line-soft">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="tnum w-7 text-right text-xs text-ice/80">{value}</span>
    </div>
  );
}

export function Collapsible({
  title,
  icon,
  meta,
  open,
  onToggle,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  meta?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface rounded-xl ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-11 w-full items-center gap-2.5 rounded-xl px-4 text-left text-sm text-ice/90 transition-colors hover:bg-white/[0.02]"
      >
        {icon}
        <span className="font-medium">{title}</span>
        {meta && <span className="text-xs text-mute">{meta}</span>}
        <ChevronDown size={16} className={`ml-auto text-mute transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <div className="drawer-collapse" data-open={open}>
        <div>{children}</div>
      </div>
    </section>
  );
}

export function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 transition-colors ${
        active ? "bg-white/[0.06] text-ice ring-line" : "text-mute ring-line-soft hover:text-silver"
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: active ? color : "transparent", boxShadow: `inset 0 0 0 1.5px ${color}` }} />}
      {children}
    </button>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-slate text-mute">{icon}</div>
      <h3 className="text-base font-medium text-ice">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-silver">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  type = "button",
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "outline";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const styles = {
    primary: "bg-cyan text-void hover:bg-cyan/90 disabled:bg-cyan/30 disabled:text-void/60 font-semibold",
    outline: "ring-1 ring-line text-ice/90 hover:bg-white/[0.04] disabled:opacity-40",
    ghost: "text-silver hover:text-ice hover:bg-white/[0.04] disabled:opacity-40",
  }[variant];
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}
