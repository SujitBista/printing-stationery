import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hash, verify, argon2id, type HashOptions } from "argon2";

/** Argon2id parameters chosen for interactive login on a typical API server. */
export const ARGON2_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
};

const SESSION_TOKEN_BYTES = 32;

let dummyPasswordHashPromise: Promise<string> | undefined;

function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHashPromise) {
    dummyPasswordHashPromise = hash(
      "dummy-password-for-timing-safety",
      ARGON2_OPTIONS,
    );
  }
  return dummyPasswordHashPromise;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Verifies a password, or runs a dummy verify when no hash exists,
 * to reduce username enumeration via response timing.
 */
export async function verifyPasswordOrDummy(
  passwordHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!passwordHash) {
    const dummyHash = await getDummyPasswordHash();
    await verifyPassword(dummyHash, password);
    return false;
  }

  return verifyPassword(passwordHash, password);
}

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeEqualString(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}
