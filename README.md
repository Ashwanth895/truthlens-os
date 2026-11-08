# TruthLens OS

Autonomous source verification and bias mapping. Paste text or a URL; a pipeline of agents
pulls out atomic claims, scores each one, maps framing, voices and emotional language, and
writes a short executive summary. Raw data stays in collapsible drawers until you open it.

## Quick start

```bash
npm install            # also runs `prisma generate`
cp .env.example .env   # DATABASE_URL defaults to a local SQLite file
npx prisma db push     # create the database
npm run dev            # http://localhost:3000
```

Set `ANTHROPIC_API_KEY` in `.env` to run the pipeline on Claude (`claude-opus-5-5` by default,
override with `TRUTHLENS_MODEL`). Without a key the app runs on the **offline heuristic engine**,
and the UI shows which engine produced each audit.

## Workspace (three focus zones)

| Zone | What it shows |
|---|---|
| **1. Ingestion** | Text box with file drop, or a URL scraper. After a run it shows the executive signal: headline, Credibility / Bias / Emotional-intensity scores and 3–5 signals. |
| **2. Constellation Map** | Canvas graph. Frames are hubs, claims (colored by verdict) sit around them, loaded terms orbit outside, and voices form the outer ring. Click a node for details. A collapsible per-paragraph sentiment chart sits below. |
| **3. Audit Logs & Data** | Virtualized claims / opinions table with verdict filters, search and sort, plus a claim detail drawer (rationale, counter-argument, evidence, source context), the agent log and the source text. |

Export from the header: Markdown report, raw JSON, or a share link (`/?audit=<id>`).
Every run is saved; reopen past runs from **History**.

## Agent pipeline

```
ingest → extractor → ┬ verifier     ┬ → synthesizer → archivist
                     └ cartographer ┘   (verifier and cartographer run in parallel)
```

- **Extractor**: splits atomic claims from opinions and collects emotive terms. Long documents are cut into ~5k-word chunks and processed in parallel.
- **Verifier**: labels each claim *Verified Fact*, *Unverified Assertion* or *Contradicted Statement*, with a 0–100 confidence, a rationale and a counter-argument. Claims go in batches of 30, and the shared context is prompt-cached.
- **Cartographer**: frames (Economic, Conflict, Human Interest, …) and voices or perspectives, each linked to claims.
- **Synthesizer**: headline, overview and signals. All scores are computed in code (`src/lib/scoring.ts`), so they are comparable across engines.

On Claude, every agent uses structured outputs (Zod schema), so no free text is parsed. Requests
opt into server-side refusal fallbacks (`fallbacks: "default"`). If a Claude stage fails, that
stage re-runs on the heuristic engine and the audit is labelled **hybrid**. Progress streams to
the UI over Server-Sent Events.

### What the offline engine can and can't do

It runs no external fact-check. In offline mode, **"Verified" means the claim names a source
and gives specific, checkable detail**, and **"Contradicted" means it conflicts with another
statement in the same document** (different figure for the same measure, different vote tally,
or opposite polarity). Every rationale says this. Use the Claude engine for knowledge-based
verification.

## Stack

Next.js 15 (App Router), TypeScript, Tailwind CSS 4, Lucide icons, Prisma 6 (SQLite; switch the
`provider` in `prisma/schema.prisma` to `postgresql` for Postgres), `@anthropic-ai/sdk`.

## Performance notes

- Tab switches, drawers and slide-overs animate only `opacity` and `transform` (plus a
  `grid-template-rows` collapse). Inactive zones use `contain: strict`.
- The claims table renders only the visible rows (fixed 60px rows, transform-positioned).
- The constellation layout is deterministic (ring plus phyllotaxis spirals, no physics). The canvas redraws only when something changes, through `requestAnimationFrame`, and caps the map at 260 claims and 42 terms (the table has all of them).
- Measured on the sample: CLS 0.0004. A 45k-word document takes about 0.6 s offline, and the table scrolls at about 60 fps with 1,221 claims.

## Limits & safety

- 50,000-word cap. Longer input is rejected, not silently truncated.
- The URL scraper accepts only http(s) and refuses hosts that resolve to private, loopback or link-local addresses, checking every redirect hop. It also caps pages at 5 MB with a 15 s timeout.
