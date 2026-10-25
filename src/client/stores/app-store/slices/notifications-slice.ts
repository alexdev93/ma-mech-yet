import type { AppSliceCreator } from "../types"

export type NotificationVariant = "default" | "success" | "error"

export type AppNotification = {
  id: string
  title: string
  description?: string
  variant: NotificationVariant
  /** Milliseconds before auto-dismiss. 0 keeps the notification until it is dismissed. */
  duration: number
}

export type NotifyInput = Omit<AppNotification, "id" | "variant" | "duration"> &
  Partial<Pick<AppNotification, "variant" | "duration">>

export type NotificationsState = {
  notifications: AppNotification[]
}

export type NotificationsActions = {
  /** Shows a notification and returns its id. */
  notify: (input: NotifyInput) => string
  dismiss: (id: string) => void
  clearNotifications: () => void
}

export type NotificationsSlice = NotificationsState & NotificationsActions

export const MAX_NOTIFICATIONS = 5
export const DEFAULT_NOTIFICATION_DURATION = 4000

export const initialNotificationsState: NotificationsState = { notifications: [] }

export const createNotificationsSlice: AppSliceCreator<NotificationsSlice> = (set) => ({
  ...initialNotificationsState,
  notify: (input) => {
    const notification: AppNotification = {
      variant: "default",
      duration: DEFAULT_NOTIFICATION_DURATION,
      ...input,
      id: crypto.randomUUID(),
    }
    set(
      (state) => ({
        notifications: [...state.notifications, notification].slice(-MAX_NOTIFICATIONS),
      }),
      undefined,
      "notifications/notify",
    )
    return notification.id
  },
  dismiss: (id) =>
    set(
      (state) => ({ notifications: state.notifications.filter((item) => item.id !== id) }),
      undefined,
      "notifications/dismiss",
    ),
  clearNotifications: () => set(initialNotificationsState, undefined, "notifications/clear"),
})
