import { NextResponse } from "next/server";
import { claudeAvailable, CLAUDE_MODEL } from "@/lib/engines/claude";

export const dynamic = "force-dynamic";

export function GET() {
  const claude = claudeAvailable();
  return NextResponse.json({ engine: claude ? "claude" : "heuristic", model: claude ? CLAUDE_MODEL : null });
}
