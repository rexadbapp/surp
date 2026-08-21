import { createSignal, createMemo, For, Show, onMount, onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import { useMode } from "../context/mode"
import { filterCommands, executeCommandLine } from "./registry"
import { COLORS } from "../ui/colors"

interface CommandPaletteProps {
  width: number
  height: number
}

const DIALOG_W = 60

function isPrintable(event: KeyEvent): boolean {
  return event.name.length === 1 && !event.ctrl && !event.meta
}

function toChar(event: KeyEvent): string {
  if (event.shift && event.name === ";") return ":"
  if (event.shift && event.name.length === 1) return event.name.toUpperCase()
  return event.name
}

export function CommandPalette(props: CommandPaletteProps) {
  const mode = useMode()
  const renderer = useRenderer()
  const [input, setInput] = createSignal("")
  const [cursor, setCursor] = createSignal(0)

  const suggestions = createMemo(() => filterCommands(input()))
  const selected = createMemo(() => Math.min(cursor(), Math.max(0, suggestions().length - 1)))

  function reset() {
    setInput("")
    setCursor(0)
  }

  function execute() {
    const vis = visibleSuggestions()
    const line = vis.length > 0 ? vis[selected()]!.name : input().trim()
    mode.enterNormal()
    reset()
    if (line) void executeCommandLine(line)
  }

  onMount(() => {
    const kh = renderer.keyInput

    function onKeypress(event: KeyEvent) {
      if (!mode.is("command")) return

      event.stopPropagation()

      if (event.name === "escape") {
        mode.enterNormal()
        reset()
        return
      }
      if (event.name === "return" || event.name === "enter") {
        execute()
        return
      }
      if (event.name === "tab") {
        const s = suggestions()[selected()]
        if (s) setInput(s.name)
        return
      }
      if (event.name === "up") {
        setCursor((c) => Math.max(0, c - 1))
        return
      }
      if (event.name === "down") {
        setCursor((c) => Math.min(suggestions().length - 1, c + 1))
        return
      }
      if (event.name === "backspace") {
        setInput((s) => s.slice(0, -1))
        setCursor(0)
        return
      }
      if (isPrintable(event)) {
        setInput((s) => s + toChar(event))
        setCursor(0)
      }
    }

    kh.on("keypress", onKeypress)
    onCleanup(() => kh.off("keypress", onKeypress))
  })

  const visibleSuggestions = createMemo(() =>
    input().length > 0 ? suggestions().slice(0, 8) : [],
  )

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
        <Show when={visibleSuggestions().length > 0}>
          <For each={visibleSuggestions()}>
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
