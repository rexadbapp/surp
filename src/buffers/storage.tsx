import { createSignal, createEffect, For, Show, onMount } from "solid-js"
import { useConnection } from "../context/connection"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import { getStorageBuckets, deleteStorageBucket, type StorageBucket } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"
import { hoverProps, isHovered } from "../ui/hover"

const cache = new Map<string, StorageBucket[]>()

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    })
  } catch { return iso }
}

export function StorageBuffer(props: BufferProps) {
  const connCtx = useConnection()
  const buffers = useBuffers()
  const keymap = useKeymap()
  const yank = useYank()

  const projectRef = () => String(props.meta.data?.["project"] ?? "")
  const [buckets, setBuckets] = createSignal<StorageBucket[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [cursor, setCursor] = createSignal(0)
  const [loadedFor, setLoadedFor] = createSignal<string | null>(null)

  async function load(force = false) {
    const conn = connCtx.active()
    if (!conn) { setError("No database connected — use :connect"); setLoading(false); return }
    setLoadedFor(conn.id)
    if (!force) {
      const cached = cache.get(conn.id)
      if (cached) { setBuckets(cached); setLoading(false); return }
    }
    setLoading(true)
    setError(null)
    try {
      const list = await getStorageBuckets(conn.driver)
      cache.set(conn.id, list)
      setBuckets(list)
      setCursor(0)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => void load())

  createEffect(() => {
    const connId = connCtx.active()?.id ?? null
    if (connId && connId !== loadedFor()) void load(true)
  })

  keymap.onAction("move_up", () => {
    if (!props.focused) return
    setCursor((c) => Math.max(0, c - 1))
  })
  keymap.onAction("move_down", () => {
    if (!props.focused) return
    setCursor((c) => Math.min(buckets().length - 1, c + 1))
  })
  keymap.onAction("yank", () => {
    if (!props.focused) return
    const b = buckets()[cursor()]
    if (b) yank.yank(b.id, b.name)
  })
  keymap.onAction("yank_row", () => {
    if (!props.focused) return
    const b = buckets()[cursor()]
    if (b) yank.yank(`${b.name}  ${b.public ? "public" : "private"}  ${b.object_count} objects`, "bucket")
  })
  keymap.onAction("select", () => {
    if (!props.focused) return
    const b = buckets()[cursor()]
    if (b) buffers.open("bucket", { project: projectRef(), bucketId: b.id, bucketName: b.name }, `Bucket: ${b.name}`)
  })
  keymap.onAction("delete", () => {
    if (!props.focused) return
    const b = buckets()[cursor()]
    if (!b) return
    const conn = connCtx.active()
    if (!conn) return
    deleteStorageBucket(conn.driver, b.id).then(() => {
      cache.delete(conn.id)
      void load(true)
    }).catch((e) => setError(String(e)))
  })
  keymap.onAction("create", () => {
    if (!props.focused) return
    const ref = projectRef()
    if (!ref) return
    buffers.open("create-bucket", { project: ref })
  })
  keymap.onAction("refresh", () => {
    if (!props.focused) return
    const conn = connCtx.active()
    if (conn) cache.delete(conn.id)
    void load(true)
  })

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      <box paddingLeft={1} paddingRight={1} backgroundColor={COLORS.overlay} height={1} flexDirection="row">
        <text fg={COLORS.green} attributes={1}>Storage  </text>
        <text fg={COLORS.blue}>{projectRef()}</text>
        <Show when={loading()}>
          <text fg={COLORS.yellow}>  loading…</text>
        </Show>
        <Show when={!loading() && !error()}>
          <text fg={COLORS.muted}>  {buckets().length} bucket{buckets().length !== 1 ? "s" : ""}</text>
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

      <Show when={!loading() && !error() && buckets().length === 0}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.subtext}>No storage buckets found for this project.</text>
        </box>
      </Show>

      <Show when={!loading()}>
        <For each={buckets()}>
          {(b, i) => {
            const active = () => props.focused && i() === cursor()
            const hovered = () => isHovered(`storage-row-${props.meta.id}-${i()}`)
            return (
              <box
                flexDirection="row"
                paddingLeft={1}
                paddingRight={1}
                height={1}
                backgroundColor={active() ? COLORS.overlay : hovered() ? COLORS.surface : COLORS.background}
                {...hoverProps(`storage-row-${props.meta.id}-${i()}`, `${b.name} — ${b.public ? "public" : "private"} · ${b.object_count} objects`)}
                onMouseUp={() => { setCursor(i()); buffers.open("bucket", { project: projectRef(), bucketId: b.id, bucketName: b.name }, `Bucket: ${b.name}`) }}
              >
                <text fg={active() ? COLORS.blue : COLORS.text} width={28}>
                  {active() ? "▶ " : "  "}{b.name}
                </text>
                <text fg={b.public ? COLORS.green : COLORS.yellow} width={8}>{b.public ? "public" : "private"}</text>
                <text fg={COLORS.muted} width={10}>{b.object_count} obj</text>
                <text fg={COLORS.subtext}>{formatDate(b.created_at)}</text>
              </box>
            )
          }}
        </For>
      </Show>
    </box>
  )
}
