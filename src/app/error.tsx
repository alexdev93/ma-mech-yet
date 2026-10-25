"use client"

import { Button } from "@/components/ui/button"

type ErrorBoundaryProps = { error: Error & { digest?: string }; reset: () => void }

export default function ErrorBoundary({ reset }: ErrorBoundaryProps) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">An unexpected error occurred. Please try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
