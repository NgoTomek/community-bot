import { handle, json } from "@/lib/api";
import { clearSessionCookie } from "@/lib/session";

export function POST() {
  return handle(async () => {
    await clearSessionCookie();
    return json({ ok: true, redirect: "/" });
  });
}
