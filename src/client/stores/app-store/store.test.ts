import { describe, expect, it } from "vitest"

import { MAX_NOTIFICATIONS } from "./slices/notifications-slice"
import { createAppStore, initialAppData } from "./store"

describe("app store", () => {
  it("starts from the initial data and accepts overrides", () => {
    expect(createAppStore().getState()).toMatchObject(initialAppData)
    expect(createAppStore({ count: 5, density: "compact" }).getState()).toMatchObject({
      count: 5,
      density: "compact",
    })
  })

  it("keeps store instances isolated", () => {
    const first = createAppStore()
    const second = createAppStore()
    first.getState().increment()
    expect(first.getState().count).toBe(1)
    expect(second.getState().count).toBe(0)
  })

  it("updates the counter slice", () => {
    const store = createAppStore()
    const { increment, decrement, resetCount } = store.getState()
    increment()
    increment(10)
    decrement(2)
    expect(store.getState().count).toBe(9)
    resetCount()
    expect(store.getState().count).toBe(0)
  })

  it("updates the preferences slice", () => {
    const store = createAppStore()
    store.getState().setDensity("compact")
    store.getState().toggleHints()
    expect(store.getState()).toMatchObject({ density: "compact", showHints: false })
    store.getState().resetPreferences()
    expect(store.getState()).toMatchObject({ density: "comfortable", showHints: true })
  })

  it("adds, caps and dismisses notifications", () => {
    const store = createAppStore()
    const id = store.getState().notify({ title: "Hello" })
    expect(store.getState().notifications).toEqual([
      { id, title: "Hello", variant: "default", duration: 4000 },
    ])

    for (let index = 0; index < MAX_NOTIFICATIONS + 2; index++) {
      store.getState().notify({ title: `#${index}`, variant: "success" })
    }
    expect(store.getState().notifications).toHaveLength(MAX_NOTIFICATIONS)
    expect(store.getState().notifications.at(-1)?.title).toBe(`#${MAX_NOTIFICATIONS + 1}`)

    const first = store.getState().notifications[0]
    if (first) store.getState().dismiss(first.id)
    expect(store.getState().notifications).toHaveLength(MAX_NOTIFICATIONS - 1)
    store.getState().clearNotifications()
    expect(store.getState().notifications).toEqual([])
  })

  it("resets every slice and keeps the actions", () => {
    const store = createAppStore()
    store.getState().increment()
    store.getState().setDensity("compact")
    store.getState().notify({ title: "x" })
    store.getState().reset()
    expect(store.getState()).toMatchObject(initialAppData)
    expect(typeof store.getState().increment).toBe("function")
  })

  it("persists only the preferences", () => {
    const store = createAppStore({ count: 3 })
    const { partialize, name } = store.persist.getOptions()
    expect(name).toBe("app-store")
    expect(partialize?.(store.getState())).toEqual({ density: "comfortable", showHints: true })
  })
})
