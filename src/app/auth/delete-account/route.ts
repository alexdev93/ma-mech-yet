import { type NextRequest, NextResponse } from "next/server"

import { clearedCookieOptions, isSameOrigin, SESSION_COOKIE } from "@/server/auth/session"
import { deleteAccount } from "@/server/services/auth-service"

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 })

  // The form must carry an explicit confirmation, so a stray submit can't delete the account.
  const form = await request.formData().catch(() => null)
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token || form?.get("confirm") !== "delete") {
    return NextResponse.redirect(new URL("/account", request.url), 303)
  }

  const deleted = await deleteAccount(token).catch((error: unknown) => {
    console.error("[auth] Account deletion failed", error)
    return false
  })
  const target = deleted ? "/login?deleted=1" : "/account"
  const response = NextResponse.redirect(new URL(target, request.url), 303)
  if (deleted) response.cookies.set(SESSION_COOKIE, "", clearedCookieOptions)
  return response
}
