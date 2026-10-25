import type { StateStorage } from "zustand/middleware"

// On the server nothing is stored, so persisted state can never leak between requests.
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

export function browserStorage(): StateStorage {
  return typeof window === "undefined" ? noopStorage : window.localStorage
}
