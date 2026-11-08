"use client";

import { useCallback, useRef, useState } from "react";
import type { AgentId, AgentLog, AuditRecord, RunEvent, StageStatus } from "@/lib/types";
import { AGENTS } from "@/lib/types";

export type RunRequest = { mode: "url"; url: string } | { mode: "text" | "file"; text: string; title?: string };

const idleStages = () => Object.fromEntries(AGENTS.map((a) => [a.id, "pending"])) as Record<AgentId, StageStatus>;

export function useAuditRun(onResult: (a: AuditRecord) => void) {
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<Record<AgentId, StageStatus>>(idleStages);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handle = useCallback(
    (e: RunEvent) => {
      if (e.type === "stage") setStages((s) => ({ ...s, [e.agent]: e.status }));
      else if (e.type === "log") setLogs((l) => [...l, e.log]);
      else if (e.type === "error") setError(e.message);
      else if (e.type === "result") onResult(e.audit);
    },
    [onResult],
  );

  const run = useCallback(
    async (req: RunRequest) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setRunning(true);
      setError(null);
      setLogs([]);
      setStages(idleStages());
      try {
        const res = await fetch("/api/audits", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(req),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed (${res.status}).`);
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const data = frame.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("");
            if (data) handle(JSON.parse(data) as RunEvent);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError((err as Error).message);
      } finally {
        setRunning(false);
        setStages((s) => {
          const next = { ...s };
          for (const k of Object.keys(next) as AgentId[]) if (next[k] === "running") next[k] = "error";
          return next;
        });
      }
    },
    [handle],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => {
    setStages(idleStages());
    setLogs([]);
    setError(null);
  }, []);

  return { running, stages, logs, error, run, cancel, reset };
}
