#!/usr/bin/env bun
// Preload must happen before any other imports for bun runtime
import "@opentui/solid/preload"
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"
import { loadConfig } from "./config"
import { loadTheme, themeStore } from "./ui/theme"
import { setCursorThemeByName } from "./ui/cursor"
import { setDestroyer } from "./command/commands"
import { App } from "./app"

async function main() {
  const config = await loadConfig()
  await loadTheme(config.theme)
  setCursorThemeByName(config.cursorTheme)

  const renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    exitOnCtrlC: false,
    targetFps: 60,
    useMouse: true,
    autoFocus: true,
    backgroundColor: themeStore.background,
    useKittyKeyboard: {},
    clearOnShutdown: true,
  })

  setDestroyer(() => {
    renderer.destroy()
    process.exit(0)
  })

  await render(() => <App config={config} />, renderer)
}

main().catch((err) => {
  console.error("surp crashed:", err)
  process.exit(1)
})
