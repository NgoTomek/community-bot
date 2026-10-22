// Next 16 proxy (formerly middleware). Runs before rendering so these responses get REAL HTTP statuses.
// Why: app/loading.tsx wraps every page in Suspense, so a redirect()/notFound() thrown by the page
// arrives after the 200 shell is streamed (the browser still ends up in the right place, but curl,
// crawlers and link previews see 200). This proxy only adds early, cheap checks; the page-level guards
// (lib/auth requireTeamPage, the status check in app/e/[slug]/page.tsx) stay the source of truth.
//   /approvals*, /manage/*  no session cookie        -> 307 /login?next=<path>
//   /e/<slug>               not published/cancelled  -> 404 (proposed, renegotiating, rejected)
import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/store";

const SESSION_COOKIE = "cb_session"; // keep in sync with lib/session.ts

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname === "/approvals" || pathname.startsWith("/approvals/") || pathname.startsWith("/manage/")) {
    if (!req.cookies.get(SESSION_COOKIE)?.value) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url, 307);
    }
    return NextResponse.next();
  }

  const m = pathname.match(/^\/e\/([^/]+)\/?$/);
  if (m) {
    try {
      const key = decodeURIComponent(m[1]);
      const store = getStore();
      const ev = (/^[0-9a-f-]{36}$/i.test(key) ? await store.getEvent(key) : null) ?? (await store.getEventBySlug(key));
      if (!ev || (ev.status !== "published" && ev.status !== "cancelled")) {
        // Rewrite to a path no route matches: Next renders the not-found page with a 404 status.
        return NextResponse.rewrite(new URL("/_event-not-found", req.url), { status: 404 });
      }
    } catch {
      // Store hiccup: let the page decide.
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/approvals", "/approvals/:path*", "/manage/:path*", "/e/:slug"],
};
