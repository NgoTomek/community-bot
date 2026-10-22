// Password hashing with node:crypto scrypt. No Next imports, so the local store can use it.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

/** Returns `scrypt$<saltHex>$<hashHex>`. */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    if (expected.length !== KEYLEN) return false;
    const actual = scryptSync(pw, Buffer.from(saltHex, "hex"), KEYLEN);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
