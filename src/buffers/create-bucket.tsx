import { createSignal, createMemo, Show, onMount, onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import { useConnection } from "../context/connection"
import { useMode } from "../context/mode"
import { useBuffers } from "../context/buffers"
import { createStorageBucket } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

type Field = "name" | "public"

export function CreateBucketBuffer(props: BufferProps) {
  const connCtx = useConnection()
  const mode = useMode()
  const buffers = useBuffers()
  const renderer = useRenderer()

  const ref = () => String(props.meta.data?.["project"] ?? "")

  const [name, setName] = createSignal("")
  const [isPublic, setIsPublic] = createSignal(true)
  const [submitting, setSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  async function submit() {
    const n = name().trim()
    if (!n) { setError("Bucket name is required"); return }
    const conn = connCtx.active()
    if (!conn) { setError("No database connected — use :connect"); return }
    setSubmitting(true)
    setError(null)
    try {
      await createStorageBucket(conn.driver, n, isPublic())
      buffers.close(props.meta.id)
      buffers.open("storage", { project: ref() }, ref() ? `Storage: ${ref()}` : "Storage")
    } catch (e) {
      setError(String(e))
      setSubmitting(false)
    }
  }

  function cancel() { buffers.close(props.meta.id) }

  onMount(() => {
    const kh = renderer.keyInput

    function onKey(event: KeyEvent) {
      if (!props.focused || mode.is("command") || submitting()) return
      if (event.name === "escape") { cancel(); return }
      if (event.name === "tab" && !event.shift) { setIsPublic(v => !v); return }
      if (event.name === "tab" && event.shift) { setIsPublic(v => !v); return }
      if (event.name === "return" || event.name === "enter") { void submit(); return }

      if (event.name === "backspace") {
        setName(c => c.slice(0, -1))
        return
      }
      if (event.name.length === 1 && !event.ctrl && !event.meta) {
        const ch = event.shift ? event.name.toUpperCase() : event.name
        if (/[a-zA-Z0-9_-]/.test(ch)) setName(c => c + ch)
      }
    }

    kh.on("keypress", onKey)
    onCleanup(() => kh.off("keypress", onKey))
  })

  const formW = createMemo(() => Math.min(50, props.width - 4))

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      <box height={1} paddingLeft={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.green} attributes={1}>Create Bucket  </text>
        <text fg={COLORS.blue}>{ref()}</text>
      </box>

      <box flexDirection="column" width={props.width} height={props.height - 2}
        alignItems="center" justifyContent="center" backgroundColor={COLORS.background}>
        <box flexDirection="column" width={formW()}>
          <box paddingBottom={1}>
            <text fg={COLORS.mauve} attributes={1}>New Storage Bucket</text>
          </box>

          <box flexDirection="row">
            <box width={14} height={1}><text fg={COLORS.text}>Name</text></box>
            <box width={formW() - 14} height={1} backgroundColor={COLORS.overlay} paddingLeft={1}>
              <text fg={name() ? COLORS.text : COLORS.muted}>
                {name() || "my-bucket"}{"█"}
              </text>
            </box>
          </box>
          <box height={1} />

          <box flexDirection="row">
            <box width={14} height={1}><text fg={COLORS.text}>Public</text></box>
            <box width={formW() - 14} height={1} backgroundColor={COLORS.overlay} paddingLeft={1}>
              <text fg={isPublic() ? COLORS.green : COLORS.red}>
                {isPublic() ? "enabled" : "disabled"}
              </text>
              <text fg={COLORS.muted}>  tab to toggle</text>
            </box>
          </box>
          <box height={1} />

          <Show when={error()}>
            <box height={1}><text fg={COLORS.red}>{error()}</text></box>
            <box height={1} />
          </Show>

          <Show when={submitting()}>
            <box height={1}><text fg={COLORS.yellow}>Creating bucket…</text></box>
            <box height={1} />
          </Show>

          <box height={1} />
          <text fg={COLORS.muted}>Enter create · Tab toggle public · Esc cancel</text>
        </box>
      </box>
    </box>
  )
}
