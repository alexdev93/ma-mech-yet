import { AlertTriangle, Send } from "lucide-react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/server/auth/session"
import type { LoginError } from "@/server/services/auth-service"
import { PageHeader } from "@/shared/components/page-header"

export const metadata: Metadata = { title: "Sign in" }

const ERROR_MESSAGES: Record<LoginError, string> = {
  unavailable: "Telegram login is temporarily unavailable. Please try again later.",
  denied: "You cancelled the Telegram login.",
  failed: "We couldn't verify your Telegram login. Please try again.",
  expired: "Your login link expired or was already used. Please start again.",
  permissions:
    "Signing in requires sharing your phone number and allowing our bot to message you. Please try again and allow both.",
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <PageHeader title="Sign in" description="Use your Telegram account to sign in." />
      <Suspense
        fallback={<div aria-busy="true" className="bg-muted h-44 animate-pulse rounded-xl" />}
      >
        <LoginCard searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function LoginCard({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const [{ error }, user] = await Promise.all([
    searchParams,
    // A broken session lookup must not block signing in again.
    getCurrentUser().catch(() => null),
  ])
  if (user) redirect("/account")

  const message =
    typeof error === "string" && error in ERROR_MESSAGES
      ? ERROR_MESSAGES[error as LoginError]
      : null

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Continue with Telegram</CardTitle>
        <CardDescription>
          You'll confirm the login in Telegram and come back here. Telegram will ask you to share
          your name, username, profile photo, Telegram ID and phone number, and to let our bot
          message you. All of these are required to sign in.
        </CardDescription>
        {message && (
          <p role="alert" className="text-destructive flex items-center gap-2 pt-2 text-sm">
            <AlertTriangle className="size-4 shrink-0" /> {message}
          </p>
        )}
      </CardHeader>
      <CardFooter>
        <Button asChild>
          {/* A plain link: the start route has side effects, so it must never be prefetched. */}
          <a href="/auth/telegram/start">
            <Send /> Continue with Telegram
          </a>
        </Button>
      </CardFooter>
    </Card>
  )
}
