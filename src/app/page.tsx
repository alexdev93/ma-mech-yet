import { redirect } from "next/navigation"
import { Suspense } from "react"

import { getCurrentUser } from "@/server/auth/session"

// Signing in comes first: visitors go to sign-in, signed-in users to their profile.
export default function HomePage() {
  return (
    <Suspense
      fallback={<div aria-busy="true" className="bg-muted h-44 animate-pulse rounded-xl" />}
    >
      <Gate />
    </Suspense>
  )
}

async function Gate(): Promise<never> {
  const user = await getCurrentUser().catch(() => null)
  redirect(user ? "/account" : "/login")
}
