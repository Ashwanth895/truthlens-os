"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditRecord } from "@/lib/types";
import { ClaimsZone } from "./ClaimsZone";
import { Header } from "./Header";
import { HistoryDrawer } from "./HistoryDrawer";
import { IngestionZone } from "./IngestionZone";
import { MapZone } from "./MapZone";
import { Tabs, type ZoneId } from "./Tabs";
import { useAuditRun } from "./useAuditRun";

export function Workspace() {
  const [zone, setZone] = useState<ZoneId>("ingest");
  const [audit, setAudit] = useState<AuditRecord | null>(null);
  const [engine, setEngine] = useState<{ engine: string; model: string | null } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const onResult = useCallback((a: AuditRecord) => {
    setAudit(a);
    setHistoryKey((k) => k + 1);
    history.replaceState(null, "", `?audit=${a.id}`);
  }, []);
  const runner = useAuditRun(onResult);
  const resetRun = runner.reset;

  const load = useCallback(async (id: string) => {
    setLoadError(null);
    const res = await fetch(`/api/audits/${encodeURIComponent(id)}`);
    if (!res.ok) {
      setLoadError("That audit could not be found.");
      return;
    }
    const { audit: a } = (await res.json()) as { audit: AuditRecord };
    setAudit(a);
    resetRun();
    setZone("ingest");
    history.replaceState(null, "", `?audit=${a.id}`);
  }, [resetRun]);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setEngine).catch(() => setEngine({ engine: "heuristic", model: null }));
    const id = new URLSearchParams(location.search).get("audit");
    if (id) void load(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openClaim = useCallback((id: string) => {
    setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    setZone("audit");
  }, []);

  const badges = audit
    ? { map: String(audit.result.frames.length + audit.result.perspectives.length), audit: String(audit.result.claims.length) }
    : {};

  return (
    <div className="flex h-dvh flex-col">
      <Header running={runner.running} stages={runner.stages} engine={engine} audit={audit} onHistory={() => setHistoryOpen(true)} />
      <Tabs active={zone} onChange={setZone} badges={badges} />
      <main className="relative min-h-0 flex-1">
        <section id="zone-ingest" role="tabpanel" aria-labelledby="tab-ingest" className="zone" data-active={zone === "ingest"}>
          <IngestionZone
            audit={audit}
            running={runner.running}
            stages={runner.stages}
            logs={runner.logs}
            error={runner.error ?? loadError}
            onRun={(req) => void runner.run(req)}
            onCancel={runner.cancel}
            onNew={runner.reset}
            onGo={setZone}
          />
        </section>
        <section id="zone-map" role="tabpanel" aria-labelledby="tab-map" className="zone" data-active={zone === "map"}>
          <MapZone audit={audit} onOpenClaim={openClaim} />
        </section>
        <section id="zone-audit" role="tabpanel" aria-labelledby="tab-audit" className="zone" data-active={zone === "audit"}>
          <ClaimsZone audit={audit} focus={focus} />
        </section>
      </main>
      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} onLoad={(id) => void load(id)} currentId={audit?.id ?? null} refreshKey={historyKey} />
    </div>
  );
}
