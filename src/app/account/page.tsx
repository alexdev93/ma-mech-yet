import { LogOut } from "lucide-react"
import type { Metadata } from "next"
import Image from "next/image"
import { redirect } from "next/navigation"
import { Suspense } from "react"

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

export const metadata: Metadata = { title: "Account" }

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" })

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Account" description="Your verified Telegram identity." />
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

  const details = [
    ["Username", user.username ? `@${user.username}` : "Not set"],
    ["Phone", user.phoneNumber ?? "Not shared"],
    ["Telegram ID", user.telegramUserId ?? "Not provided"],
    ["Linked", `${dateFormat.format(user.linkedAt)} (UTC)`],
  ] as const

  return (
    <Card className="max-w-md">
      <CardHeader className="flex flex-row items-center gap-4">
        {user.pictureUrl && (
          // Telegram serves the photo; unoptimized avoids proxying it through our server.
          <Image
            src={user.pictureUrl}
            alt=""
            width={56}
            height={56}
            unoptimized
            className="size-14 rounded-full object-cover"
          />
        )}
        <div className="grid gap-1.5">
          <CardTitle>{user.name ?? "Telegram user"}</CardTitle>
          <CardDescription>Signed in with Telegram.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
          <dt className="text-muted-foreground">Bot messages</dt>
          <dd>
            <Badge variant={user.botAccessGranted ? "default" : "secondary"}>
              {user.botAccessGranted ? "Allowed" : "Not allowed"}
            </Badge>
          </dd>
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
