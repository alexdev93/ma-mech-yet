import { Layers } from "lucide-react"
import type { Metadata } from "next"

import { CounterControls } from "@/client/components/state-demo/counter-controls"
import { CounterDisplay } from "@/client/components/state-demo/counter-display"
import { NotificationDemo } from "@/client/components/state-demo/notification-demo"
import { PreferencesPanel } from "@/client/components/state-demo/preferences-panel"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/shared/components/page-header"

export const metadata: Metadata = { title: "Global state" }

export default function StateExamplePage() {
  return (
    <>
      <PageHeader
        title="Global state"
        description="A modular Zustand store built from slices. This page is a Server Component; each card holds small client islands that share one store."
      >
        <Badge variant="secondary">
          <Layers /> Zustand slices
        </Badge>
      </PageHeader>
      <Card>
        <CardHeader>
          <CardTitle>Shared counter</CardTitle>
          <CardDescription>
            The display and the controls are separate components. They share state through the
            store, without props or context plumbing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <CounterDisplay />
          <CounterControls />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Persisted preferences</CardTitle>
          <CardDescription>
            Only this slice is saved, and it is restored after mount.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesPanel />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Any client component can call notify(). The Toaster in the root providers renders them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationDemo />
        </CardContent>
      </Card>
    </>
  )
}
