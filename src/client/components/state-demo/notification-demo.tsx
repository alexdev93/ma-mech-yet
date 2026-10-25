"use client"

import { BellRing, RotateCcw } from "lucide-react"

import { type NotifyInput, selectNotify, selectReset, useAppStore } from "@/client/stores/app-store"
import { Button } from "@/components/ui/button"

const PRESETS: ReadonlyArray<{ label: string; input: NotifyInput }> = [
  {
    label: "Success",
    input: { title: "Saved", description: "Everything is up to date.", variant: "success" },
  },
  {
    label: "Error",
    input: { title: "Something failed", description: "Please try again.", variant: "error" },
  },
  {
    label: "Persistent",
    input: { title: "Sticky note", description: "Stays until dismissed.", duration: 0 },
  },
]

export function NotificationDemo() {
  const notify = useAppStore(selectNotify)
  const reset = useAppStore(selectReset)

  return (
    <div className="flex flex-wrap gap-2">
      {PRESETS.map(({ label, input }) => (
        <Button key={label} variant="outline" onClick={() => notify(input)}>
          <BellRing /> {label}
        </Button>
      ))}
      <Button variant="ghost" onClick={reset}>
        <RotateCcw /> Reset whole store
      </Button>
    </div>
  )
}
