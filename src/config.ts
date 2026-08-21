import { readFile, writeFile, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

const CONFIG_DIR = path.join(homedir(), ".config", "surp")
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json")

export interface KeybindingsConfig {
  move_up?: string
  move_down?: string
  move_left?: string
  move_right?: string
  select?: string
  quit_buffer?: string
  command_mode?: string
  escape?: string
  next_buffer?: string
  prev_buffer?: string
  pane_left?: string
  pane_right?: string
  pane_up?: string
  pane_down?: string
  vsplit?: string
  split?: string
  close_pane?: string
  scroll_up?: string
  scroll_down?: string
  page_up?: string
  page_down?: string
  go_top?: string
  go_bottom?: string
  refresh?: string
  toggle_sidebar?: string
  yank?: string
  yank_row?: string
  paste?: string
  delete?: string
  create?: string
}

export interface SurpConfig {
  theme?: string
  cursorTheme?: string
  leader_timeout?: number
  keybindings?: KeybindingsConfig
}

const defaults: Required<SurpConfig> = {
  theme: "catppuccin-mocha",
  cursorTheme: "block-blink",
  leader_timeout: 500,
  keybindings: {
    move_up: "k",
    move_down: "j",
    move_left: "h",
    move_right: "l",
    select: "enter",
    quit_buffer: "q",
    command_mode: ":",
    escape: "escape",
    next_buffer: "L",
    prev_buffer: "H",
    pane_left: "ctrl+w h",
    pane_right: "ctrl+w l",
    pane_up: "ctrl+w k",
    pane_down: "ctrl+w j",
    vsplit: "ctrl+w v",
    split: "ctrl+w s",
    close_pane: "ctrl+w q",
    scroll_up: "ctrl+u",
    scroll_down: "ctrl+d",
    page_up: "ctrl+b",
    page_down: "ctrl+f",
    go_top: "gg",
    go_bottom: "G",
    refresh: "r",
    toggle_sidebar: "space e",
    yank: "y",
    yank_row: "yy",
    paste: "p",
    delete: "d",
    create: "c",
  },
}

export async function loadConfig(): Promise<Required<SurpConfig>> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf8")
    const parsed = JSON.parse(raw) as SurpConfig
    return {
      theme: parsed.theme ?? defaults.theme,
      cursorTheme: parsed.cursorTheme ?? defaults.cursorTheme,
      leader_timeout: parsed.leader_timeout ?? defaults.leader_timeout,
      keybindings: { ...defaults.keybindings, ...parsed.keybindings },
    }
  } catch {
    return defaults
  }
}

export async function saveConfig(config: Partial<SurpConfig>): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  const current = await loadConfig()
  const merged = { ...current, ...config, keybindings: { ...current.keybindings, ...config.keybindings } }
  await writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2))
}
