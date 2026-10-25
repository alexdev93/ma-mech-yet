import { LogOut, RefreshCw, Send, ShieldOff, Trash2 } from "lucide-react"
import type { Metadata } from "next"
import Image from "next/image"
import { redirect } from "next/navigation"
import { type ReactNode, Suspense } from "react"

import { Badge } from "@/components/ui/badge"
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
import { getAuthEnv } from "@/server/config/env"
import type { SessionUser } from "@/server/repositories/auth-repository"
import { getActiveSessionCount } from "@/server/services/auth-service"
import { PageHeader } from "@/shared/components/page-header"

export const metadata: Metadata = { title: "Your profile" }

const dateTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})
const formatDate = (date: Date) => `${dateTime.format(date)} UTC`

export default function AccountPage() {
  return (
    <>
      <PageHeader
        title="Your profile"
        description="Everything we received from Telegram when you signed in."
      />
      <Suspense
        fallback={<div aria-busy="true" className="bg-muted h-56 animate-pulse rounded-xl" />}
      >
        <AccountCard />
      </Suspense>
    </>
  )
}

async function AccountCard() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const details: ReadonlyArray<readonly [string, ReactNode]> = [
    ["Full name", user.name ?? "Not provided"],
    [
      "Username",
      user.username ? (
        <a
          key="username"
          href={`https://t.me/${user.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          @{user.username}
        </a>
      ) : (
        "Not set"
      ),
    ],
    ["Phone number", user.phoneNumber ?? "Not shared"],
    ["Telegram ID", user.telegramUserId ?? "Not provided"],
    ["Profile photo", user.pictureUrl ? "Shared" : "Not shared"],
    [
      "Bot messages",
      user.botAccessGranted ? (
        <Badge key="bot">Allowed</Badge>
      ) : (
        // Telegram doesn't report this permission back at login, so we can't tell yet.
        <span key="bot" className="grid gap-1">
          <Badge variant="secondary">Not confirmed yet</Badge>
          <span className="text-muted-foreground text-xs font-normal">
            If you allowed it in Telegram, our bot can already message you. We'll confirm it the
            first time the bot gets in touch.
          </span>
        </span>
      ),
    ],
    ...(user.botAccessGrantedAt
      ? [["Allowed since", formatDate(user.botAccessGrantedAt)] as const]
      : []),
    ["Member since", formatDate(user.linkedAt)],
    ["Last sign-in", formatDate(user.lastLoginAt)],
  ]

  const botUsername = getAuthEnv().TELEGRAM_BOT_USERNAME

  return (
    <div className="grid gap-6">
      <ProfileCard user={user} details={details} botUsername={botUsername} />
      <SecurityCard userId={user.userId} />
    </div>
  )
}

function ProfileCard({
  user,
  details,
  botUsername,
}: {
  user: SessionUser
  details: ReadonlyArray<readonly [string, ReactNode]>
  botUsername: string | undefined
}) {
  return (
    <Card className="max-w-lg">
      <CardHeader className="flex flex-row items-center gap-4">
        {user.pictureUrl ? (
          // Telegram serves the photo; unoptimized avoids proxying it through our server.
          <Image
            src={user.pictureUrl}
            alt={`${user.name ?? "Your"} profile photo`}
            width={72}
            height={72}
            unoptimized
            className="size-18 rounded-full object-cover"
          />
        ) : (
          <div className="bg-muted text-muted-foreground flex size-18 items-center justify-center rounded-full text-2xl font-semibold">
            {(user.name ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="grid gap-1.5">
          <CardTitle className="text-xl">{user.name ?? "Telegram user"}</CardTitle>
          <CardDescription>Signed in with Telegram.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          {/* Signing in again refreshes every detail from Telegram. Plain link: never prefetched. */}
          <a href="/auth/telegram/start?returnTo=/account">
            <RefreshCw /> Refresh from Telegram
          </a>
        </Button>
        {!user.botAccessGranted && botUsername && (
          <Button asChild variant="outline" size="sm">
            <a href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer">
              <Send /> Open @{botUsername}
            </a>
          </Button>
        )}
        <form action="/auth/logout" method="post">
          <Button type="submit" variant="outline" size="sm">
            <LogOut /> Log out
          </Button>
        </form>
      </CardFooter>
    </Card>
  )
}

async function SecurityCard({ userId }: { userId: string }) {
  const activeSessions = await getActiveSessionCount(userId)

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Security</CardTitle>
        <CardDescription>
          You're signed in on {activeSessions} {activeSessions === 1 ? "device" : "devices"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <form action="/auth/logout" method="post">
          <input type="hidden" name="scope" value="all" />
          <Button type="submit" variant="outline" size="sm">
            <ShieldOff /> Sign out everywhere
          </Button>
        </form>
        {/* Two steps without JavaScript: open the disclosure, then confirm. */}
        <details className="rounded-md border p-3">
          <summary className="text-destructive cursor-pointer font-medium">Delete account</summary>
          <p className="text-muted-foreground mt-2">
            This permanently deletes your profile, Telegram link and sessions. Signing in again
            later creates a new, empty account.
          </p>
          <form action="/auth/delete-account" method="post" className="mt-3">
            <input type="hidden" name="confirm" value="delete" />
            <Button type="submit" variant="destructive" size="sm">
              <Trash2 /> Permanently delete my account
            </Button>
          </form>
        </details>
      </CardContent>
    </Card>
  )
}
