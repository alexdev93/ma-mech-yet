import { type NextRequest, NextResponse } from "next/server"

import { clearedCookieOptions, isSameOrigin, SESSION_COOKIE } from "@/server/auth/session"
import { logout, logoutEverywhere } from "@/server/services/auth-service"

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 })

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (token) {
    const everywhere = (await request.formData().catch(() => null))?.get("scope") === "all"
    await (everywhere ? logoutEverywhere(token) : logout(token)).catch((error: unknown) =>
      console.error("[auth] Logout failed", error),
    )
  }
  const response = NextResponse.redirect(new URL("/login", request.url), 303)
  response.cookies.set(SESSION_COOKIE, "", clearedCookieOptions)
  return response
}
