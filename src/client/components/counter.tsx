"use client"

import { Minus, Plus, RotateCcw } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = useState(initial)

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="icon"
        aria-label="Decrement"
        onClick={() => setCount((c) => c - 1)}
      >
        <Minus />
      </Button>
      <output aria-live="polite" className="min-w-12 text-center text-2xl font-semibold tabular-nums">
        {count}
      </output>
      <Button
        variant="outline"
        size="icon"
        aria-label="Increment"
        onClick={() => setCount((c) => c + 1)}
      >
        <Plus />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setCount(initial)}>
        <RotateCcw />
        Reset
      </Button>
    </div>
  )
}
