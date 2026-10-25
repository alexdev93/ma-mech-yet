export { useShallow } from "zustand/react/shallow"
export { AppStoreProvider, useAppStore, useAppStoreApi } from "./provider"
export * from "./selectors"
export type { CounterSlice } from "./slices/counter-slice"
export type {
  AppNotification,
  NotificationVariant,
  NotifyInput,
} from "./slices/notifications-slice"
export type { Density, PreferencesState } from "./slices/preferences-slice"
export { type AppStore, createAppStore, initialAppData } from "./store"
export type { AppActions, AppData, AppSliceCreator, AppState } from "./types"
