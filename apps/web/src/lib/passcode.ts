/** The organiser passcode, asked once and kept for this tab only. */
const KEY = "cb.passcode";

export function readPasscode(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function writePasscode(value: string | null): void {
  try {
    if (!value || !value.trim()) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, value.trim());
  } catch {
    /* private mode: the passcode lasts for this page only */
  }
}
