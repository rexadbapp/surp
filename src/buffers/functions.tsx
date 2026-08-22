import { createSignal, For, Show, onMount } from "solid-js"
import { useAuth } from "../context/auth"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import { listFunctions, type EdgeFunction } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"
import { hoverProps, isHovered } from "../ui/hover"

const fnCache = new Map<string, EdgeFunction[]>()

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    })
  } catch { return iso }
}

export function FunctionsBuffer(props: BufferProps) {
  const auth = useAuth()
  const buffers = useBuffers()
  const keymap = useKeymap()
  const yank = useYank()

  const projectRef = () => String(props.meta.data?.["project"] ?? "")
  const [fns, setFns] = createSignal<EdgeFunction[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [cursor, setCursor] = createSignal(0)

  async function load(force = false) {
    const token = auth.token()
    const ref = projectRef()
    if (!token || !ref) { setLoading(false); return }
    if (!force) {
      const cached = fnCache.get(ref)
      if (cached) { setFns(cached); setLoading(false); return }
    }
    setLoading(true)
    setError(null)
    try {
      const list = await listFunctions(token, ref)
      fnCache.set(ref, list)
      setFns(list)
      setCursor(0)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => void load())

  keymap.onAction("move_up", () => {
    if (!props.focused) return
    setCursor((c) => Math.max(0, c - 1))
  })
  keymap.onAction("move_down", () => {
    if (!props.focused) return
    setCursor((c) => Math.min(fns().length - 1, c + 1))
  })
  keymap.onAction("yank", () => {
    if (!props.focused) return
    const fn = fns()[cursor()]
    if (fn) yank.yank(fn.slug, fn.name)
  })
  keymap.onAction("yank_row", () => {
    if (!props.focused) return
    const fn = fns()[cursor()]
    if (fn) {
      const url = `https://${projectRef()}.supabase.co/functions/v1/${fn.slug}`
      yank.yank(`${fn.name}  ${url}`, "function")
    }
  })
  keymap.onAction("select", () => {
    if (!props.focused) return
    const fn = fns()[cursor()]
    if (fn) buffers.open("function", { project: projectRef(), slug: fn.slug }, `fn:${fn.slug}`)
  })
  keymap.onAction("create", () => {
    if (!props.focused) return
    buffers.open("add-function", { project: projectRef() })
  })

  keymap.onAction("refresh", () => {
    if (!props.focused) return
    fnCache.delete(projectRef())
    void load(true)
  })

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      <box paddingLeft={1} paddingRight={1} backgroundColor={COLORS.overlay} height={1} flexDirection="row">
        <text fg={COLORS.green} attributes={1}>Functions  </text>
        <text fg={COLORS.blue}>{projectRef()}</text>
        <Show when={loading()}>
          <text fg={COLORS.yellow}>  loading…</text>
        </Show>
        <Show when={!loading() && !error()}>
          <text fg={COLORS.muted}>  {fns().length} function{fns().length !== 1 ? "s" : ""}</text>
        <Show when={props.focused}>
          <text fg={COLORS.muted}>  ·  c create  enter open</text>
        </Show>
        </Show>
      </box>

      <Show when={loading()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.subtext}>Loading...</text>
        </box>
      </Show>

      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.red}>{error()}</text>
        </box>
      </Show>

      <Show when={!loading() && !error() && fns().length === 0}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.subtext}>No edge functions found for this project.</text>
        </box>
      </Show>

      <Show when={!loading()}>
        <For each={fns()}>
          {(fn, i) => {
            const id = `fn-row-${props.meta.id}-${i()}`
            const active = () => props.focused && i() === cursor()
            const hovered = () => isHovered(id)
            return (
              <box
                flexDirection="row"
                paddingLeft={1}
                paddingRight={1}
                height={1}
                backgroundColor={active() ? COLORS.overlay : hovered() ? COLORS.surface : COLORS.background}
                {...hoverProps(id, `${fn.slug} · ${fn.status} · ↵ open`)}
                onMouseUp={() => { setCursor(i()); buffers.open("function", { project: projectRef(), slug: fn.slug }, `fn:${fn.slug}`) }}
              >
                <text fg={active() ? COLORS.blue : COLORS.text} width={28}>
                  {active() ? "▶ " : "  "}{fn.slug}
                </text>
                <text fg={COLORS.muted} width={12}>{fn.status}</text>
                <text fg={COLORS.subtext} width={6}>v{fn.version}</text>
                <text fg={COLORS.muted}>{formatDate(fn.updated_at)}</text>
              </box>
            )
          }}
        </For>
      </Show>
    </box>
  )
}
