import { createSignal, onMount, onCleanup, Show, Switch, Match } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent, PasteEvent } from "@opentui/core"
import { useAuth } from "../context/auth"
import { useMode } from "../context/mode"
import { useBuffers } from "../context/buffers"
import { createLoginSession, openBrowser } from "../auth/login-flow"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

type Step = "opening" | "waiting_code" | "verifying" | "done" | "error"

export function LoginBuffer(props: BufferProps) {
  const auth = useAuth()
  const mode = useMode()
  const buffers = useBuffers()
  const renderer = useRenderer()

  const [step, setStep] = createSignal<Step>("opening")
  const [code, setCode] = createSignal("")
  const [error, setError] = createSignal("")
  const [url, setUrl] = createSignal("")

  let submitFn: ((code: string) => Promise<string>) | null = null

  onMount(async () => {
    try {
      const session = await createLoginSession()
      setUrl(session.url)
      submitFn = session.submit
      openBrowser(session.url)
      setStep("waiting_code")
      mode.enterInsert()
    } catch (e) {
      setError(String(e))
      setStep("error")
    }
  })

  async function submit() {
    const c = code().trim()
    if (!c || !submitFn) return
    setStep("verifying")
    try {
      const token = await submitFn(c)
      await auth.setToken(token)
      setStep("done")
      mode.enterNormal()
      setTimeout(() => {
        buffers.close(props.meta.id)
        buffers.open("projects")
      }, 1200)
    } catch (e) {
      setError(String(e))
      setStep("error")
    }
  }

  onMount(() => {
    const kh = renderer.keyInput

    function onKey(event: KeyEvent) {
      if (!props.focused || step() !== "waiting_code" || mode.is("command")) return
      if (event.name === "escape") { mode.enterNormal(); return }
      if (event.name === "return" || event.name === "enter") { void submit(); return }
      if (event.name === "backspace") { setCode((c) => c.slice(0, -1)); return }
      if (event.name.length === 1 && !event.ctrl && !event.meta) {
        const ch = event.shift ? event.name.toUpperCase() : event.name
        setCode((c) => c + ch)
      }
    }

    function onPaste(event: PasteEvent) {
      if (!props.focused || step() !== "waiting_code") return
      const text = new TextDecoder().decode(event.bytes).trim()
      if (text) setCode(text)
    }

    kh.on("keypress", onKey)
    kh.on("paste", onPaste)
    onCleanup(() => {
      kh.off("keypress", onKey)
      kh.off("paste", onPaste)
      if (mode.is("insert")) mode.enterNormal()
    })
  })

  // Render code input: cursor only shows at start when empty, after text when not
  const codeDisplay = () => code() + "█"

  return (
    <box
      flexDirection="column"
      width={props.width}
      height={props.height}
      alignItems="center"
      justifyContent="center"
      backgroundColor={COLORS.background}
    >
      <box flexDirection="column" width={62}>

        <box paddingBottom={1}>
          <text fg={COLORS.mauve} attributes={1}>surp — Login to Supabase</text>
        </box>

        <Switch>
          <Match when={step() === "opening"}>
            <text fg={COLORS.yellow}>Opening browser...</text>
          </Match>

          <Match when={step() === "waiting_code"}>
            <box flexDirection="column">
              <text fg={COLORS.green}>✓ Browser opened</text>

              <box paddingTop={1} paddingBottom={1}>
                <text fg={COLORS.subtext}>
                  Complete login in the browser, then enter the verification code:
                </text>
              </box>

              {/* Code input — single text node avoids ghost block */}
              <box flexDirection="row" paddingBottom={1} alignItems="center">
                <text fg={COLORS.text} attributes={1}>Code: </text>
                <box
                  flexDirection="row"
                  backgroundColor={COLORS.overlay}
                  paddingLeft={1}
                  paddingRight={1}
                  width={34}
                >
                  <text fg={COLORS.green}>{code()}</text>
                  <text fg={COLORS.mauve}>█</text>
                </box>
              </box>

              <text fg={COLORS.muted}>Enter to confirm · Esc to cancel · Paste supported</text>

              <box paddingTop={1}>
                <text fg={COLORS.muted} wrapMode="word">{url()}</text>
              </box>
            </box>
          </Match>

          <Match when={step() === "verifying"}>
            <text fg={COLORS.yellow}>Verifying code with Supabase...</text>
          </Match>

          <Match when={step() === "done"}>
            <text fg={COLORS.green} attributes={1}>✓ Logged in! Opening projects...</text>
          </Match>

          <Match when={step() === "error"}>
            <box flexDirection="column">
              <text fg={COLORS.red}>✗ Login failed</text>
              <box paddingTop={1}>
                <text fg={COLORS.red} wrapMode="word">{error()}</text>
              </box>
              <box paddingTop={1}>
                <text fg={COLORS.muted}>Press q to close, then :login to try again</text>
              </box>
            </box>
          </Match>
        </Switch>
      </box>
    </box>
  )
}
