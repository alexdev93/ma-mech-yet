"use client"

import { createStoreContext } from "../create-store-context"
import { createAppStore } from "./store"

export const {
  Provider: AppStoreProvider,
  useStore: useAppStore,
  useStoreApi: useAppStoreApi,
} = createStoreContext({
  name: "AppStore",
  create: createAppStore,
  onMount: (store) => {
    void store.persist.rehydrate()
  },
})
