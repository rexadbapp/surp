import { useTerminalDimensions, useRenderer } from "@opentui/solid"
import { createMemo, onMount, Show } from "solid-js"
import { AuthProvider, useAuth } from "./context/auth"
import { ConnectionProvider, useConnection } from "./context/connection"
import { ModeProvider, useMode } from "./context/mode"
import { BuffersProvider, useBuffers } from "./context/buffers"
import { KeymapProvider } from "./context/keymap"
import { YankProvider } from "./context/yank"
import { StatusBar } from "./ui/statusbar"
import { CommandPalette } from "./command/palette"
import { ThemePicker } from "./command/theme-picker"
import { CursorPicker } from "./command/cursor-picker"
import { ProviderLogin } from "./command/provider-login"
import { ModelPicker } from "./command/model-picker"
import { installProviderLoginHandler } from "./agent/providers"
import { installModelPickerHandler } from "./agent/model-picker"
import { TooltipLayer } from "./ui/tooltip"
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
  const renderer = useRenderer()
  const auth = useAuth()
  const connCtx = useConnection()
  const buffers = useBuffers()
  const mode = useMode()

  // Register before buffers mount so the modal outranks their key handlers.
  installProviderLoginHandler(renderer.keyInput)
  installModelPickerHandler(renderer.keyInput)

  const width = createMemo(() => dimensions().width)
  const height = createMemo(() => dimensions().height)
  const inCommand = createMemo(() => mode.is("command"))
  const contentHeight = createMemo(() => Math.max(1, height() - 1))

  onMount(() => {
    initCommands(buffers, auth, mode, connCtx)
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
        <Show when={activePicker() === "provider-login"}>
          <box position="absolute" top={0} left={0} width={width()} height={contentHeight()}>
            <ProviderLogin width={width()} height={contentHeight()} />
          </box>
        </Show>
        <Show when={activePicker() === "model-picker"}>
          <box position="absolute" top={0} left={0} width={width()} height={contentHeight()}>
            <ModelPicker width={width()} height={contentHeight()} />
          </box>
        </Show>
        <TooltipLayer width={width()} height={contentHeight()} />
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
          <ConnectionProvider>
            <YankProvider>
              <KeymapProvider keybindings={props.config.keybindings}>
                <AppInner config={props.config} />
              </KeymapProvider>
            </YankProvider>
          </ConnectionProvider>
        </BuffersProvider>
      </ModeProvider>
    </AuthProvider>
  )
}
