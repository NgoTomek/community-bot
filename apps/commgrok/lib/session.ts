// Signed session cookie for email + password accounts.
// Cookie `cb_session` = base64url(JSON{uid, exp}) + "." + base64url(HMAC-SHA256(payload, AUTH_SECRET)).
// getSession() verifies the signature and expiry, then loads the user from the store,
// so a deleted user (or a tampered cookie) is simply treated as logged out.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getStore } from "./store";

export const SESSION_COOKIE = "cb_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const DEV_SECRET = "commgrok-dev-only-secret-change-me-in-production";

export interface Session {
  userId: string;
  name: string;
  email: string;
  /**
   * Every account is an organiser on a team. null only for legacy accounts made before that rule;
   * lib/auth (requireTeamPage) and lib/api (requireSession) send those to /join to pick a team.
   */
  teamId: string | null;
}

function secret() {
  return process.env.AUTH_SECRET || DEV_SECRET;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Math.floor(now / 1000) + MAX_AGE }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns the user id if the token is authentic and unexpired. */
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = Buffer.from(sign(payload), "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof v?.uid !== "string" || typeof v?.exp !== "number") return null;
    if (v.exp * 1000 < Date.now()) return null;
    return v.uid;
  } catch {
    return null;
  }
}

export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  const uid = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  try {
    const user = await getStore().getUserById(uid);
    if (!user) return null;
    return { userId: user.id, name: user.name, email: user.email, teamId: user.team_id ?? null };
  } catch {
    return null;
  }
});

async function isHttps() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return (process.env.NEXT_PUBLIC_SITE_URL || "").startsWith("https://") && process.env.NODE_ENV === "production";
}

/** Route handlers / server actions only. */
export async function setSessionCookie(userId: string) {
  const secure = await isHttps();
  (await cookies()).set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure,
  });
}

/** Route handlers / server actions only. */
export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  // Also clear the legacy unsigned team cookie from older builds.
  if (jar.get("cb_team")) jar.set("cb_team", "", { path: "/", maxAge: 0 });
}
