"use client"

import {
  type Density,
  selectPreferenceActions,
  selectPreferences,
  useAppStore,
  useShallow,
} from "@/client/stores/app-store"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const DENSITIES: ReadonlyArray<Density> = ["comfortable", "compact"]
const ITEMS = [
  "Server state lives on the server",
  "UI state lives in the store",
  "Forms own their input",
]

export function PreferencesPanel() {
  const { density, showHints } = useAppStore(useShallow(selectPreferences))
  const { setDensity, toggleHints, resetPreferences } = useAppStore(
    useShallow(selectPreferenceActions),
  )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {DENSITIES.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={density === option ? "default" : "outline"}
            aria-pressed={density === option}
            onClick={() => setDensity(option)}
            className="capitalize"
          >
            {option}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={resetPreferences}>
          Reset
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="show-hints"
          type="checkbox"
          checked={showHints}
          onChange={toggleHints}
          className="accent-primary size-4"
        />
        <Label htmlFor="show-hints">Show hints</Label>
      </div>
      <ul
        className={cn("grid rounded-md border text-sm", density === "compact" ? "gap-0" : "gap-1")}
      >
        {ITEMS.map((item) => (
          <li key={item} className={density === "compact" ? "px-3 py-1" : "px-4 py-3"}>
            {item}
          </li>
        ))}
      </ul>
      {showHints && (
        <p className="text-muted-foreground text-sm">
          These preferences are saved to localStorage. Reload the page and they stay.
        </p>
      )}
    </div>
  )
}
