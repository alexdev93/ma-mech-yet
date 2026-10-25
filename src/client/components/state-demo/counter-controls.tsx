"use client"

import { Minus, Plus, RotateCcw } from "lucide-react"

import { selectCounterActions, useAppStore, useShallow } from "@/client/stores/app-store"
import { Button } from "@/components/ui/button"

export function CounterControls() {
  const { increment, decrement, resetCount } = useAppStore(useShallow(selectCounterActions))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon" aria-label="Decrement" onClick={() => decrement()}>
        <Minus />
      </Button>
      <Button variant="outline" size="icon" aria-label="Increment" onClick={() => increment()}>
        <Plus />
      </Button>
      <Button variant="outline" size="sm" onClick={() => increment(10)}>
        +10
      </Button>
      <Button variant="ghost" size="sm" onClick={resetCount}>
        <RotateCcw /> Reset
      </Button>
    </div>
  )
}
