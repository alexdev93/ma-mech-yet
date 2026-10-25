"use client"

import { selectCount, useAppStore } from "@/client/stores/app-store"

export function CounterDisplay() {
  const count = useAppStore(selectCount)

  return (
    <output aria-live="polite" className="text-4xl font-semibold tabular-nums">
      {count}
    </output>
  )
}
