import { z } from "zod";
import { handle, json, readJson } from "@/lib/api";
import { getStore } from "@/lib/store";
import { verifyPassword } from "@/lib/password";
import { setSessionCookie } from "@/lib/session";
import { defaultRedirect, safeNext } from "@/lib/auth";
import { HttpError } from "@/lib/workflow";

const schema = z.object({
  email: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

// Used when the email is unknown, so the response takes about as long as a real check.
const DUMMY_HASH = "scrypt$00000000000000000000000000000000$" + "0".repeat(128);

export function POST(req: Request) {
  return handle(async () => {
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new HttpError(400, "Enter your email and password");
    const { email, password, next } = parsed.data;
    const user = await getStore().getUserByEmail(email.toLowerCase());
    const ok = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, "Wrong email or password");
    await setSessionCookie(user.id);
    return json({ ok: true, redirect: safeNext(next, defaultRedirect(user.team_id)) });
  });
}
