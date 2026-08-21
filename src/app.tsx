import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, onMount, Show } from "solid-js"
import { AuthProvider, useAuth } from "./context/auth"
import { ModeProvider, useMode } from "./context/mode"
import { BuffersProvider, useBuffers } from "./context/buffers"
import { KeymapProvider } from "./context/keymap"
import { YankProvider } from "./context/yank"
import { StatusBar } from "./ui/statusbar"
import { CommandPalette } from "./command/palette"
import { ThemePicker } from "./command/theme-picker"
import { CursorPicker } from "./command/cursor-picker"
import { Layout } from "./panes/layout"
import { initCommands } from "./command/commands"
import { COLORS } from "./ui/colors"
import { activePicker } from "./command/picker-state"
import type { SurpConfig } from "./config"

interface AppProps {
  config: Required<SurpConfig>
}

function AppInner(props: AppProps) {
  const dimensions = useTerminalDimensions()
  const auth = useAuth()
  const buffers = useBuffers()
  const mode = useMode()

  const width = createMemo(() => dimensions().width)
  const height = createMemo(() => dimensions().height)
  const inCommand = createMemo(() => mode.is("command"))
  const contentHeight = createMemo(() => Math.max(1, height() - 1))

  onMount(() => {
    initCommands(buffers, auth, mode)
    buffers.open("dashboard")
  })

  return (
    <box
      flexDirection="column"
      width={width()}
      height={height()}
      backgroundColor={COLORS.background}
    >
      {/* Content area: layout + overlays */}
      <box flexGrow={1} height={contentHeight()} width={width()} position="relative">
        <Layout width={width()} height={contentHeight()} />
        <Show when={inCommand()}>
          <box position="absolute" top={0} left={0} width={width()} height={contentHeight()}>
            <CommandPalette width={width()} height={contentHeight()} />
          </box>
        </Show>
        <Show when={activePicker() === "theme"}>
          <box position="absolute" top={0} left={0} width={width()} height={contentHeight()}>
            <ThemePicker width={width()} height={contentHeight()} />
          </box>
        </Show>
        <Show when={activePicker() === "cursor"}>
          <box position="absolute" top={0} left={0} width={width()} height={contentHeight()}>
            <CursorPicker width={width()} height={contentHeight()} />
          </box>
        </Show>
      </box>

      <StatusBar width={width()} />
    </box>
  )
}

export function App(props: AppProps) {
  return (
    <AuthProvider>
      <ModeProvider>
        <BuffersProvider>
          <YankProvider>
            <KeymapProvider keybindings={props.config.keybindings}>
              <AppInner config={props.config} />
            </KeymapProvider>
          </YankProvider>
        </BuffersProvider>
      </ModeProvider>
    </AuthProvider>
  )
}
