import { AlertTriangle, Send } from "lucide-react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getCurrentUser } from "@/server/auth/session"
import type { LoginError } from "@/server/services/auth-service"
import { PageHeader } from "@/shared/components/page-header"

export const metadata: Metadata = { title: "Sign up or sign in" }

const ERROR_MESSAGES: Record<LoginError, string> = {
  unavailable: "Telegram login is temporarily unavailable. Please try again later.",
  denied: "You cancelled the Telegram login.",
  failed: "We couldn't verify your Telegram login. Please try again.",
  expired:
    "Your login link expired or was opened in a different browser. Please start again from this page.",
}

const STEPS = [
  "Click Continue with Telegram below.",
  "On Telegram's page, enter your phone number, or confirm if you're already logged in.",
  "Approve the request in your Telegram app.",
  "Choose whether to share your phone number and allow bot messages (both optional), then accept.",
  "You'll come back here to your profile automatically. Stay in this browser tab.",
] as const

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <PageHeader
        title="Sign up or sign in"
        description="New here? Your account is created the first time you continue with Telegram."
      />
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
          You'll confirm the login in Telegram and come back here. We receive your name, username,
          profile photo and Telegram ID. Sharing your phone number and letting our bot message you
          are optional.
        </CardDescription>
        {message && (
          <p role="alert" className="text-destructive flex items-start gap-2 pt-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {message}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </CardContent>
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
