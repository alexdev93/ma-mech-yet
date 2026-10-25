import "server-only"
import { cookies } from "next/headers"

import type { SessionUser } from "@/server/repositories/auth-repository"
import { getSessionUser, LOGIN_ATTEMPT_TTL_MS } from "@/server/services/auth-service"

const isProduction = process.env.NODE_ENV === "production"

// __Host- cookies must be Secure with Path=/ and no Domain, which pins them to this exact origin.
// Browsers reject Secure cookies over plain http, so development drops the prefix.
const prefix = isProduction ? "__Host-" : ""
export const SESSION_COOKIE = `${prefix}session`
export const LOGIN_STATE_COOKIE = `${prefix}tg-login`

// Lax, not Strict: Telegram's redirect back to the callback is a cross-site top-level navigation.
const baseCookie = { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" } as const

export const sessionCookieOptions = (expires: Date) => ({ ...baseCookie, expires })
export const loginStateCookieOptions = { ...baseCookie, maxAge: LOGIN_ATTEMPT_TTL_MS / 1000 }
// Clearing needs the same attributes, or browsers ignore it for __Host- cookies.
export const clearedCookieOptions = { ...baseCookie, maxAge: 0 }

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return token ? getSessionUser(token) : null
}
