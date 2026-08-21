import { createSignal, createResource, For, Show, onMount, onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import { setActivePicker } from "./picker-state"
import { COLORS } from "../ui/colors"
import { getAllThemeEntries, loadTheme, currentThemeName } from "../ui/theme"
import { saveConfig } from "../config"

interface ThemePickerProps {
  width: number
  height: number
}

const DIALOG_W = 60

export function ThemePicker(props: ThemePickerProps) {
  const renderer = useRenderer()
  const [themes] = createResource(getAllThemeEntries)
  const [selectedIdx, setSelectedIdx] = createSignal(0)

  function clamp(n: number) {
    const total = themes()?.length ?? 1
    if (n < 0) return 0
    if (n >= total) return total - 1
    return n
  }

  function close() {
    setActivePicker(null)
  }

  async function selectTheme() {
    const entry = themes()?.[selectedIdx()]
    if (!entry?.colors) return
    const ok = await loadTheme(entry.name)
    if (ok) {
      await saveConfig({ theme: entry.name })
    }
    close()
  }

  onMount(() => {
    const kh = renderer.keyInput

    function onKeypress(event: KeyEvent) {
      event.stopPropagation()

      if (event.name === "escape") {
        close()
        return
      }
      if (event.name === "enter" || event.name === "return") {
        void selectTheme()
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
          <text fg={COLORS.background} attributes={1}>Theme Selector</text>
          <text fg={COLORS.background}>  ·  ↑↓: navigate  enter: select  esc: close</text>
        </box>

        <Show when={themes.loading}>
          <box height={1} paddingLeft={2} backgroundColor={COLORS.surface}>
            <text fg={COLORS.subtext}>Loading themes...</text>
          </box>
        </Show>

        <Show when={themes()}>
          <For each={themes()}>
            {(entry, i) => (
              <box
                flexDirection="row"
                height={1}
                paddingLeft={2}
                paddingRight={2}
                backgroundColor={i() === selectedIdx() ? COLORS.overlay : COLORS.surface}
              >
                <text
                  fg={i() === selectedIdx() ? COLORS.blue : COLORS.text}
                  attributes={currentThemeName() === entry.name ? 1 : 0}
                  width={36}
                >
                  {i() === selectedIdx() ? "▶ " : "  "}
                  {entry.name}
                  {currentThemeName() === entry.name ? " *" : ""}
                </text>
                <Show when={entry.colors}>
                  <text fg={entry.colors!.background}>██</text>
                  <text fg={entry.colors!.text}>██</text>
                  <text fg={entry.colors!.blue}>██</text>
                  <text fg={entry.colors!.green}>██</text>
                  <text fg={entry.colors!.red}>██</text>
                  <text fg={entry.colors!.mauve}>██</text>
                </Show>
                <Show when={!entry.colors}>
                  <text fg={COLORS.muted}>  (custom theme)</text>
                </Show>
              </box>
            )}
          </For>
        </Show>

        <Show when={themes() && themes()!.length === 0}>
          <box height={1} paddingLeft={2} backgroundColor={COLORS.surface}>
            <text fg={COLORS.subtext}>No themes found</text>
          </box>
        </Show>
      </box>
    </box>
  )
}
