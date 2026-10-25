import "server-only"
import { cookies } from "next/headers"
import type { NextRequest } from "next/server"

import type { SessionUser } from "@/server/repositories/auth-repository"
import { getSessionUser, LOGIN_ATTEMPT_TTL_MS } from "@/server/services/auth-service"
import { SESSION_COOKIE } from "./cookie-names"

export { LOGIN_STATE_COOKIE, SESSION_COOKIE } from "./cookie-names"

const isProduction = process.env.NODE_ENV === "production"

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

/**
 * CSRF check for state-changing POST routes: the request must come from one of our own pages.
 * SameSite=Lax already keeps the cookie off cross-site POSTs; this also covers older browsers.
 */
export function isSameOrigin(request: NextRequest): boolean {
  return request.headers.get("origin") === request.nextUrl.origin
}

/** The client address as reported by the hosting proxy (Vercel sets x-real-ip), if any. */
export function clientIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  )
}
