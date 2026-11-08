import { NextResponse } from "next/server";
import { prisma, toRecord } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await prisma.audit.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  return NextResponse.json({ audit: toRecord(row) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await prisma.audit.deleteMany({ where: { id } });
  if (!res.count) return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
