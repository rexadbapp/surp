import { createContext, createSignal, useContext } from "solid-js"
import type { JSX } from "solid-js"

interface YankApi {
  yank(text: string, label?: string): void
  paste(): Promise<string>
  register(): string
  notification(): string | null
}

const YankContext = createContext<YankApi>()

const IS_MAC = process.platform === "darwin"
const COPY_CMD = IS_MAC ? ["pbcopy"] : ["xclip", "-selection", "clipboard"]
const PASTE_CMD = IS_MAC ? ["pbpaste"] : ["xclip", "-selection", "clipboard", "-o"]

export function YankProvider(props: { children: JSX.Element }) {
  const [register, setRegister] = createSignal("")
  const [notification, setNotification] = createSignal<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  function yank(text: string, label?: string) {
    setRegister(text)
    const preview = text.length > 32 ? text.slice(0, 31) + "…" : text
    setNotification(`${label ? label + ": " : ""}${preview}`)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => setNotification(null), 1500)

    try {
      const proc = Bun.spawn(COPY_CMD, { stdin: "pipe", stderr: "ignore" })
      proc.stdin.write(text)
      proc.stdin.end()
    } catch {}
  }

  async function paste(): Promise<string> {
    try {
      const proc = Bun.spawn(PASTE_CMD, { stdout: "pipe", stderr: "ignore" })
      const text = await new Response(proc.stdout).text()
      return text.trimEnd() || register()
    } catch {
      return register()
    }
  }

  return (
    <YankContext.Provider value={{ yank, paste, register, notification }}>
      {props.children}
    </YankContext.Provider>
  )
}

export function useYank() {
  return useContext(YankContext)!
}
