import { createSignal, createEffect, onMount, onCleanup, For, Show } from "solid-js"
import type { MouseEvent, KeyEvent } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import type { BufferType } from "../buffers/types"
import { useAuth } from "../context/auth"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import { listTables, listSnippets, type Table } from "../auth/api"
import { readLocalSnippets, saveLocalSnippet, deleteLocalSnippet } from "../lib/local-snippets"
import { COLORS } from "../ui/colors"

interface SidebarProps {
  projectRef: string | null
  projectName: string
  width: number
  height: number
  focused: boolean
  onClose: () => void
  activeBufferType: BufferType | null
}

interface DisplaySnippet {
  id: string
  name: string
  sql: string
  source: "local" | "remote"
}

function trunc(s: string, w: number) { return s.length <= w ? s : s.slice(0, w - 1) + "…" }

export const [pendingSnippetSql, setPendingSnippetSql] = createSignal<string | null>(null)
export const [sidebarFocusedForSql, setSidebarFocusedForSql] = createSignal(false)

const tableCache = new Map<string, Table[]>()

export function Sidebar(props: SidebarProps) {
  const auth    = useAuth()
  const buffers = useBuffers()
  const keymap  = useKeymap()
  const yank    = useYank()
  const renderer = useRenderer()

  const [tables, setTables] = createSignal<Table[]>([])
  const [loading, setLoading] = createSignal(false)
  const [cursor, setCursor] = createSignal(0)

  const [snippets,       setSnippets]       = createSignal<DisplaySnippet[]>([])
  const [snippetIdx,     setSnippetIdx]     = createSignal(0)
  const [namingInput,    setNamingInput]    = createSignal<string | null>(null)
  const [snippetLoading, setSnippetLoading] = createSignal(false)

  function onScroll(e: MouseEvent) {
    if (!e.scroll) return
    const dir = e.scroll.direction
    if (dir === "up") setCursor(c => Math.max(0, c - 1))
    else if (dir === "down") setCursor(c => Math.min(tables().length - 1, c + 1))
  }

  const isSql = () => props.activeBufferType === "sql"
  const snippetRef = () => props.projectRef ?? "default"

  async function fetchTables(token: string, ref: string) {
    setLoading(true)
    try {
      const list = await listTables(token, ref)
      setTables(list)
      tableCache.set(ref, list)
    } catch {}
    finally { setLoading(false) }
  }

  createEffect(() => {
    const ref = props.projectRef
    if (!ref) { setTables([]); return }
    const cached = tableCache.get(ref)
    if (cached) { setTables(cached); return }
    const token = auth.token()
    if (token) void fetchTables(token, ref)
  })

  // ── snippet logic ───────────────────────────────────────────────────────────

  function mergeSnippets(local: { id: string; name: string; sql: string }[], remote: { id: string; name: string; content: { sql: string } }[]): DisplaySnippet[] {
    const loc: DisplaySnippet[] = local.map(s => ({ id: s.id, name: s.name, sql: s.sql, source: "local" as const }))
    const rem: DisplaySnippet[] = remote.map(s => ({ id: s.id, name: s.name, sql: s.content.sql, source: "remote" as const }))
    return [...loc, ...rem]
  }

  async function loadSnippets() {
    const token = auth.token()
    setSnippetLoading(true)
    try {
      const local = readLocalSnippets(snippetRef())
      const remote = token ? await listSnippets(token, snippetRef()).catch(() => []) : []
      setSnippets(mergeSnippets(local, remote))
    } catch { setSnippets([]) }
    setSnippetLoading(false)
  }

  createEffect(() => {
    setSidebarFocusedForSql(props.focused && isSql())
    onCleanup(() => setSidebarFocusedForSql(false))
  })
  createEffect(() => {
    if (!isSql()) return
    void loadSnippets()
  })

  function saveSnippet(name: string) {
    if (!name.trim()) return
    const s = saveLocalSnippet(snippetRef(), name.trim(), "")
    setSnippets(p => [{ id: s.id, name: s.name, sql: s.sql, source: "local" }, ...p])
    setSnippetIdx(0)
  }

  function removeSnippet(id: string) {
    const s = snippets().find(x => x.id === id)
    if (!s || s.source !== "local") return
    deleteLocalSnippet(snippetRef(), id)
    setSnippets(p => p.filter(x => x.id !== id))
    setSnippetIdx(i => Math.max(0, Math.min(i, snippets().length - 2)))
  }

  function loadSnippetToEditor(snippet: DisplaySnippet) {
    setPendingSnippetSql(snippet.sql)
    props.onClose()
  }

  // ── key capture for naming mode + snippet actions ──────────────────────────

  onMount(() => {
    const kh = renderer.keyInput
    function onKey(e: KeyEvent) {
      if (!props.focused || !isSql()) return
      e.preventDefault()
      const naming = namingInput()
      if (naming !== null) {
        if (e.name === "escape") { setNamingInput(null); return }
        if (e.name === "return" || e.name === "enter") {
          setNamingInput(null)
          if (naming.trim()) saveSnippet(naming)
          return
        }
        if (e.name === "backspace" || e.name === "delete") {
          setNamingInput(s => (s ?? "").slice(0, -1)); return
        }
        if (e.sequence && e.sequence.length === 1 && !e.ctrl && !e.meta) {
          setNamingInput(s => (s ?? "") + e.sequence)
        }
        return
      }
      if ((e.name === "n" || e.name === "w") && !e.ctrl) {
        setNamingInput(""); return
      }
    }
    kh.on("keypress", onKey)
    onCleanup(() => kh.off("keypress", onKey))
  })

  // ── action keymaps ──────────────────────────────────────────────────────────

  keymap.onAction("move_down", () => {
    if (!props.focused) return
    if (isSql()) setSnippetIdx(i => Math.min(i + 1, snippets().length - 1))
    else setCursor((c) => Math.min(c + 1, tables().length - 1))
  })
  keymap.onAction("move_up", () => {
    if (!props.focused) return
    if (isSql()) setSnippetIdx(i => Math.max(i - 1, 0))
    else setCursor((c) => Math.max(c - 1, 0))
  })
  keymap.onAction("select", () => {
    if (!props.focused) return
    if (isSql()) {
      const s = snippets()[snippetIdx()]
      if (s) loadSnippetToEditor(s)
    } else {
      const t = tables()[cursor()]
      const ref = props.projectRef
      if (t && ref) {
        buffers.open("table", { project: ref, schema: t.schema, table: t.name }, `${t.schema}.${t.name}`)
      }
    }
  })
  keymap.onAction("escape", () => {
    if (!props.focused) return
    if (isSql() && namingInput() !== null) { setNamingInput(null); return }
    props.onClose()
  })
  keymap.onAction("yank", () => {
    if (!props.focused) return
    if (isSql()) {
      const s = snippets()[snippetIdx()]
      if (s) yank.yank(s.sql, "snippet")
    } else {
      const t = tables()[cursor()]
      if (t) yank.yank(`${t.schema}.${t.name}`, "table")
    }
  })
  keymap.onAction("refresh", () => {
    if (!props.focused) return
    const ref = props.projectRef
    if (!ref) return
    if (isSql()) {
      void loadSnippets()
    } else {
      tableCache.delete(ref)
      const token = auth.token()
      if (token) void fetchTables(token, ref)
    }
  })
  keymap.onAction("delete", () => {
    if (!props.focused || !isSql()) return
    const s = snippets()[snippetIdx()]
    if (s) removeSnippet(s.id)
  })

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <box flexDirection="column" width={props.width} height={props.height} backgroundColor={COLORS.surface} onMouseScroll={onScroll}>
      <box
        height={1}
        paddingLeft={1}
        backgroundColor={props.focused ? COLORS.blue : COLORS.overlay}
      >
        <text fg={props.focused ? COLORS.surface : COLORS.blue} attributes={1}>
          ≡ {isSql() ? "Snippets" : props.projectName || "Explorer"}
        </text>
      </box>

      <Show when={isSql()}>
        <Show when={snippetLoading()}>
          <box paddingLeft={2}><text fg={COLORS.muted}>loading…</text></box>
        </Show>
        <Show when={!snippetLoading() && snippets().length === 0}>
          <box paddingLeft={2} paddingTop={1}>
            <text fg={COLORS.muted}>no snippets</text>
          </box>
        </Show>
        <box flexDirection="column" flexGrow={1} paddingLeft={1} overflow={"hidden" as any}>
          <For each={snippets()}>
            {(s, i) => {
              const sel = () => props.focused && i() === snippetIdx()
              const mark = s.source === "local" ? "★" : "↓"
              return (
                <box
                  height={1}
                  backgroundColor={sel() ? COLORS.overlay : COLORS.surface}
                  onMouseUp={() => { setSnippetIdx(i()); loadSnippetToEditor(s) }}
                >
                  <text fg={sel() ? COLORS.blue : s.source === "local" ? COLORS.text : COLORS.muted}>
                    {sel() ? "▶ " : "  "}{mark} {trunc(s.name, props.width - 6)}
                  </text>
                </box>
              )
            }}
          </For>
        </box>

        <Show when={namingInput() !== null}>
          <box height={1} paddingLeft={1} backgroundColor={COLORS.overlay}>
            <text fg={COLORS.green}>Name: {namingInput()}_</text>
          </box>
        </Show>

        <box height={1} paddingLeft={1} backgroundColor={COLORS.overlay}>
          <Show when={props.focused}>
            <text fg={COLORS.muted}>[n]ew [d]el★ [↵]load [r]refresh</text>
          </Show>
          <Show when={!props.focused}>
            <text fg={COLORS.muted}>[tab] focus | [space e] toggle</text>
          </Show>
        </box>
      </Show>

      <Show when={!isSql()}>
        <Show when={loading()}>
          <box paddingLeft={2}><text fg={COLORS.muted}>Loading…</text></box>
        </Show>
        <Show when={!props.projectRef && !loading()}>
          <box paddingLeft={2} paddingTop={1}>
            <text fg={COLORS.muted}>No project open</text>
          </box>
        </Show>
        <For each={tables()}>
          {(table, i) => {
            const active = () => props.focused && i() === cursor()
            return (
              <box
                height={1}
                paddingLeft={1}
                backgroundColor={active() ? COLORS.overlay : COLORS.surface}
                onMouseUp={() => {
                  setCursor(i())
                  const ref = props.projectRef
                  if (ref) buffers.open("table", { project: ref, schema: table.schema, table: table.name }, `${table.schema}.${table.name}`)
                }}
                onMouseScroll={onScroll}
              >
                <text fg={active() ? COLORS.blue : COLORS.text}>
                  {active() ? "▶ " : "  "}
                  {table.schema !== "public" ? `${table.schema}.` : ""}{table.name}
                </text>
              </box>
            )
          }}
        </For>
      </Show>
    </box>
  )
}
