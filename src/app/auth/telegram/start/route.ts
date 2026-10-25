import { type NextRequest, NextResponse } from "next/server"

import { LOGIN_STATE_COOKIE, loginStateCookieOptions } from "@/server/auth/session"
import { startLogin } from "@/server/services/auth-service"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const result = await startLogin(request.nextUrl.searchParams.get("returnTo")).catch(
    (error: unknown) => {
      console.error("[auth] Could not start login", error)
      return { ok: false, error: "unavailable" } as const
    },
  )
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/login?error=${result.error}`, request.url), 303)
  }
  const response = NextResponse.redirect(result.data.url, 303)
  response.cookies.set(LOGIN_STATE_COOKIE, result.data.state, loginStateCookieOptions)
  response.headers.set("Cache-Control", "no-store")
  return response
}
