import { LogOut } from "lucide-react"
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
      <Badge key="bot" variant={user.botAccessGranted ? "default" : "secondary"}>
        {user.botAccessGranted ? "Allowed" : "Not allowed"}
      </Badge>,
    ],
    ["Allowed since", user.botAccessGrantedAt ? formatDate(user.botAccessGrantedAt) : "—"],
    ["Member since", formatDate(user.linkedAt)],
    ["Last sign-in", formatDate(user.lastLoginAt)],
  ]

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
      <CardFooter>
        <form action="/auth/logout" method="post">
          <Button type="submit" variant="outline" size="sm">
            <LogOut /> Log out
          </Button>
        </form>
      </CardFooter>
    </Card>
  )
}
