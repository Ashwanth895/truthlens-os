import { NextResponse } from "next/server";
import { z } from "zod";
import { listAudits } from "@/lib/db";
import { IngestError, scrapeUrl } from "@/lib/ingest";
import { runAudit } from "@/lib/orchestrator";
import type { RunEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ audits: await listAudits() });
}

const Body = z.union([
  z.object({ mode: z.literal("url"), url: z.string().min(4).max(2048) }),
  z.object({ mode: z.enum(["text", "file"]), text: z.string().min(1).max(1_500_000), title: z.string().max(200).optional() }),
]);

/** Runs an audit and streams agent progress as Server-Sent Events. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send either { mode: 'url', url } or { mode: 'text', text }." }, { status: 400 });
  const body = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: RunEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          open = false;
        }
      };
      const ping = setInterval(() => open && controller.enqueue(encoder.encode(": ping\n\n")), 15_000);
      try {
        let input;
        if (body.mode === "url") {
          send({ type: "stage", agent: "ingest", status: "running", detail: "fetching" });
          send({ type: "log", log: { t: 0, agent: "ingest", level: "info", message: `Fetching ${body.url}` } });
          const page = await scrapeUrl(body.url);
          input = { text: page.text, title: page.title, sourceType: "url" as const, sourceUrl: page.url };
        } else {
          input = { text: body.text, title: body.title, sourceType: body.mode };
        }
        const audit = await runAudit(input, send);
        send({ type: "result", audit });
      } catch (err) {
        const message = err instanceof IngestError || err instanceof Error ? err.message : "Unexpected error.";
        send({ type: "error", message });
      } finally {
        clearInterval(ping);
        open = false;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
