import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { cleanText } from "./text";

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export class IngestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/** Reject non-http(s) URLs and hosts that resolve to private / loopback ranges (SSRF guard). */
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new IngestError("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new IngestError("Only http(s) URLs are supported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new IngestError("Private or local hosts can't be scraped.");
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => {
    throw new IngestError(`Couldn't resolve ${host}.`);
  });
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new IngestError("Private or local hosts can't be scraped.");
  return url;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", copy: "©", reg: "®",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Lightweight readability: drop chrome, prefer <article>/<main>, keep block-level text as paragraphs. */
export function extractArticle(html: string): { title: string; text: string } {
  const titleMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities((titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim());

  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|template|canvas)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside|form|figure|button|select)[\s\S]*?<\/\1>/gi, " ");

  const pick = (tag: string) => {
    const matches = [...body.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map((m) => m[1]);
    return matches.sort((a, b) => b.length - a.length)[0];
  };
  body = pick("article") ?? pick("main") ?? body;

  const blocks: string[] = [];
  const blockRe = /<(p|h[1-6]|li|blockquote|pre|td)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(body))) {
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (text.split(" ").length >= 4) blocks.push(text);
  }
  const text = blocks.length
    ? blocks.join("\n\n")
    : decodeEntities(body.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|section)>/gi, "\n\n").replace(/<[^>]+>/g, " "));
  return { title, text: cleanText(text) };
}

export async function scrapeUrl(raw: string): Promise<{ title: string; text: string; url: string }> {
  let url = await assertPublicUrl(raw.trim());
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    let res: Response | null = null;
    // Follow redirects manually so every hop passes the SSRF guard.
    for (let hop = 0; hop < 5; hop++) {
      res = await fetch(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": "TruthLensOS/2.0 (+source-verification)", accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        url = await assertPublicUrl(new URL(loc, url).toString());
        continue;
      }
      break;
    }
    if (!res || !res.ok) throw new IngestError(`The page returned HTTP ${res?.status ?? "error"}.`, 502);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new IngestError("That page is larger than 5 MB.", 413);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new IngestError("That page is larger than 5 MB.", 413);
    const body = new TextDecoder("utf-8").decode(buf);
    const type = res.headers.get("content-type") ?? "";
    const { title, text } = type.includes("html") || /<html|<body|<p[\s>]/i.test(body)
      ? extractArticle(body)
      : { title: "", text: cleanText(body) };
    if (text.length < 80) throw new IngestError("Couldn't find readable article text on that page.", 422);
    return { title: title || url.hostname, text, url: url.toString() };
  } catch (e) {
    if (e instanceof IngestError) throw e;
    if ((e as Error).name === "AbortError") throw new IngestError("The page took too long to respond.", 504);
    throw new IngestError(`Couldn't fetch that URL: ${(e as Error).message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}
