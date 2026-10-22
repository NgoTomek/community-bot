/** Replay pacing for a message: min(4000, 700 + 25 * chars) milliseconds. */
export function messageDelayMs(text: string): number {
  return Math.min(4000, 700 + 25 * text.length);
}
