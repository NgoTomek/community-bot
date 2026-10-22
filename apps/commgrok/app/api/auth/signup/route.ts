import { z } from "zod";
import { handle, json, readJson } from "@/lib/api";
import { DuplicateError, getStore } from "@/lib/store";
import { hashPassword } from "@/lib/password";
import { setSessionCookie } from "@/lib/session";
import { defaultRedirect, safeNext } from "@/lib/auth";
import { ORGANISER_INVITE_CODE } from "@/lib/config";
import { HttpError } from "@/lib/workflow";

// Organiser accounts only. Guests never sign up: they RSVP with name + email on the event page.
const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(60, "Name is too long"),
  email: z.email("Enter a valid email").max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  inviteCode: z.string().max(200).optional(),
  teamId: z.string().max(100).nullable().optional(),
  next: z.string().optional(),
});

const BAD_CODE = "That invite code isn't right. Ask an organiser for it.";

/** Trimmed, case-insensitive match against ORGANISER_INVITE_CODE. */
function inviteCodeOk(code: string | undefined) {
  const given = (code ?? "").trim().toLowerCase();
  return given.length > 0 && given === ORGANISER_INVITE_CODE.trim().toLowerCase();
}

export function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const parsed = schema.safeParse(body);
    // The invite code gates everything else, so check it first.
    const rawCode = typeof body?.inviteCode === "string" ? body.inviteCode : undefined;
    if (!inviteCodeOk(rawCode)) throw new HttpError(400, BAD_CODE);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the form");
    const { name, email, password, next } = parsed.data;
    const teamId = parsed.data.teamId || null;
    if (!teamId) throw new HttpError(400, "Pick your team");
    const store = getStore();
    if (!(await store.listTeams()).some((t) => t.id === teamId)) throw new HttpError(400, "Unknown team");
    if (await store.getUserByEmail(email.toLowerCase())) throw new HttpError(409, "Email already in use — log in instead?");
    let user;
    try {
      user = await store.insertUser({ email: email.toLowerCase(), name, team_id: teamId, password_hash: hashPassword(password) });
    } catch (e) {
      if (e instanceof DuplicateError) throw new HttpError(409, "Email already in use — log in instead?");
      throw e;
    }
    await setSessionCookie(user.id);
    return json({ ok: true, redirect: safeNext(next, defaultRedirect(user.team_id)) });
  });
}
