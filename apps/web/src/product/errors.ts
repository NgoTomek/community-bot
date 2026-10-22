/** Prefer the message Supabase put on the error, including "Wrong passcode". */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return "Something went wrong";
}

export function isWrongPasscode(message: string): boolean {
  return /wrong passcode/i.test(message);
}
