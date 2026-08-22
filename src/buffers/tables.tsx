import { createSignal, createEffect, For, Show, onMount } from "solid-js"
import { useConnection } from "../context/connection"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import { listTables, type Table } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"
import { hoverProps, isHovered } from "../ui/hover"

const tablesCache = new Map<string, Table[]>()

export function TablesBuffer(props: BufferProps) {
  const connCtx = useConnection()
  const buffers = useBuffers()
  const keymap = useKeymap()
  const yank = useYank()
  const [tables, setTables] = createSignal<Table[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [cursor, setCursor] = createSignal(0)
  const [loadedFor, setLoadedFor] = createSignal<string | null>(null)

  const projectRef = () => props.meta.data?.["project"] ?? ""
  const schema = () => props.meta.data?.["schema"] ?? "public"

  async function load() {
    const conn = connCtx.active()
    if (!conn) { setError("No database connected — use :connect"); setLoading(false); return }
    setLoadedFor(conn.id)
    setLoading(true)
    setError(null)
    try {
      const list = await listTables(conn.driver, schema())
      setTables(list)
      tablesCache.set(props.meta.id, list)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    const cached = tablesCache.get(props.meta.id)
    if (cached) { setLoadedFor(connCtx.active()?.id ?? null); setTables(cached); setLoading(false) }
    else void load()
  })

  createEffect(() => {
    const connId = connCtx.active()?.id ?? null
    if (connId && connId !== loadedFor()) {
      tablesCache.delete(props.meta.id)
      void load()
    }
  })

  keymap.onAction("refresh", () => {
    if (!props.focused) return
    tablesCache.delete(props.meta.id)
    void load()
  })
  keymap.onAction("move_up", () => {
    if (!props.focused) return
    setCursor((c) => Math.max(0, c - 1))
  })
  keymap.onAction("move_down", () => {
    if (!props.focused) return
    setCursor((c) => Math.min(tables().length - 1, c + 1))
  })
  keymap.onAction("yank", () => {
    if (!props.focused) return
    const t = tables()[cursor()]
    if (t) yank.yank(`${t.schema}.${t.name}`, "table")
  })
  keymap.onAction("select", () => {
    if (!props.focused) return
    const t = tables()[cursor()]
    if (t) {
      buffers.open(
        "table",
        { project: projectRef(), schema: t.schema, table: t.name },
        `${t.schema}.${t.name}`,
      )
    }
  })

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      {/* Header */}
      <box paddingLeft={1} height={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.subtext} attributes={1}>Tables  </text>
        <text fg={COLORS.muted}>{projectRef() || connCtx.active()?.label || "—"} / {schema()}</text>
      </box>

      <Show when={loading()}>
        <box paddingLeft={2} paddingTop={1}><text fg={COLORS.subtext}>Loading...</text></box>
      </Show>
      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1}><text fg={COLORS.red}>{error()}</text></box>
      </Show>
      <Show when={!loading() && tables().length === 0 && !error()}>
        <box paddingLeft={2} paddingTop={1}><text fg={COLORS.subtext}>No tables in schema "{schema()}"</text></box>
      </Show>

      <Show when={!loading()}>
        <For each={tables()}>
          {(table, i) => {
            const active = () => props.focused && i() === cursor()
            const hovered = () => isHovered(`tables-row-${props.meta.id}-${i()}`)
            return (
              <box
                flexDirection="row"
                paddingLeft={1}
                height={1}
                backgroundColor={active() ? COLORS.overlay : hovered() ? COLORS.surface : COLORS.background}
                {...hoverProps(`tables-row-${props.meta.id}-${i()}`)}
                onMouseUp={() => { setCursor(i()); buffers.open("table", { project: projectRef(), schema: table.schema, table: table.name }, `${table.schema}.${table.name}`) }}
              >
                <text fg={active() ? COLORS.blue : COLORS.text} width={32}>
                  {active() ? "▶ " : "  "}{table.name}
                </text>
                <text fg={COLORS.muted} width={12}>{table.schema}</text>
                <text fg={COLORS.subtext}>{table.columns?.length ?? 0} cols</text>
              </box>
            )
          }}
        </For>
      </Show>
    </box>
  )
}
