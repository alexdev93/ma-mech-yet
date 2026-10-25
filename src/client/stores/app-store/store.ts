import { createJSONStorage, devtools, persist } from "zustand/middleware"
import { createStore } from "zustand/vanilla"

import { browserStorage } from "../storage"
import { createCounterSlice, initialCounterState } from "./slices/counter-slice"
import { createNotificationsSlice, initialNotificationsState } from "./slices/notifications-slice"
import {
  createPreferencesSlice,
  initialPreferencesState,
  pickPreferences,
} from "./slices/preferences-slice"
import type { AppData, AppState } from "./types"

export const APP_STORE_KEY = "app-store"
export const APP_STORE_VERSION = 1

export const initialAppData: AppData = {
  ...initialCounterState,
  ...initialPreferencesState,
  ...initialNotificationsState,
}

/** Creates an isolated store. Tests call it directly; the app uses <AppStoreProvider>. */
export function createAppStore(initialData: Partial<AppData> = {}) {
  return createStore<AppState>()(
    devtools(
      persist(
        (set, get, api) => ({
          ...createCounterSlice(set, get, api),
          ...createPreferencesSlice(set, get, api),
          ...createNotificationsSlice(set, get, api),
          ...initialData,
          reset: () => set(initialAppData, undefined, "app/reset"),
        }),
        {
          name: APP_STORE_KEY,
          version: APP_STORE_VERSION,
          storage: createJSONStorage(browserStorage),
          // Inline arrow so the store type is inferred from createStore<AppState>().
          partialize: (state) => pickPreferences(state),
          // Rehydrated after mount by the provider, so server and first client render match.
          skipHydration: true,
        },
      ),
      { name: "AppStore", enabled: process.env.NODE_ENV === "development" },
    ),
  )
}

export type AppStore = ReturnType<typeof createAppStore>
