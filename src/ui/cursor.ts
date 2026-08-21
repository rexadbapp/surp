import { createRoot, createSignal } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import type { ThemeColors } from "./theme"

// CursorStyle mirrors OpenTUI's CursorStyleOptions["style"]
export type CursorShape = "block" | "line" | "underline"

export interface CursorTheme {
  shape: CursorShape
  blinking: boolean
  color: string | null
}

export const CURSOR_THEMES: Array<{ name: string; theme: CursorTheme }> = [
  { name: "block-blink",   theme: { shape: "block",     blinking: true,  color: null } },
  { name: "block-solid",   theme: { shape: "block",     blinking: false, color: null } },
  { name: "line-blink",     theme: { shape: "line",     blinking: true,  color: null } },
  { name: "line-solid",     theme: { shape: "line",     blinking: false, color: null } },
  { name: "underline-blink", theme: { shape: "underline", blinking: true,  color: null } },
  { name: "underline-solid", theme: { shape: "underline", blinking: false, color: null } },
  { name: "block-mauve",   theme: { shape: "block",     blinking: true,  color: "mauve" } },
  { name: "block-blue",    theme: { shape: "block",     blinking: true,  color: "blue" } },
  { name: "block-green",   theme: { shape: "block",     blinking: true,  color: "green" } },
  { name: "block-peach",   theme: { shape: "block",     blinking: false, color: "peach" } },
  { name: "line-teal",     theme: { shape: "line",      blinking: true,  color: "teal" } },
  { name: "underline-yellow", theme: { shape: "underline", blinking: true, color: "yellow" } },
]

const DEFAULT_CURSOR = "block-blink"

const _state = createRoot(() => {
  const [name, setName] = createSignal(DEFAULT_CURSOR)
  const [theme, setTheme] = createSignal<CursorTheme>(
    CURSOR_THEMES.find((t) => t.name === DEFAULT_CURSOR)!.theme,
  )
  return { name, setName, theme, setTheme }
})

export const cursorThemeName: Accessor<string> = _state.name
export const cursorTheme: Accessor<CursorTheme> = _state.theme

export function setCursorThemeByName(name: string): boolean {
  const entry = CURSOR_THEMES.find((t) => t.name === name)
  if (!entry) return false
  _state.setTheme(entry.theme)
  _state.setName(name)
  return true
}

export const DEFAULT_CURSOR_THEME = DEFAULT_CURSOR

/** Resolve a cursor theme's named color into a concrete hex string. */
export function resolveCursorColor(theme: CursorTheme, colors: ThemeColors): string {
  if (!theme.color) return colors.text
  const key = theme.color as keyof ThemeColors
  return colors[key] ?? colors.text
}
