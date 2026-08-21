import { createSignal, createMemo, For, Show, onMount, onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent, PasteEvent } from "@opentui/core"
import { useAuth } from "../context/auth"
import { useMode } from "../context/mode"
import { useBuffers } from "../context/buffers"
import { createFunction } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"
import { tokenizeTsLine } from "./ts-tokenizer"

type Field = "slug" | "verify_jwt" | "entrypoint_path"
const FIELD_ORDER: Field[] = ["slug", "verify_jwt", "entrypoint_path"]

export function AddFunctionBuffer(props: BufferProps) {
  const auth = useAuth()
  const mode = useMode()
  const buffers = useBuffers()
  const renderer = useRenderer()

  const ref = () => String(props.meta.data?.["project"] ?? "")

  const [showCode, setShowCode] = createSignal(false)
  const [stepCursor, setStepCursor] = createSignal<Field>("slug")
  const [slug, setSlug] = createSignal("")
  const [verifyJwt, setVerifyJwt] = createSignal(true)
  const [entrypoint, setEntrypoint] = createSignal("index.ts")
  const [code, setCode] = createSignal("")
  const [submitting, setSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  // ── helpers ────────────────────────────────────────────────────────────────────
  function focusPrev() {
    const i = FIELD_ORDER.indexOf(stepCursor())
    setStepCursor(FIELD_ORDER[(i - 1 + FIELD_ORDER.length) % FIELD_ORDER.length]!)
  }
  function focusNext() {
    const i = FIELD_ORDER.indexOf(stepCursor())
    setStepCursor(FIELD_ORDER[(i + 1) % FIELD_ORDER.length]!)
  }

  async function submit() {
    const s = slug().trim()
    if (!s) { setError("Slug is required"); return }
    const token = auth.token()
    const r = ref()
    if (!token || !r) { setError("Not authenticated"); return }
    setSubmitting(true)
    setError(null)
    try {
      await createFunction(token, r, {
        name: s,
        slug: s,
        verify_jwt: verifyJwt(),
        entrypoint_path: entrypoint().trim() || "index.ts",
        body: code() || undefined,
      })
      buffers.close(props.meta.id)
      buffers.open("functions", { project: r }, `Functions: ${r}`)
    } catch (e) {
      setError(String(e))
      setSubmitting(false)
    }
  }

  function cancel() { buffers.close(props.meta.id) }

  // ── Single unified key handler ─────────────────────────────────────────────────
  onMount(() => {
    const kh = renderer.keyInput

    function onKey(event: KeyEvent) {
      if (!props.focused || mode.is("command")) return
      if (submitting()) return

      if (showCode()) {
        // ── Code step: raw multi-line input ────────────────────────────────
        if (event.name === "escape") {
          setShowCode(false); mode.enterNormal(); return
        }
        if ((event.name === "return" || event.name === "enter") && event.ctrl) {
          void submit(); return
        }
        if (event.name === "return" || event.name === "enter") {
          setCode(c => c + "\n"); return
        }
        if (event.name === "backspace") {
          setCode(c => c.slice(0, -1)); return
        }
        if (event.name === "tab") {
          setCode(c => c + "  "); return
        }
        if (event.name.length === 1 && !event.ctrl && !event.meta) {
          const ch = event.shift ? event.name.toUpperCase() : event.name
          setCode(c => c + ch)
        }
        return
      }

      // ── Form step ───────────────────────────────────────────────────────
      if (event.name === "escape") { cancel(); return }
      if (event.name === "tab" && !event.shift) { focusNext(); return }
      if (event.name === "tab" && event.shift) { focusPrev(); return }
      if (event.name === "return" || event.name === "enter") {
        if (!slug().trim()) { setError("Slug is required"); return }
        setError(null); setShowCode(true); return
      }

      const f = stepCursor()
      if (f === "verify_jwt") {
        if (event.name === "space" || event.name === "left" || event.name === "right")
          setVerifyJwt(v => !v)
        return
      }
      if (f === "slug" || f === "entrypoint_path") {
        if (event.name === "backspace") {
          if (f === "slug") setSlug(c => c.slice(0, -1))
          else setEntrypoint(c => c.slice(0, -1))
          return
        }
        if (event.name.length === 1 && !event.ctrl && !event.meta) {
          const ch = event.shift ? event.name.toUpperCase() : event.name
          if (f === "slug") {
            if (/[a-zA-Z0-9_-]/.test(ch)) setSlug(c => c + ch)
          } else {
            if (/[a-zA-Z0-9_./-]/.test(ch)) setEntrypoint(c => c + ch)
          }
        }
      }
    }

    function onPaste(event: PasteEvent) {
      if (!props.focused || mode.is("command")) return
      if (!showCode()) return
      const text = new TextDecoder().decode(event.bytes)
      if (text) setCode(c => c + text)
    }

    kh.on("keypress", onKey)
    kh.on("paste", onPaste)
    onCleanup(() => { kh.off("keypress", onKey); kh.off("paste", onPaste) })
  })

  const formW = createMemo(() => Math.min(60, props.width - 4))
  const bkg = (f: Field) => stepCursor() === f ? COLORS.overlay : COLORS.surface
  const ffg = (f: Field) => stepCursor() === f ? COLORS.blue : COLORS.text

  // ── Code display with highlighting ─────────────────────────────────────────────
  const codeLines = createMemo(() => {
    const lines = code().split("\n")
    const h = Math.max(1, props.height - 6)
    const start = Math.max(0, lines.length - h)
    return lines.slice(start)
  })

  function tokenSpans(line: string) {
    const tokens = tokenizeTsLine(line)
    return tokens.map(t => {
      let fg: string = COLORS.text
      if (t.type === "keyword") fg = COLORS.mauve
      else if (t.type === "builtin") fg = COLORS.blue
      else if (t.type === "string") fg = COLORS.green
      else if (t.type === "number") fg = COLORS.peach
      else if (t.type === "comment") fg = COLORS.muted
      else if (t.type === "operator") fg = COLORS.teal
      else if (t.type === "paren") fg = COLORS.yellow
      return { text: t.text, fg }
    })
  }

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      {/* Header */}
      <box height={1} paddingLeft={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.green} attributes={1}>New Function  </text>
        <text fg={COLORS.blue}>{ref()}</text>
        <text fg={COLORS.muted}>  {showCode() ? "code" : "metadata"}</text>
      </box>

      <Show when={!showCode()}>
        {/* ── Form ──────────────────────────────────────────────────────────── */}
        <box flexDirection="column" width={props.width} height={props.height - 2}
          alignItems="center" justifyContent="center" backgroundColor={COLORS.background}>
          <box flexDirection="column" width={formW()}>
            <box paddingBottom={1}>
              <text fg={COLORS.mauve} attributes={1}>Edge Function Metadata</text>
            </box>

            <box flexDirection="row">
              <box width={18} height={1}><text fg={ffg("slug")}>Slug</text></box>
              <box width={formW() - 18} height={1} backgroundColor={bkg("slug")} paddingLeft={1}>
                <text fg={slug() ? COLORS.text : COLORS.muted}>
                  {slug() || "my-function"}{stepCursor() === "slug" ? "█" : ""}
                </text>
              </box>
            </box>
            <box height={1} />

            <box flexDirection="row">
              <box width={18} height={1}><text fg={ffg("verify_jwt")}>Verify JWT</text></box>
              <box width={formW() - 18} height={1} backgroundColor={bkg("verify_jwt")} paddingLeft={1}>
                <text fg={verifyJwt() ? COLORS.green : COLORS.red}>
                  {verifyJwt() ? "enabled" : "disabled"}
                </text>
                <Show when={stepCursor() === "verify_jwt"}>
                  <text fg={COLORS.muted}>  space to toggle</text>
                </Show>
              </box>
            </box>
            <box height={1} />

            <box flexDirection="row">
              <box width={18} height={1}><text fg={ffg("entrypoint_path")}>Entrypoint</text></box>
              <box width={formW() - 18} height={1} backgroundColor={bkg("entrypoint_path")} paddingLeft={1}>
                <text fg={entrypoint() ? COLORS.text : COLORS.muted}>
                  {entrypoint() || "index.ts"}{stepCursor() === "entrypoint_path" ? "█" : ""}
                </text>
              </box>
            </box>
            <box height={1} />

            <Show when={error()}>
              <box height={1}><text fg={COLORS.red}>{error()}</text></box>
              <box height={1} />
            </Show>

            <box height={1} />
            <text fg={COLORS.muted}>Tab navigate · Enter write code · Esc cancel</text>
          </box>
        </box>
      </Show>

      <Show when={showCode()}>
        {/* ── Code editor (raw key handling, no textarea) ────────────────────── */}
        <box flexDirection="column" width={props.width} height={props.height - 2}
          backgroundColor={COLORS.surface}>
          <box height={1} paddingLeft={1}>
            <text fg={COLORS.subtext}>// {slug()}.ts</text>
          </box>
          <box height={1} paddingLeft={1}>
            <text fg={COLORS.muted}>  Esc back · Ctrl+Enter create · paste with Cmd/Ctrl+V</text>
          </box>
          <box flexDirection="column" flexGrow={1} paddingLeft={1} width={props.width}>
            <For each={codeLines()}>
              {(line) => (
                <box height={1} flexDirection="row">
                  <For each={tokenSpans(line)}>
                    {(span) => <text fg={span.fg}>{span.text}</text>}
                  </For>
                </box>
              )}
            </For>
            <Show when={codeLines().length === 0}>
              <box height={1}><text fg={COLORS.muted}>type or paste your edge function code here</text></box>
            </Show>
          </box>

          <Show when={error()}>
            <box height={1} paddingLeft={1}><text fg={COLORS.red}>{error()}</text></box>
          </Show>
          <Show when={submitting()}>
            <box height={1} paddingLeft={1}><text fg={COLORS.yellow}>Creating function…</text></box>
          </Show>
        </box>
      </Show>
    </box>
  )
}
