import { createRoot, createSignal } from "solid-js"
import type { Accessor, Setter } from "solid-js"

export type PickerType = "theme" | "cursor" | null

const _state = createRoot(() => {
  const [active, setActive] = createSignal<PickerType>(null)
  return { active, setActive }
})

export const activePicker: Accessor<PickerType> = _state.active
export const setActivePicker: Setter<PickerType> = _state.setActive
