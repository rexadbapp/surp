import type { KeybindingsConfig } from "./config"

export interface ParsedKey {
  name: string
  ctrl: boolean
  shift: boolean
  meta: boolean
}

/** Normalize a key event to a string like "ctrl+k", "shift+G", "enter" */
export function keyToString(event: ParsedKey): string {
  // "return" (\r) and "enter" are the same physical key — normalize to "enter"
  const name = event.name === "return" ? "enter" : event.name === " " ? "space" : event.name
  let s = name.toLowerCase()
  if (event.shift && name.length === 1) {
    s = name.toUpperCase()
    if (event.ctrl) return `ctrl+${s}`
    if (event.meta) return `meta+${s}`
    return s
  }
  if (event.ctrl) s = `ctrl+${s}`
  if (event.meta) s = `meta+${s}`
  return s
}

const NAMED_KEYS = new Set([
  "escape", "enter", "return", "backspace", "tab", "space",
  "up", "down", "left", "right",
  "pageup", "pagedown", "home", "end", "insert", "delete",
  "f1","f2","f3","f4","f5","f6","f7","f8","f9","f10","f11","f12",
])

/**
 * Split a binding string into key tokens.
 * "ctrl+w h" → ["ctrl+w", "h"]
 * "gt"       → ["g", "t"]   (multi-char without + = sequence of chars)
 * "escape"   → ["escape"]   (named keys stay whole)
 */
export function parseBinding(binding: string): string[] {
  const result: string[] = []
  for (const part of binding.trim().split(/\s+/)) {
    if (part.includes("+") || NAMED_KEYS.has(part.toLowerCase())) {
      result.push(part)
    } else {
      result.push(...part.split(""))
    }
  }
  return result
}

export type Action =
  | "move_up"
  | "move_down"
  | "move_left"
  | "move_right"
  | "select"
  | "quit_buffer"
  | "command_mode"
  | "escape"
  | "next_buffer"
  | "prev_buffer"
  | "pane_left"
  | "pane_right"
  | "pane_up"
  | "pane_down"
  | "vsplit"
  | "split"
  | "close_pane"
  | "scroll_up"
  | "scroll_down"
  | "page_up"
  | "page_down"
  | "go_top"
  | "go_bottom"
  | "refresh"
  | "toggle_sidebar"
  | "yank"
  | "yank_row"
  | "paste"
  | "delete"
  | "create"

/** Build action->binding sequences map from config */
export function buildActionMap(cfg: KeybindingsConfig): Map<Action, string[][]> {
  const map: Map<Action, string[][]> = new Map()
  const entries: [Action, string | undefined][] = [
    ["move_up", cfg.move_up],
    ["move_down", cfg.move_down],
    ["move_left", cfg.move_left],
    ["move_right", cfg.move_right],
    ["select", cfg.select],
    ["quit_buffer", cfg.quit_buffer],
    ["command_mode", cfg.command_mode],
    ["escape", cfg.escape],
    ["next_buffer", cfg.next_buffer],
    ["prev_buffer", cfg.prev_buffer],
    ["pane_left", cfg.pane_left],
    ["pane_right", cfg.pane_right],
    ["pane_up", cfg.pane_up],
    ["pane_down", cfg.pane_down],
    ["vsplit", cfg.vsplit],
    ["split", cfg.split],
    ["close_pane", cfg.close_pane],
    ["scroll_up", cfg.scroll_up],
    ["scroll_down", cfg.scroll_down],
    ["page_up", cfg.page_up],
    ["page_down", cfg.page_down],
    ["go_top", cfg.go_top],
    ["go_bottom", cfg.go_bottom],
    ["refresh", cfg.refresh],
    ["toggle_sidebar", cfg.toggle_sidebar],
    ["yank", cfg.yank],
    ["yank_row", cfg.yank_row],
    ["paste", cfg.paste],
    ["delete", cfg.delete],
    ["create", cfg.create],
  ]
  for (const [action, binding] of entries) {
    if (binding) map.set(action, [parseBinding(binding)])
  }
  // Arrow keys always work as aliases for the movement actions, on top of
  // whatever vim-style bindings the user has configured.
  const ARROW_ALIASES: [Action, string][] = [
    ["move_up", "up"],
    ["move_down", "down"],
    ["move_left", "left"],
    ["move_right", "right"],
  ]
  for (const [action, token] of ARROW_ALIASES) {
    const existing = map.get(action)
    if (existing) {
      if (!existing.some((seq) => seq[0] === token)) existing.push([token])
    } else {
      map.set(action, [[token]])
    }
  }
  return map
}

/** Match the current pending key sequence against all known action bindings.
 *  Returns both a full match (if any) AND whether longer bindings are still possible.
 *  Callers must wait when hasPartial is true — even if there's already a fullAction. */
export function matchSequence(
  sequence: string[],
  actionMap: Map<Action, string[][]>,
): { fullAction: Action | null; hasPartial: boolean } {
  let fullAction: Action | null = null
  let hasPartial = false
  for (const [action, bindings] of actionMap) {
    for (const binding of bindings) {
      const match = sequenceMatches(sequence, binding)
      if (match === "full")    fullAction = action
      if (match === "partial") hasPartial = true
    }
  }
  return { fullAction, hasPartial }
}

function sequenceMatches(seq: string[], binding: string[]): "full" | "partial" | "none" {
  if (seq.length > binding.length) return "none"
  for (let i = 0; i < seq.length; i++) {
    if (seq[i] !== binding[i]) return "none"
  }
  return seq.length === binding.length ? "full" : "partial"
}
