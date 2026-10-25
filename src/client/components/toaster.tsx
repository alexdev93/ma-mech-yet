"use client"

import { X } from "lucide-react"
import { useEffect } from "react"

import {
  type AppNotification,
  type NotificationVariant,
  selectDismiss,
  selectNotifications,
  useAppStore,
} from "@/client/stores/app-store"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const VARIANT_CLASSES: Record<NotificationVariant, string> = {
  default: "",
  success: "border-emerald-500/50",
  error: "border-destructive/50",
}

export function Toaster() {
  const notifications = useAppStore(selectNotifications)

  return (
    <section
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-96"
    >
      {notifications.map((notification) => (
        <Toast key={notification.id} notification={notification} />
      ))}
    </section>
  )
}

function Toast({ notification }: { notification: AppNotification }) {
  const dismiss = useAppStore(selectDismiss)
  const { id, duration, title, description, variant } = notification

  useEffect(() => {
    if (duration <= 0) return
    const timer = setTimeout(() => dismiss(id), duration)
    return () => clearTimeout(timer)
  }, [id, duration, dismiss])

  return (
    <div
      className={cn(
        "bg-card text-card-foreground pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg",
        VARIANT_CLASSES[variant],
      )}
    >
      <div className="flex-1 space-y-1">
        <p className={cn("text-sm font-medium", variant === "error" && "text-destructive")}>
          {title}
        </p>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => dismiss(id)}>
        <X />
      </Button>
    </div>
  )
}
