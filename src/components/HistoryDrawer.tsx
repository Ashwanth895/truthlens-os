"use client";

import { Globe, History, Loader2, Trash2, Type, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AuditListItem } from "@/lib/types";

export function HistoryDrawer({
  open,
  onClose,
  onLoad,
  currentId,
  refreshKey,
}: {
  open: boolean;
  onClose: () => void;
  onLoad: (id: string) => void;
  currentId: string | null;
  refreshKey: number;
}) {
  const [items, setItems] = useState<AuditListItem[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/audits")
      .then((r) => r.json())
      .then((d) => alive && setItems(d.audits ?? []))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [open, refreshKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const remove = async (id: string) => {
    setItems((list) => list?.filter((i) => i.id !== id) ?? null);
    await fetch(`/api/audits/${id}`, { method: "DELETE" });
  };

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-void/60 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        className="slide-over fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-line bg-slate shadow-2xl shadow-black/60"
        data-open={open}
        aria-hidden={!open}
        aria-label="Audit history"
      >
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line-soft px-5">
          <History size={16} className="text-cyan" aria-hidden />
          <span className="text-sm font-medium text-ice">Audit history</span>
          <button type="button" onClick={onClose} aria-label="Close history" className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-mute hover:bg-white/[0.05] hover:text-ice">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {items == null ? (
            <div className="grid h-32 place-items-center text-mute">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-mute">No saved audits yet. Every run is archived here automatically.</p>
          ) : (
            <ul>
              {items.map((a) => (
                <li key={a.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      onLoad(a.id);
                      onClose();
                    }}
                    className={`w-full rounded-xl px-3 py-3 pr-11 text-left transition-colors hover:bg-white/[0.04] ${a.id === currentId ? "bg-white/[0.05]" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      {a.sourceType === "url" ? <Globe size={13} className="shrink-0 text-mute" aria-hidden /> : <Type size={13} className="shrink-0 text-mute" aria-hidden />}
                      <span className="truncate text-sm text-ice/90">{a.title}</span>
                    </div>
                    <div className="tnum mt-1.5 flex items-center gap-3 pl-5 text-[11px] text-mute">
                      <span>{new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                      <span>{a.wordCount.toLocaleString()} words</span>
                      <span className="text-cyan/80">cred {a.credibility}</span>
                      <span className="text-amber/80">bias {a.biasIndex}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(a.id)}
                    aria-label={`Delete audit ${a.title}`}
                    className="absolute right-2 top-3 grid h-8 w-8 place-items-center rounded-lg text-mute opacity-0 transition-opacity hover:bg-rose/10 hover:text-rose focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
