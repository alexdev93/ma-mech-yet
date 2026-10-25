import { type NextRequest, NextResponse } from "next/server"

import { clearedCookieOptions, SESSION_COOKIE } from "@/server/auth/session"
import { logout } from "@/server/services/auth-service"

export async function POST(request: NextRequest): Promise<NextResponse> {
  // CSRF: only accept logout posted from our own pages. SameSite=Lax already blocks
  // cross-site POSTs from carrying the cookie; this check covers older browsers too.
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return new NextResponse(null, { status: 403 })
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (token) {
    await logout(token).catch((error: unknown) => console.error("[auth] Logout failed", error))
  }
  const response = NextResponse.redirect(new URL("/login", request.url), 303)
  response.cookies.set(SESSION_COOKIE, "", clearedCookieOptions)
  return response
}
