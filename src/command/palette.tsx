import { createSignal, For, Show } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent, PasteEvent } from "@opentui/core"
import { useMode } from "../context/mode"
import { filterCommands, executeCommandLine } from "./registry"
import { COLORS } from "../ui/colors"

interface CommandPaletteProps {
  width: number
  height: number
}

const DIALOG_W = 60

function isPrintable(event: KeyEvent): boolean {
  if (event.name === "space") return !event.ctrl && !event.meta
  return event.name.length === 1 && !event.ctrl && !event.meta
}

function toChar(event: KeyEvent): string {
  if (event.name === "space") return " "
  if (event.shift && event.name === ";") return ":"
  if (event.shift && event.name.length === 1) return event.name.toUpperCase()
  return event.name
}

// ── module-level palette state ────────────────────────────────────────────────
// The palette's keyboard controller lives here, NOT in the component. History:
// per-mount listeners piled up as hidden zombie instances (the renderer hides
// the subtree without running cleanups), the bottom-most listener monopolized
// all keystrokes via stopPropagation, and its reactive subscriptions died on
// hide — so stale command lists got executed. One permanent listener with
// plain module signals sidesteps the entire lifecycle mess.
const [input, setInput] = createSignal("")
const [cursor, setCursor] = createSignal(0)

function resetPalette() {
  setInput("")
  setCursor(0)
}

let installed = false

export function CommandPalette(props: CommandPaletteProps) {
  const mode = useMode()
  const renderer = useRenderer()

  if (!installed) {
    installed = true
    const kh = renderer.keyInput

    function onKeypress(event: KeyEvent) {
      if (!mode.is("command")) return

      event.stopPropagation()

      if (event.name === "escape") {
        mode.enterNormal()
        resetPalette()
        return
      }
      if (event.name === "return" || event.name === "enter") {
        execute()
        return
      }
      if (event.name === "tab") {
        const s = currentSuggestions()[cursor()]
        if (s) setInput(s.name)
        return
      }
      if (event.name === "up") {
        setCursor((c) => Math.max(0, c - 1))
        return
      }
      if (event.name === "down") {
        setCursor((c) => c + 1)
        return
      }
      if (event.name === "backspace") {
        setInput((s) => s.slice(0, -1))
        setCursor(0)
        return
      }
      if (isPrintable(event)) {
        const ch = toChar(event)
        // The ':' that opens the palette can land in the input depending on
        // dispatch ordering — commands never start with ':', so drop it.
        if (ch === ":" && input() === "") return
        setInput((s) => (s + ch).slice(0, 200))
        setCursor(0)
      }
    }

    // Coalesced / bracketed-pasted text arrives as a paste event, not keypresses
    const decoder = new TextDecoder()
    function onPaste(event: PasteEvent) {
      if (!mode.is("command")) return
      event.preventDefault()
      const text = decoder.decode(event.bytes).replace(/[\r\n]+/g, "")
      if (text) setInput((s) => (s + text).slice(0, 200))
      setCursor(0)
    }

    // Intentionally never uninstalled — this is the app-wide singleton.
    kh.on("keypress", onKeypress)
    kh.on("paste", onPaste)
  }

  function currentSuggestions() {
    const q = input().trim().replace(/^:+/, "")
    return q ? filterCommands(q) : []
  }

  function execute() {
    const sugs = currentSuggestions()
    const sel = Math.min(cursor(), Math.max(0, sugs.length - 1))
    const line = sugs.length > 0 ? sugs[sel]!.name : input().trim().replace(/^:+/, "")
    mode.enterNormal()
    resetPalette()
    if (line) void executeCommandLine(line)
  }

  const query = () => input().trim().replace(/^:+/, "")
  const suggestions = () => (query() ? filterCommands(query()).slice(0, 8) : [])
  const selected = () => Math.min(cursor(), Math.max(0, suggestions().length - 1))

  return (
    // Full content-area overlay — no background so layout shows through
    <box
      flexDirection="column"
      width={props.width}
      height={props.height}
      alignItems="center"
      justifyContent="center"
    >
      <box flexDirection="column" width={DIALOG_W}>

        {/* Title bar */}
        <box
          flexDirection="row"
          height={1}
          paddingLeft={2}
          backgroundColor={COLORS.mauve}
        >
          <text fg={COLORS.background} attributes={1}>Command Palette</text>
          <text fg={COLORS.background}>  ·  tab: complete  ↑↓: navigate  esc: close</text>
        </box>

        {/* Suggestions */}
        <Show when={suggestions().length > 0}>
          <For each={suggestions()}>
            {(cmd, i) => (
              <box
                flexDirection="row"
                paddingLeft={2}
                paddingRight={2}
                height={1}
                backgroundColor={i() === selected() ? COLORS.overlay : COLORS.surface}
              >
                <text fg={i() === selected() ? COLORS.blue : COLORS.text} width={24}>
                  {i() === selected() ? "▶ " : "  "}{cmd.name}
                </text>
                <text fg={COLORS.subtext}>{cmd.description}</text>
              </box>
            )}
          </For>
        </Show>

        {/* Input line */}
        <box
          flexDirection="row"
          height={1}
          backgroundColor={COLORS.surface}
          paddingLeft={1}
          paddingRight={1}
        >
          <text fg={COLORS.green} attributes={1}>:</text>
          <text fg={COLORS.text}> {input()}</text>
          <text fg={COLORS.mauve}>█</text>
        </box>

      </box>
    </box>
  )
}
