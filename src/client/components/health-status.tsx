"use client"

import { Activity } from "lucide-react"
import { useState } from "react"

import { fetchHealth } from "@/client/services/health-client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { HealthResponse } from "@/shared/schemas/health"
import type { Result } from "@/shared/types/result"

export function HealthStatus() {
  const [result, setResult] = useState<Result<HealthResponse> | null>(null)
  const [pending, setPending] = useState(false)

  async function check() {
    setPending(true)
    setResult(await fetchHealth())
    setPending(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={check} disabled={pending}>
        <Activity />
        {pending ? "Checking…" : "Check /api/health"}
      </Button>
      {result?.ok === true && (
        <Badge variant="outline">
          {result.data.status} · {new Date(result.data.timestamp).toLocaleTimeString()}
        </Badge>
      )}
      {result?.ok === false && <Badge variant="destructive">{result.error}</Badge>}
    </div>
  )
}
