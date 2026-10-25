import { type NextRequest, NextResponse } from "next/server"

import { SESSION_COOKIE } from "@/server/auth/cookie-names"

/**
 * Optimistic check only: no session cookie means no access, so redirect before rendering.
 * The real check (the session exists in the database and hasn't expired) stays in the page.
 */
export default function proxy(request: NextRequest): NextResponse {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next()
  const login = new URL("/login", request.url)
  login.searchParams.set("returnTo", request.nextUrl.pathname)
  return NextResponse.redirect(login)
}

export const config = { matcher: ["/account/:path*"] }
