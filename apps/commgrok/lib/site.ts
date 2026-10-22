import { headers } from "next/headers";

const PLAIN_HTTP_HOST = /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|\[)|\.local(:\d+)?$/;

/**
 * Public base URL. Always prefers the request's host, so links, QR codes, .ics
 * and API `url` fields work from a phone on the same Wi-Fi or through a tunnel.
 * NEXT_PUBLIC_SITE_URL is only a fallback when there is no request (build time).
 */
export async function getSiteUrl(): Promise<string> {
  const env = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim();
    if (host) {
      const fwd = (h.get("x-forwarded-proto") || "").split(",")[0].trim();
      const insecure = PLAIN_HTTP_HOST.test(host) || (/:\d+$/.test(host) && !/:443$/.test(host));
      // Tunnels are always https at the edge, even if the forwarded proto got lost on the way.
      const tunnel = /\.(trycloudflare\.com|ngrok-free\.app|ngrok\.app|ngrok\.io)(:443)?$/i.test(host);
      const proto = tunnel ? "https" : fwd === "http" || fwd === "https" ? fwd : insecure ? "http" : "https";
      return `${proto}://${host}`;
    }
  } catch {}
  return env || "http://localhost:3000";
}

export const eventPath = (slug: string) => `/e/${slug}`;
