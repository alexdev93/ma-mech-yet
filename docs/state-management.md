# State management

Global **client** state uses [Zustand](https://zustand.docs.pmnd.rs) 5. The store is split into slices so every feature stays small, typed and independent. The code lives in `src/client/stores/`.

## Choosing where state goes

| State                                           | Where it belongs                               | Example                                       |
| ----------------------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| Data from the server or a database              | Server Components and services (`"use cache"`) | posts, orders, user profile                   |
| Data that must survive a reload or be shareable | URL search params                              | filters, pagination, active tab               |
| Local to one component                          | `useState` / `useActionState`                  | input value, open dropdown                    |
| Shared by unrelated client components           | **App store (Zustand)**                        | toasts, UI preferences, cart, wizard progress |
| Theme                                           | `next-themes`                                  | light, dark or system                         |

Don't copy server data into the store. Read it on the server and pass it down. The store is for state that only exists in the browser.

## Structure

```text
src/client/stores/
├── create-store-context.tsx      # Generic factory: store → Provider + typed hooks
├── storage.ts                    # SSR-safe localStorage (no-op on the server)
└── app-store/
    ├── index.ts                  # Public API: import from "@/client/stores/app-store"
    ├── types.ts                  # AppState, AppData, AppSliceCreator
    ├── store.ts                  # createAppStore(): slices + persist + devtools
    ├── provider.tsx              # AppStoreProvider, useAppStore, useAppStoreApi
    ├── selectors.ts              # Reusable selectors
    ├── store.test.ts
    └── slices/
        ├── counter-slice.ts
        ├── preferences-slice.ts  # persisted
        └── notifications-slice.ts
```

`AppStoreProvider` is mounted once in `src/client/providers/app-providers.tsx`, along with `ThemeProvider` and `<Toaster />`. The root layout renders `<AppProviders>`.

## Why a provider instead of a global `create()`

A module-level store would be shared by every request the server renders, so one user's state could leak into another user's HTML. `createStoreContext()` creates **one store per provider mount**, which means one per request on the server and one per tab in the browser. This is the pattern Zustand recommends for Next.js.

## Using the store

```tsx
"use client"
import {
  selectCount,
  selectCounterActions,
  useAppStore,
  useShallow,
} from "@/client/stores/app-store"

export function Example() {
  const count = useAppStore(selectCount) // one value
  const { increment } = useAppStore(useShallow(selectCounterActions)) // several values
  const notify = useAppStore((state) => state.notify) // inline selector
  return (
    <button
      onClick={() => {
        increment()
        notify({ title: `Count: ${count + 1}` })
      }}
    >
      +1
    </button>
  )
}
```

Rules:

- **Always pass a selector.** A component re-renders only when the value it selects changes.
- **Wrap selectors that return a new object or array in `useShallow`**, or the component re-renders on every store change.
- Read state outside React (in event handlers or effects) with `useAppStoreApi().getState()`.
- The hooks work only in Client Components. Server Components can't read the store.

### Notifications

```ts
const notify = useAppStore(selectNotify)
notify({ title: "Saved" }) // default variant, 4 s
notify({ title: "Failed", description: "Try again", variant: "error" })
const id = notify({ title: "Uploading…", duration: 0 }) // stays until dismissed
useAppStoreApi().getState().dismiss(id)
```

At most 5 notifications are kept, and the oldest is dropped first. The contact form uses `notify()` after a successful Server Action.

## Adding a slice

Example: a shopping cart.

**1. Create the slice** at `src/client/stores/app-store/slices/cart-slice.ts`:

```ts
import type { AppSliceCreator } from "../types"

export type CartItem = { id: string; quantity: number }
export type CartState = { items: CartItem[] }
export type CartActions = { addItem: (id: string) => void; clearCart: () => void }
export type CartSlice = CartState & CartActions

export const initialCartState: CartState = { items: [] }

export const createCartSlice: AppSliceCreator<CartSlice> = (set) => ({
  ...initialCartState,
  addItem: (id) =>
    set(
      (state) => {
        const existing = state.items.find((item) => item.id === id)
        return {
          items: existing
            ? state.items.map((item) =>
                item.id === id ? { ...item, quantity: item.quantity + 1 } : item,
              )
            : [...state.items, { id, quantity: 1 }],
        }
      },
      undefined,
      "cart/addItem", // action name shown in Redux DevTools
    ),
  clearCart: () => set(initialCartState, undefined, "cart/clear"),
})
```

**2. Register its types** in `types.ts`:

```ts
export type AppData = CounterState & PreferencesState & NotificationsState & CartState
export type AppState = CounterSlice & PreferencesSlice & NotificationsSlice & CartSlice & AppActions
```

**3. Register it** in `store.ts`: add `...initialCartState` to `initialAppData` and `...createCartSlice(set, get, api)` to the initializer.

**4. (Optional) Add selectors** to `selectors.ts` and export the public types from `index.ts`.

**5. (Optional) Persist it**: extend `partialize` in `store.ts`, for example `partialize: (state) => ({ ...pickPreferences(state), items: state.items })`. Then bump `APP_STORE_VERSION` (see below).

**6. Test it** in `store.test.ts` with `createAppStore()`.

TypeScript reports an error in step 3 if the slice doesn't match `AppState`, so a slice can't be half-registered.

A slice can read other slices through `get()`. For example, a checkout action can call `get().notify(...)`.

## Creating a separate store

Use a separate store when state belongs to one part of the tree, such as a multi-step form or an editor, and should be created and discarded with it:

```tsx
"use client"
import { createStore } from "zustand/vanilla"
import { createStoreContext } from "@/client/stores/create-store-context"

type WizardState = { step: number; next: () => void }

export const { Provider: WizardProvider, useStore: useWizard } = createStoreContext({
  name: "Wizard",
  create: (initial?: { step: number }) =>
    createStore<WizardState>()((set) => ({
      step: initial?.step ?? 1,
      next: () => set((state) => ({ step: state.step + 1 })),
    })),
})

// <WizardProvider initialState={{ step: 1 }}> … </WizardProvider>
// const step = useWizard((state) => state.step)
```

`initialState` can come from a Server Component, such as data loaded on the server, which seeds the store before the first render.

## Persistence

- Only what `partialize` returns is saved, under the `localStorage` key `app-store`. Today that's `density` and `showHints`. Actions and transient data (counter, notifications) are never saved.
- `skipHydration: true` together with `store.persist.rehydrate()` after mount (in `provider.tsx`) keeps the server render and the first client render identical. Saved values apply right after hydration.
- On the server, `browserStorage()` returns a no-op storage, so nothing is shared between requests.
- **Changing the shape of persisted data:** bump `APP_STORE_VERSION` and add a `migrate(persisted, version)` function to the persist options. Old saved data is then upgraded instead of breaking the app.
- Never persist secrets, tokens or personal data. `localStorage` can be read by any script on the page.

## DevTools

In development, the store is connected to the [Redux DevTools](https://github.com/reduxjs/redux-devtools) browser extension as **AppStore**. Every update shows up with its action name (for example `counter/increment`), and you can inspect and replay state. It's disabled in production builds.

## Testing

`createAppStore()` works without React, so slices are tested as plain functions:

```ts
const store = createAppStore({ count: 5 })
store.getState().increment()
expect(store.getState().count).toBe(6)
```

Each call creates an isolated store, so no reset between tests is needed.
