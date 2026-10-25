"use client"

import { createContext, type ReactNode, useContext, useEffect, useState } from "react"
import { type ExtractState, type StoreApi, useStore } from "zustand"

/** The read-only part of a store. Using it as the constraint keeps every StoreApi<T> assignable. */
type ReadableStore = Pick<StoreApi<unknown>, "getState" | "getInitialState" | "subscribe">

type StoreContextOptions<TStore extends ReadableStore, TInit> = {
  /** Used in error messages and React DevTools, e.g. "AppStore". */
  name: string
  /** Creates a fresh store. Called once per Provider mount, so once per request on the server. */
  create: (initialState: TInit | undefined) => TStore
  /** Runs once in the browser after mount, e.g. to rehydrate persisted state. */
  onMount?: (store: TStore) => void
}

/**
 * Turns a vanilla Zustand store factory into a Provider plus typed hooks.
 * A store per Provider (instead of a module-level singleton) keeps server renders isolated between requests.
 */
export function createStoreContext<TStore extends ReadableStore, TInit = undefined>({
  name,
  create,
  onMount,
}: StoreContextOptions<TStore, TInit>) {
  const StoreContext = createContext<TStore | null>(null)
  StoreContext.displayName = name

  function Provider({ children, initialState }: { children: ReactNode; initialState?: TInit }) {
    const [store] = useState(() => create(initialState))

    useEffect(() => {
      onMount?.(store)
    }, [store])

    return <StoreContext value={store}>{children}</StoreContext>
  }

  function useStoreApi(): TStore {
    const store = useContext(StoreContext)
    if (!store) throw new Error(`use${name} must be used inside <${name}Provider>.`)
    return store
  }

  function useBoundStore<TSelected>(
    selector: (state: ExtractState<TStore>) => TSelected,
  ): TSelected {
    return useStore(useStoreApi(), selector)
  }

  return { Provider, useStore: useBoundStore, useStoreApi }
}
