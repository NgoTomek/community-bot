import type { FetchedPage } from "@community-bots/core/backends";

const FETCH_TIMEOUT_MS = 10_000;
const TEXT_CAP = 12_000;
const MAX_EXTRA_LINKS = 4;
const USER_AGENT = "CommunityBots/0.1";

/** Path segments that are login walls or personal profiles, not organisation pages. */
const SKIP_SEGMENTS = new Set(["login", "signup", "in", "personal-profile"]);

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

function skipPath(pathname: string): boolean {
  return pathname
    .toLowerCase()
    .split("/")
    .filter(Boolean)
    .some((part) => SKIP_SEGMENTS.has(part));
}

function asHttpUrl(href: string, base: string): URL | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function stripHtml(html: string): { title: string | null; text: string; hrefs: string[] } {
  const titleRaw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const title = titleRaw ? decodeEntities(titleRaw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() || null : null;

  const hrefs = [...html.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(
    (m) => m[1] ?? m[2] ?? "",
  );

  const withoutChrome = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ");

  const text = decodeEntities(withoutChrome.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TEXT_CAP);

  return { title, text, hrefs };
}

async function fetchHtml(url: string): Promise<{ finalUrl: string; html: string } | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/html|text\/plain/i.test(ct)) return null;
    const html = await res.text();
    return { finalUrl: res.url || url, html };
  } catch {
    return null;
  }
}

function extraOrgLinks(hrefs: string[], pageUrl: string, startOrigin: string, seen: Set<string>): string[] {
  const out: string[] = [];
  for (const href of hrefs) {
    const url = asHttpUrl(href, pageUrl);
    if (!url) continue;
    if (url.origin !== startOrigin) continue;
    if (skipPath(url.pathname)) continue;
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= MAX_EXTRA_LINKS) break;
  }
  return out;
}

/**
 * Fetch a public page and up to 4 same-site organisation links.
 * Never throws: a failed fetch is skipped.
 */
export async function fetchPublicPages(startUrl: string): Promise<FetchedPage[]> {
  const start = asHttpUrl(startUrl, startUrl);
  if (!start) return [];

  const seen = new Set<string>([start.toString()]);
  const pages: FetchedPage[] = [];

  const first = await fetchHtml(start.toString());
  if (!first) return [];

  const parsed = stripHtml(first.html);
  pages.push({ url: first.finalUrl, title: parsed.title, text: parsed.text });

  const extras = extraOrgLinks(parsed.hrefs, first.finalUrl, start.origin, seen);
  for (const url of extras) {
    const next = await fetchHtml(url);
    if (!next) continue;
    const page = stripHtml(next.html);
    pages.push({ url: next.finalUrl, title: page.title, text: page.text });
  }

  return pages;
}
