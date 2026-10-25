import { type NextRequest, NextResponse } from "next/server"

import {
  clearedCookieOptions,
  LOGIN_STATE_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/auth/session"
import { completeLogin } from "@/server/services/auth-service"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams
  const result = await completeLogin({
    code: query.get("code"),
    state: query.get("state"),
    error: query.get("error"),
    stateCookie: request.cookies.get(LOGIN_STATE_COOKIE)?.value ?? null,
    previousSessionToken: request.cookies.get(SESSION_COOKIE)?.value ?? null,
  }).catch((error: unknown) => {
    console.error("[auth] Login callback failed", error)
    return { ok: false, error: "failed" } as const
  })

  const target = result.ok ? result.data.returnTo : `/login?error=${result.error}`
  const response = NextResponse.redirect(new URL(target, request.url), 303)
  response.headers.set("Cache-Control", "no-store")
  response.cookies.set(LOGIN_STATE_COOKIE, "", clearedCookieOptions)
  if (result.ok) {
    response.cookies.set(
      SESSION_COOKIE,
      result.data.sessionToken,
      sessionCookieOptions(result.data.expiresAt),
    )
  }
  return response
}
