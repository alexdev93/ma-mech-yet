import type { AppSliceCreator } from "../types"

export type Density = "comfortable" | "compact"

export type PreferencesState = {
  density: Density
  showHints: boolean
}

export type PreferencesActions = {
  setDensity: (density: Density) => void
  toggleHints: () => void
  resetPreferences: () => void
}

export type PreferencesSlice = PreferencesState & PreferencesActions

export const initialPreferencesState: PreferencesState = { density: "comfortable", showHints: true }

/** The persisted subset of the store. Persistence picks data with this, never actions. */
export function pickPreferences({ density, showHints }: PreferencesState): PreferencesState {
  return { density, showHints }
}

export const createPreferencesSlice: AppSliceCreator<PreferencesSlice> = (set) => ({
  ...initialPreferencesState,
  setDensity: (density) => set({ density }, undefined, "preferences/setDensity"),
  toggleHints: () =>
    set((state) => ({ showHints: !state.showHints }), undefined, "preferences/toggleHints"),
  resetPreferences: () => set(initialPreferencesState, undefined, "preferences/reset"),
})
