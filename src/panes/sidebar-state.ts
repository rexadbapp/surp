import { createSignal } from "solid-js"

/**
 * Explorer sidebar visibility/focus, shared between the layout (which renders
 * it) and the connection layer (which opens it after a successful connect).
 */
export const [sidebarOpen, setSidebarOpen] = createSignal(false)
export const [sidebarFocused, setSidebarFocused] = createSignal(false)
