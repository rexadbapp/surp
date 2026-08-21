import { createRoot, createSignal } from "solid-js"
import type { Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

export interface ThemeColors {
  background: string
  surface: string
  overlay: string
  text: string
  subtext: string
  muted: string
  green: string
  blue: string
  lavender: string
  red: string
  yellow: string
  mauve: string
  teal: string
  peach: string
  pink: string
  cyan: string
  border: string
}

const catppuccinMocha: ThemeColors = {
  background: "#1e1e2e",
  surface: "#181825",
  overlay: "#313244",
  text: "#cdd6f4",
  subtext: "#a6adc8",
  muted: "#6c7086",
  green: "#a6e3a1",
  blue: "#89b4fa",
  lavender: "#b4befe",
  red: "#f38ba8",
  yellow: "#f9e2af",
  mauve: "#cba6f7",
  teal: "#94e2d5",
  peach: "#fab387",
  pink: "#f5c2e7",
  cyan: "#89dceb",
  border: "#45475a",
}

const catppuccinLatte: ThemeColors = {
  background: "#eff1f5",
  surface: "#e6e9ef",
  overlay: "#ccd0da",
  text: "#4c4f69",
  subtext: "#5c5f77",
  muted: "#9ca0b0",
  green: "#40a02b",
  blue: "#1e66f5",
  lavender: "#7287fd",
  red: "#d20f39",
  yellow: "#df8e1d",
  mauve: "#8839ef",
  teal: "#179299",
  peach: "#fe640b",
  pink: "#ea76cb",
  cyan: "#04a5e5",
  border: "#bcc0cc",
}

const tokyoNight: ThemeColors = {
  background: "#1a1b26",
  surface: "#16161e",
  overlay: "#24283b",
  text: "#a9b1d6",
  subtext: "#9aa5ce",
  muted: "#565f89",
  green: "#9ece6a",
  blue: "#7aa2f7",
  lavender: "#bb9af7",
  red: "#f7768e",
  yellow: "#e0af68",
  mauve: "#9d7cd8",
  teal: "#73daca",
  peach: "#ff9e64",
  pink: "#f7768e",
  cyan: "#7dcfff",
  border: "#3b4261",
}

const gruvbox: ThemeColors = {
  background: "#282828",
  surface: "#1d2021",
  overlay: "#3c3836",
  text: "#ebdbb2",
  subtext: "#d5c4a1",
  muted: "#928374",
  green: "#b8bb26",
  blue: "#83a598",
  lavender: "#d3869b",
  red: "#fb4934",
  yellow: "#fabd2f",
  mauve: "#b16286",
  teal: "#8ec07c",
  peach: "#fe8019",
  pink: "#d3869b",
  cyan: "#83a598",
  border: "#504945",
}

const nord: ThemeColors = {
  background: "#2e3440",
  surface: "#3b4252",
  overlay: "#434c5e",
  text: "#eceff4",
  subtext: "#d8dee9",
  muted: "#81a1c1",
  green: "#a3be8c",
  blue: "#81a1c1",
  lavender: "#b48ead",
  red: "#bf616a",
  yellow: "#ebcb8b",
  mauve: "#b48ead",
  teal: "#8fbcbb",
  peach: "#d08770",
  pink: "#b48ead",
  cyan: "#88c0d0",
  border: "#4c566a",
}

const dracula: ThemeColors = {
  background: "#282a36",
  surface: "#21222c",
  overlay: "#44475a",
  text: "#f8f8f2",
  subtext: "#bd93f9",
  muted: "#6272a4",
  green: "#50fa7b",
  blue: "#8be9fd",
  lavender: "#bd93f9",
  red: "#ff5555",
  yellow: "#f1fa8c",
  mauve: "#ff79c6",
  teal: "#8be9fd",
  peach: "#ffb86c",
  pink: "#ff79c6",
  cyan: "#8be9fd",
  border: "#44475a",
}

const everforest: ThemeColors = {
  background: "#2d353b",
  surface: "#272e33",
  overlay: "#3d484d",
  text: "#d3c6aa",
  subtext: "#a7c080",
  muted: "#859289",
  green: "#a7c080",
  blue: "#7fbbb3",
  lavender: "#d699b6",
  red: "#e67e80",
  yellow: "#dbbc7f",
  mauve: "#d699b6",
  teal: "#83c092",
  peach: "#e69875",
  pink: "#d699b6",
  cyan: "#83c092",
  border: "#4d5c5c",
}

const builtinThemes: Record<string, ThemeColors> = {
  "catppuccin-mocha": catppuccinMocha,
  "catppuccin-latte": catppuccinLatte,
  "tokyo-night": tokyoNight,
  "gruvbox": gruvbox,
  "nord": nord,
  "dracula": dracula,
  "everforest": everforest,
}

const THEMES_DIR = path.join(homedir(), ".config", "surp", "themes")

const { store, setStore } = createRoot(() => {
  const [store, setStore] = createStore<ThemeColors>(catppuccinMocha)
  return { store, setStore }
})

export const themeStore = store
export const setThemeStore = setStore

const _nameState = createRoot(() => {
  const [name, setName] = createSignal("catppuccin-mocha")
  return { name, setName }
})

export const currentThemeName: Accessor<string> = _nameState.name

export function getBuiltinThemeNames(): string[] {
  return Object.keys(builtinThemes)
}

async function loadCustomTheme(name: string): Promise<ThemeColors | null> {
  try {
    const filePath = path.join(THEMES_DIR, `${name}.json`)
    const raw = await readFile(filePath, "utf8")
    const theme = JSON.parse(raw) as Partial<ThemeColors>
    const required: (keyof ThemeColors)[] = [
      "background", "surface", "overlay", "text", "subtext", "muted",
      "green", "blue", "lavender", "red", "yellow", "mauve",
      "teal", "peach", "pink", "cyan", "border",
    ]
    for (const key of required) {
      if (typeof theme[key] !== "string") return null
    }
    return theme as ThemeColors
  } catch {
    return null
  }
}

export async function getAvailableThemeNames(): Promise<string[]> {
  const builtin = Object.keys(builtinThemes)
  try {
    const files = await readdir(THEMES_DIR)
    const custom = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
    return [...new Set([...builtin, ...custom])]
  } catch {
    return builtin
  }
}

export async function getAllThemeEntries(): Promise<Array<{ name: string; colors: ThemeColors | null }>> {
  const names = await getAvailableThemeNames()
  const entries: Array<{ name: string; colors: ThemeColors | null }> = []
  for (const n of names) {
    const builtin = builtinThemes[n]
    if (builtin) {
      entries.push({ name: n, colors: builtin })
    } else {
      const custom = await loadCustomTheme(n)
      entries.push({ name: n, colors: custom })
    }
  }
  return entries
}

export async function loadTheme(name: string): Promise<boolean> {
  const builtin = builtinThemes[name]
  if (builtin) {
    setStore(builtin)
    _nameState.setName(name)
    return true
  }
  const custom = await loadCustomTheme(name)
  if (custom) {
    setStore(custom)
    _nameState.setName(name)
    return true
  }
  return false
}
