import { NextResponse } from "next/server";
import { HttpError } from "./workflow";
import { DuplicateError } from "./store";
import { getSession, type Session } from "./session";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

export function handle(fn: () => Promise<Response>) {
  return fn().catch((e: unknown) => {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof DuplicateError) return json({ error: "That already exists" }, 409);
    console.error(e);
    return json({ error: "Something went wrong" }, 500);
  });
}

/** Any logged-in user. */
export async function requireUser(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Log in first");
  return s;
}

/** Logged-in user who is on a team (approve / edit / cancel / create). */
export async function requireSession(): Promise<Session & { teamId: string }> {
  const s = await requireUser();
  if (!s.teamId) throw new HttpError(403, "Join a team to do this");
  return s as Session & { teamId: string };
}

export function hasApiKey(req: Request) {
  const expected = process.env.PROPOSALS_API_KEY;
  return Boolean(expected) && req.headers.get("x-api-key") === expected;
}

export async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}
