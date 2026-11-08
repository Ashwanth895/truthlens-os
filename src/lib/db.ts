import "server-only";
import { PrismaClient } from "@prisma/client";
import type { AgentLog, AuditListItem, AuditRecord, AuditResult, EngineId } from "./types";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

type Row = Awaited<ReturnType<typeof prisma.audit.findFirstOrThrow>>;

export function toRecord(row: Row): AuditRecord {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    title: row.title,
    sourceType: row.sourceType as AuditRecord["sourceType"],
    sourceUrl: row.sourceUrl,
    wordCount: row.wordCount,
    engine: row.engine as EngineId,
    durationMs: row.durationMs,
    input: row.input,
    result: JSON.parse(row.result) as AuditResult,
    logs: JSON.parse(row.logs) as AgentLog[],
  };
}

export async function saveAudit(a: Omit<AuditRecord, "id" | "createdAt">): Promise<AuditRecord> {
  const row = await prisma.audit.create({
    data: {
      title: a.title.slice(0, 200),
      sourceType: a.sourceType,
      sourceUrl: a.sourceUrl,
      wordCount: a.wordCount,
      engine: a.engine,
      durationMs: a.durationMs,
      credibility: a.result.summary.credibilityScore,
      biasIndex: a.result.summary.biasIndex,
      input: a.input,
      result: JSON.stringify(a.result),
      logs: JSON.stringify(a.logs),
    },
  });
  return toRecord(row);
}

export async function listAudits(limit = 50): Promise<AuditListItem[]> {
  const rows = await prisma.audit.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, createdAt: true, title: true, sourceType: true, wordCount: true, engine: true, credibility: true, biasIndex: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), engine: r.engine as EngineId }));
}
