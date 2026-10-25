import type { AppState } from "./types"

// Selectors that return a single value or a stable function can be used as-is:
//   const count = useAppStore(selectCount)
// Selectors that build a new object must be wrapped in useShallow to avoid extra re-renders:
//   const { increment } = useAppStore(useShallow(selectCounterActions))

export const selectCount = (state: AppState) => state.count

export const selectCounterActions = ({ increment, decrement, resetCount }: AppState) => ({
  increment,
  decrement,
  resetCount,
})

export const selectPreferences = ({ density, showHints }: AppState) => ({ density, showHints })

export const selectPreferenceActions = ({
  setDensity,
  toggleHints,
  resetPreferences,
}: AppState) => ({ setDensity, toggleHints, resetPreferences })

export const selectNotifications = (state: AppState) => state.notifications
export const selectNotify = (state: AppState) => state.notify
export const selectDismiss = (state: AppState) => state.dismiss

export const selectReset = (state: AppState) => state.reset
