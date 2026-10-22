/** Approval and inbox links for the phone app. This web app does not serve those routes. */
export function phoneTarget(kind: "r" | "inbox", token: string): { text: string; unset: boolean } {
  const path = kind === "r" ? `/r/${token}` : `/inbox/${token}`;
  const base = import.meta.env.VITE_PHONE_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  if (!base) return { text: path, unset: true };
  return { text: `${base}${path}`, unset: false };
}
