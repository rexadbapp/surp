import { createSignal, createMemo, createEffect, onMount, onCleanup, Show, For } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import { useConnection } from "../context/connection"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import { runQuery, listTables } from "../auth/api"
import { pendingSnippetSql, setPendingSnippetSql } from "../panes/sidebar"
import type { BufferProps } from "./types"
import { SqlEditor } from "./sql-editor"
import { COLORS } from "../ui/colors"

const MAX_COL_W = 28
const MAX_ROWS  = 100

function tryParse(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) } catch { return null }
}

function calcResultWidths(cols: string[], rows: Record<string, unknown>[]): number[] {
  return cols.map(col => {
    const maxData = rows.slice(0, 50).reduce((m, r) => Math.max(m, String(r[col] ?? "").length), 0)
    return Math.min(Math.max(col.length, maxData, 3), MAX_COL_W)
  })
}

function trunc(s: string, w: number) { return s.length <= w ? s : s.slice(0, w - 1) + "…" }

export function SqlBuffer(props: BufferProps) {
  const connCtx  = useConnection()
  const keymap   = useKeymap()
  const yank     = useYank()
  const renderer = useRenderer()

  function initQuery(): string {
    const s = props.meta.data?.["schema"]
    const t = props.meta.data?.["table"]
    const raw = props.meta.data?.["row"]
    const row: Record<string, unknown> | null = raw ? tryParse(raw) : null
    if (s && t && row) {
      const esc = (v: unknown) => {
        if (v == null) return "NULL"
        if (typeof v === "number") return String(v)
        if (typeof v === "boolean") return v ? "TRUE" : "FALSE"
        return `'${String(v).replace(/'/g, "''")}'`
      }
      const entries = Object.entries(row)
      const colList = entries.map(([c]) => `"${c}"`).join(", ")
      const valList = entries.map(([, v]) => esc(v)).join(", ")
      return `INSERT INTO "${s}"."${t}" (${colList})\nVALUES (${valList});`
    }
    if (s && t) return `SELECT * FROM "${s}"."${t}" LIMIT 100;`
    return "SELECT 1;"
  }

  const [query,       setQuery]       = createSignal(initQuery())
  const [results,     setResults]     = createSignal<Record<string, unknown>[]>([])
  const [error,       setError]       = createSignal<string | null>(null)
  const [running,     setRunning]     = createSignal(false)
  const [editing,     setEditing]     = createSignal(false)
  const [completions, setCompletions] = createSignal<string[]>([])
  const [loadedFor, setLoadedFor] = createSignal<string | null>(null)

  // Watch for snippet loads from the sidebar
  createEffect(() => {
    const sql = pendingSnippetSql()
    if (sql !== null) {
      setQuery(sql)
      setPendingSnippetSql(null)
    }
  })

  createEffect(() => {
    const id = connCtx.active()?.id ?? null
    if (id !== loadedFor()) {
      setLoadedFor(id)
      setResults([])
      setError(null)
      setCompletions([])
    }
  })

  function handleModeChange(m: "normal" | "insert" | "visual") {
    setEditing(m === "insert" || m === "visual")
  }

  const projectRef = () => String(props.meta.data?.["project"] ?? "")

  onMount(async () => {
    const conn = connCtx.active()
    if (!conn) return
    try {
      const [tables] = await Promise.all([listTables(conn.driver)])
      setCompletions(tables.flatMap(t => [t.name, `${t.schema}.${t.name}`]))
    } catch {}
  })

  onMount(() => {
    const kh = renderer.keyInput
    function onKey(e: KeyEvent) {
      if (!props.focused) return
    }
    kh.on("keypress", onKey)
    onCleanup(() => kh.off("keypress", onKey))
  })

  async function execute() {
    const conn = connCtx.active()
    if (!conn) { setError("No database connected — use :connect"); return }
    setRunning(true); setError(null)
    try {
      const result = await runQuery(conn.driver, query())
      if (result.error) setError(result.error)
      else setResults(result.rows)
    } finally { setRunning(false) }
  }

  keymap.onAction("select",   () => { if (props.focused && !editing()) void execute() })
  keymap.onAction("refresh",  () => { if (props.focused && !editing()) void execute() })
  keymap.onAction("yank",     () => { if (props.focused && !editing()) yank.yank(query(), "query") })
  keymap.onAction("yank_row", () => { if (props.focused && !editing()) yank.yank(query(), "query") })
  keymap.onAction("paste", () => {
    if (!props.focused || editing()) return
    void (async () => {
      const text = await yank.paste()
      if (text) setQuery(q => q + text)
    })()
  })

  const cols         = createMemo(() => results().length ? Object.keys(results()[0]!) : [])
  const resultWidths = createMemo(() => calcResultWidths(cols(), results()))
  const editorH      = createMemo(() => Math.max(10, Math.min(16, Math.floor(props.height * 0.4))))
  const visRows      = createMemo(() => results().slice(0, MAX_ROWS))

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>

      {/* Header */}
      <box paddingLeft={1} height={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.subtext} attributes={1}>SQL  </text>
        <text fg={COLORS.muted}>{projectRef() || connCtx.active()?.label || "no connection"}  </text>
        <text fg={COLORS.muted}>[i: edit | enter/r: run | space e: snippets | yy: yank]</text>
      </box>

      {/* Editor + results */}
      <box flexDirection="column" flexGrow={1}>
        <SqlEditor
          value={query()}
          onEdit={setQuery}
          onSubmit={() => void execute()}
          onModeChange={handleModeChange}
          onYankSelection={(text) => yank.yank(text, "selection")}
          focused={props.focused}
          width={props.width}
          height={editorH()}
          completions={completions()}
        />

        <box height={1} paddingLeft={1} backgroundColor={COLORS.background}>
          <Show when={running()}>
            <text fg={COLORS.yellow}>⠿ running…</text>
          </Show>
          <Show when={!running() && results().length > 0 && !error()}>
            <text fg={COLORS.muted}>{results().length} row{results().length !== 1 ? "s" : ""}</text>
          </Show>
        </box>

        <box flexDirection="column" flexGrow={1} paddingLeft={1} overflow={"hidden" as any}>
          <Show when={error()}>
            <box paddingTop={1}><text fg={COLORS.red}>{error()}</text></box>
          </Show>
          <Show when={!error() && results().length > 0}>
            <box flexDirection="row" height={1} backgroundColor={COLORS.surface}>
              <For each={cols()}>
                {(col, i) => <text fg={COLORS.blue} attributes={1} width={(resultWidths()[i()] ?? MAX_COL_W) + 1}>{trunc(col, resultWidths()[i()] ?? MAX_COL_W)}</text>}
              </For>
            </box>
            <For each={visRows()}>
              {(row) => (
                <box flexDirection="row" height={1}>
                  <For each={cols()}>
                    {(col, i) => {
                      const w = resultWidths()[i()] ?? MAX_COL_W
                      const v = row[col]
                      return <text fg={v == null ? COLORS.muted : COLORS.text} width={w + 1}>{v == null ? "NULL" : trunc(String(v), w)}</text>
                    }}
                  </For>
                </box>
              )}
            </For>
          </Show>
        </box>
      </box>
    </box>
  )
}
