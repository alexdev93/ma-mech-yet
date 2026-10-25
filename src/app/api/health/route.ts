import { connection, NextResponse } from "next/server"

import type { HealthResponse } from "@/shared/schemas/health"

export async function GET(): Promise<NextResponse<HealthResponse>> {
  // Opt out of prerendering so every probe reports a fresh timestamp.
  await connection()
  return NextResponse.json(
    { status: "ok", timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  )
}
