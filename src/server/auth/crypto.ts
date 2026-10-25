import "server-only"
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/** 256 bits of CSPRNG output, base64url encoded. Used for state, nonce, PKCE and session tokens. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url")
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url")
}

/** PKCE S256 code challenge (RFC 7636). */
export const pkceChallenge = sha256

/** Constant-time string comparison. Hashing first equalizes the lengths. */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b)))
}
