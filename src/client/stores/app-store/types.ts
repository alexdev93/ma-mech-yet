import type { StateCreator } from "zustand"

import type { CounterSlice, CounterState } from "./slices/counter-slice"
import type { NotificationsSlice, NotificationsState } from "./slices/notifications-slice"
import type { PreferencesSlice, PreferencesState } from "./slices/preferences-slice"

/** Plain data held by the store: what initial state, reset and persistence work with. */
export type AppData = CounterState & PreferencesState & NotificationsState

/** Store-wide actions that don't belong to a single slice. */
export type AppActions = {
  reset: () => void
}

/** The full store: every slice plus store-wide actions. Add new slices here. */
export type AppState = CounterSlice & PreferencesSlice & NotificationsSlice & AppActions

/** Must match the middleware order in store.ts: devtools(persist(...)). */
type AppMiddlewares = [["zustand/devtools", never], ["zustand/persist", unknown]]

/** Type for a slice creator. A slice sees the whole store but returns only its own part. */
export type AppSliceCreator<TSlice> = StateCreator<AppState, AppMiddlewares, [], TSlice>
