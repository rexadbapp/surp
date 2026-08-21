import { createSignal, For, Show, onMount, onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import { setActivePicker } from "./picker-state"
import { COLORS } from "../ui/colors"
import { CURSOR_THEMES, cursorThemeName, setCursorThemeByName, resolveCursorColor } from "../ui/cursor"
import { saveConfig } from "../config"

interface CursorPickerProps {
  width: number
  height: number
}

const DIALOG_W = 64

function shapeGlyph(shape: string): string {
  if (shape === "block") return "█"
  if (shape === "line") return "│"
  if (shape === "underline") return "_"
  return "·"
}

export function CursorPicker(props: CursorPickerProps) {
  const renderer = useRenderer()
  const [selectedIdx, setSelectedIdx] = createSignal(0)

  function clamp(n: number) {
    if (n < 0) return 0
    if (n >= CURSOR_THEMES.length) return CURSOR_THEMES.length - 1
    return n
  }

  function close() {
    setActivePicker(null)
  }

  async function selectCursor() {
    const entry = CURSOR_THEMES[selectedIdx()]
    if (!entry) return
    if (setCursorThemeByName(entry.name)) {
      await saveConfig({ cursorTheme: entry.name })
    }
    close()
  }

  onMount(() => {
    // start selection on the current cursor theme
    const current = CURSOR_THEMES.findIndex((t) => t.name === cursorThemeName())
    setSelectedIdx(current >= 0 ? current : 0)

    const kh = renderer.keyInput

    function onKeypress(event: KeyEvent) {
      event.stopPropagation()

      if (event.name === "escape") {
        close()
        return
      }
      if (event.name === "enter" || event.name === "return") {
        void selectCursor()
        return
      }
      if (event.name === "up") {
        setSelectedIdx((c) => clamp(c - 1))
        return
      }
      if (event.name === "down") {
        setSelectedIdx((c) => clamp(c + 1))
        return
      }
    }

    kh.on("keypress", onKeypress)
    onCleanup(() => kh.off("keypress", onKeypress))
  })

  return (
    <box
      flexDirection="column"
      width={props.width}
      height={props.height}
      alignItems="center"
      justifyContent="center"
    >
      <box flexDirection="column" width={DIALOG_W}>
        <box
          flexDirection="row"
          height={1}
          paddingLeft={2}
          backgroundColor={COLORS.mauve}
        >
          <text fg={COLORS.background} attributes={1}>Cursor Theme</text>
          <text fg={COLORS.background}>  ·  ↑↓: navigate  enter: select  esc: close</text>
        </box>

        <For each={CURSOR_THEMES}>
          {(entry, i) => {
            const swatch = resolveCursorColor(entry.theme, COLORS)
            return (
              <box
                flexDirection="row"
                height={1}
                paddingLeft={2}
                paddingRight={2}
                backgroundColor={i() === selectedIdx() ? COLORS.overlay : COLORS.surface}
              >
                <text
                  fg={i() === selectedIdx() ? COLORS.blue : COLORS.text}
                  attributes={cursorThemeName() === entry.name ? 1 : 0}
                  width={32}
                >
                  {i() === selectedIdx() ? "▶ " : "  "}
                  {entry.name}
                  {cursorThemeName() === entry.name ? " *" : ""}
                </text>
                <text fg={COLORS.muted} width={4}>{shapeGlyph(entry.theme.shape)}</text>
                <text fg={COLORS.muted} width={10}>
                  {entry.theme.blinking ? "blink" : "solid"}
                </text>
                <text fg={swatch}>{shapeGlyph(entry.theme.shape)}</text>
              </box>
            )
          }}
        </For>
      </box>
    </box>
  )
}
