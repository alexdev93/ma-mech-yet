import type { AppSliceCreator } from "../types"

export type CounterState = {
  count: number
}

export type CounterActions = {
  increment: (by?: number) => void
  decrement: (by?: number) => void
  resetCount: () => void
}

export type CounterSlice = CounterState & CounterActions

export const initialCounterState: CounterState = { count: 0 }

export const createCounterSlice: AppSliceCreator<CounterSlice> = (set) => ({
  ...initialCounterState,
  increment: (by = 1) =>
    set((state) => ({ count: state.count + by }), undefined, "counter/increment"),
  decrement: (by = 1) =>
    set((state) => ({ count: state.count - by }), undefined, "counter/decrement"),
  resetCount: () => set(initialCounterState, undefined, "counter/reset"),
})
