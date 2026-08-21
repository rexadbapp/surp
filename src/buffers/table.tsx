import { createSignal, createMemo, createEffect, For, Show, onMount, onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent, MouseEvent } from "@opentui/core"
import { useAuth } from "../context/auth"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import { useMode } from "../context/mode"
import { useYank } from "../context/yank"
import { runQuery } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

const MAX_COL_W = 24
const PAGE_SIZE = 100
const EDIT_W = 60

interface CachedTable { rows: Record<string, unknown>[]; cols: string[]; widths: number[] }
const tableCache = new Map<string, CachedTable>()

function trunc(s: string, w: number): string {
  return s.length <= w ? s : s.slice(0, w - 1) + "…"
}

function calcWidths(cols: string[], rows: Record<string, unknown>[]): number[] {
  return cols.map((col) => {
    const maxData = rows.slice(0, 200).reduce((m, r) => Math.max(m, String(r[col] ?? "").length), 0)
    return Math.min(Math.max(col.length, maxData, 3), MAX_COL_W)
  })
}

export function TableBuffer(props: BufferProps) {
  const auth    = useAuth()
  const buffers = useBuffers()
  const keymap  = useKeymap()
  const yank    = useYank()
  const mode    = useMode()
  const renderer = useRenderer()

  const [rows, setRows]     = createSignal<Record<string, unknown>[]>([])
  const [cols, setCols]     = createSignal<string[]>([])
  const [widths, setWidths] = createSignal<number[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError]   = createSignal<string | null>(null)
  const [cursor, setCursor] = createSignal(0)   // row cursor
  const [colCursor, setColCursor] = createSignal(0) // column cursor
  const [rowOff, setRowOff] = createSignal(0)
  const [colOff, setColOff] = createSignal(0)
  const [filterText, setFilterText] = createSignal("")
  const [isFiltering, setIsFiltering] = createSignal(false)
  const [sortCol, setSortCol] = createSignal<number | null>(null)
  const [sortDir, setSortDir] = createSignal<"asc" | "desc" | null>(null)

  // pagination
  const [page, setPage] = createSignal(1)
  const [hasMore, setHasMore] = createSignal(false)
  const [loadingMore, setLoadingMore] = createSignal(false)

  // cell editing
  const [editing, setEditing] = createSignal<{ col: string; row: Record<string, unknown>; val: string } | null>(null)
  const [editInput, setEditInput] = createSignal("")
  const [editError, setEditError] = createSignal<string | null>(null)
  const [editSaving, setEditSaving] = createSignal(false)

  const ref    = () => String(props.meta.data?.["project"] ?? "")
  const schema = () => String(props.meta.data?.["schema"] ?? "public")
  const table  = () => String(props.meta.data?.["table"] ?? "")

  // header(1) + col-header(1) = 2 reserved rows (footer moved to app status bar)
  const visH = createMemo(() => Math.max(1, props.height - 2))

  // Header label (table name) + hint string, both truncated to fit width
  const HINTS = "· /: filter · s: sort · e: edit · ctrl+f: next pg · ctrl+b: prev pg · enter: SQL · r: reload · hjkl/[]: navigate"
  const headerLabel = createMemo(() => {
    const full = `${schema()}.${table()}`
    const max = Math.max(8, props.width - 4 - HINTS.length)
    return full.length > max ? trunc(full, max) : full
  })
  const headerHints = createMemo(() => {
    const avail = Math.max(0, props.width - 2 - headerLabel().length - 1)
    if (avail < 12) return ""
    return avail >= HINTS.length ? HINTS : HINTS.slice(0, avail)
  })

  async function load() {
    setPage(1)
    await loadPage(1)
  }

  async function loadPage(n: number) {
    const token = auth.token()
    if (!token || !ref() || !table()) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const q = `SELECT * FROM ${schema()}.${table()} LIMIT ${PAGE_SIZE} OFFSET ${(n - 1) * PAGE_SIZE}`
      const result = await runQuery(token, ref(), q)
      if (result.error) { setError(result.error); return }
      const r = result.rows
      const c = r.length > 0 ? Object.keys(r[0]!) : []
      const ws = calcWidths(c, r)
      setRows(r); setCols(c); setWidths(ws)
      setCursor(0); setColCursor(0); setRowOff(0); setColOff(0)
      setFilterText(""); setSortCol(null); setSortDir(null)
      setHasMore(r.length >= PAGE_SIZE)
      tableCache.set(props.meta.id, { rows: r, cols: c, widths: ws })
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function gotoPage(n: number) {
    if (n < 1 || loadingMore()) return
    if (n > page() && !hasMore()) return
    setLoadingMore(true)
    try {
      setPage(n)
      await loadPage(n)
    } finally {
      setLoadingMore(false)
    }
  }

  onMount(() => {
    const cached = tableCache.get(props.meta.id)
    if (cached) {
      setRows(cached.rows); setCols(cached.cols); setWidths(cached.widths)
      setLoading(false)
    } else {
      void load()
    }
  })

  // Which columns fit in the visible area starting at colOff
  const visCols = createMemo(() => {
    const ws = widths()
    const available = props.width - 2
    let used = 0
    const out: number[] = []
    for (let i = colOff(); i < cols().length; i++) {
      const w = (ws[i] ?? MAX_COL_W) + 1
      if (out.length > 0 && used + w > available) break
      out.push(i)
      used += w
    }
    return out
  })

  const displayRows = createMemo(() => {
    let data = rows()
    const ft = filterText()
    if (ft) {
      const lower = ft.toLowerCase()
      data = data.filter(r => Object.values(r).some(v => String(v ?? "").toLowerCase().includes(lower)))
    }
    const sc = sortCol()
    const sd = sortDir()
    if (sc !== null && sd && cols()[sc]) {
      const col = cols()[sc]!
      data = [...data].sort((a, b) => {
        const va = a[col]
        const vb = b[col]
        if (va == null && vb == null) return 0
        if (va == null) return 1
        if (vb == null) return -1
        const cmp = typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb))
        return sd === "asc" ? cmp : -cmp
      })
    }
    return data
  })

  const visRows = createMemo(() => displayRows().slice(rowOff(), rowOff() + visH()))

  createEffect(() => {
    const max = Math.max(0, displayRows().length - 1)
    const c = cursor()
    if (c > max) {
      setCursor(max)
      setRowOff(Math.max(0, max - visH() + 1))
    }
  })

  function clampRowScroll(next: number) {
    const vh = visH()
    const len = displayRows().length
    if (next >= rowOff() + vh) setRowOff(Math.min(next - vh + 1, Math.max(0, len - vh)))
    if (next < rowOff()) setRowOff(Math.max(0, next))
  }

  function moveCol(next: number) {
    const clamped = Math.max(0, Math.min(next, cols().length - 1))
    setColCursor(clamped)
    const vis = visCols()
    if (vis.length === 0) return
    if (clamped < vis[0]!) setColOff(clamped)
    else if (clamped > vis[vis.length - 1]!) setColOff((o) => Math.min(o + 1, cols().length - 1))
  }

  function cycleSort() {
    const sc = sortCol()
    const sd = sortDir()
    if (sc !== colCursor() || !sd) {
      setSortCol(colCursor())
      setSortDir("asc")
    } else if (sd === "asc") {
      setSortDir("desc")
    } else {
      setSortCol(null)
      setSortDir(null)
    }
    setCursor(0); setRowOff(0)
  }

  keymap.onAction("move_down", () => {
    if (!props.focused) return
    const max = Math.max(0, displayRows().length - 1)
    const next = Math.min(cursor() + 1, max)
    clampRowScroll(next); setCursor(next)
  })
  keymap.onAction("move_up", () => {
    if (!props.focused) return
    const next = Math.max(cursor() - 1, 0)
    clampRowScroll(next); setCursor(next)
  })
  keymap.onAction("move_right", () => { if (props.focused) moveCol(colCursor() + 1) })
  keymap.onAction("move_left",  () => { if (props.focused) moveCol(colCursor() - 1) })
  keymap.onAction("scroll_down", () => {
    if (!props.focused) return
    const max = Math.max(0, displayRows().length - 1)
    const next = Math.min(cursor() + Math.floor(visH() / 2), max)
    clampRowScroll(next); setCursor(next)
  })
  keymap.onAction("scroll_up", () => {
    if (!props.focused) return
    const next = Math.max(cursor() - Math.floor(visH() / 2), 0)
    clampRowScroll(next); setCursor(next)
  })
  keymap.onAction("go_top", () => {
    if (!props.focused) return
    setCursor(0); setRowOff(0)
  })
  keymap.onAction("go_bottom", () => {
    if (!props.focused) return
    const last = Math.max(0, displayRows().length - 1)
    setCursor(last); setRowOff(Math.max(0, last - visH() + 1))
  })
  keymap.onAction("page_down", () => {
    if (!props.focused) return
    if (hasMore()) void gotoPage(page() + 1)
  })
  keymap.onAction("page_up", () => {
    if (!props.focused) return
    if (page() > 1) void gotoPage(page() - 1)
  })
  keymap.onAction("refresh", () => {
    if (!props.focused) return
    tableCache.delete(props.meta.id); void load()
  })
  keymap.onAction("select", () => {
    if (!props.focused) return
    const row = displayRows()[cursor()]
    buffers.open("sql", {
      project: ref(),
      schema: schema(),
      table: table(),
      row: row ? JSON.stringify(row) : "",
    }, `SQL: ${schema()}.${table()}`)
  })

  keymap.onAction("yank", () => {
    if (!props.focused) return
    const row = displayRows()[cursor()]
    if (!row) return
    const col = cols()[colCursor()]
    const val = col ? String(row[col] ?? "NULL") : ""
    yank.yank(val, col ?? "cell")
  })
  keymap.onAction("yank_row", () => {
    if (!props.focused) return
    const row = displayRows()[cursor()]
    if (!row) return
    yank.yank(JSON.stringify(row, null, 2), "row")
  })

  onMount(() => {
    const kh = renderer.keyInput
    let saved = ""
    function onKey(e: KeyEvent) {
      if (!props.focused) return

      // cell editing mode — capture all keys
      if (editing()) {
        if ((e.name === "return" || e.name === "enter") && !e.ctrl && !e.meta) {
          void saveEdit()
        } else if (e.name === "escape" && !e.ctrl && !e.meta) {
          cancelEdit()
        } else if ((e.name === "backspace" || e.name === "delete") && !e.ctrl && !e.meta) {
          setEditInput((s) => s.slice(0, -1))
        } else if (e.name.length === 1 && !e.ctrl && !e.meta) {
          const ch = e.shift ? e.name.toUpperCase() : e.name
          setEditInput((s) => s + ch)
        }
        e.stopPropagation?.()
        return
      }

      if (isFiltering()) {
        if ((e.name === "enter" || e.name === "return") && !e.ctrl && !e.meta) {
          setIsFiltering(false)
          mode.enterNormal()
        } else if (e.name === "escape" && !e.ctrl && !e.meta) {
          setFilterText(saved)
          setIsFiltering(false)
          mode.enterNormal()
        } else if ((e.name === "backspace" || e.name === "delete") && !e.ctrl && !e.meta) {
          setFilterText(t => t.slice(0, -1))
        } else if (e.name.length === 1 && !e.ctrl && !e.meta) {
          setFilterText(t => t + e.name)
        }
        return
      }

      if (!mode.is("normal")) return

      if (e.name === "[" && !e.ctrl && !e.meta) moveCol(colCursor() - 1)
      if (e.name === "]" && !e.ctrl && !e.meta) moveCol(colCursor() + 1)
      if (e.name === "/" && !e.ctrl && !e.meta) {
        saved = filterText()
        setFilterText("")
        setIsFiltering(true)
        mode.enterInsert()
      }
      if (e.name === "s" && !e.ctrl && !e.meta) cycleSort()
      if (e.name === "e" && !e.ctrl && !e.meta) { startEdit(); return }
      if (e.name === "escape" && !e.ctrl && !e.meta && filterText()) {
        setFilterText("")
        setCursor(0); setRowOff(0)
      }
    }
    kh.on("keypress", onKey)
    onCleanup(() => {
      kh.off("keypress", onKey)
      if (isFiltering()) mode.enterNormal()
    })
  })

  function onScroll(e: MouseEvent) {
    if (!props.focused || !e.scroll) return
    const dir = e.scroll.direction
    if (dir === "up") {
      const next = Math.max(0, cursor() - 3)
      clampRowScroll(next); setCursor(next)
    } else if (dir === "down") {
      const next = Math.min(displayRows().length - 1, cursor() + 3)
      clampRowScroll(next); setCursor(next)
    }
  }

  // ── Cell editing ─────────────────────────────────────────────

  function startEdit() {
    const row = displayRows()[cursor()]
    if (!row) return
    const col = cols()[colCursor()]
    if (!col) return
    const raw = row[col]
    const val = raw != null && typeof raw === "object" ? JSON.stringify(raw) : String(raw ?? "")
    setEditing({ col, row, val })
    setEditInput(val)
    setEditError(null)
    mode.enterInsert()
  }

  function cancelEdit() {
    setEditing(null)
    setEditInput("")
    setEditError(null)
    mode.enterNormal()
  }

  async function saveEdit() {
    const e = editing()
    if (!e) return
    const token = auth.token()
    if (!token) { setEditError("Not authenticated"); return }
    setEditSaving(true)
    setEditError(null)

    // Build WHERE from primitive columns (skip object/null)
    const wheres: string[] = []
    for (const [c, v] of Object.entries(e.row)) {
      if (c === e.col) continue
      if (v == null || typeof v === "object") continue
      wheres.push(`${c} = '${String(v).replace(/'/g, "''")}'`)
    }
    // fallback: use all remaining cols (shouldn't happen with real data)
    if (wheres.length === 0) { setEditError("No usable WHERE columns"); setEditSaving(false); return }

    const escVal = editInput().replace(/'/g, "''")
    const q = `UPDATE ${schema()}.${table()} SET ${e.col} = '${escVal}' WHERE ${wheres.join(" AND ")}`

    try {
      await runQuery(token, ref(), q)
      setEditing(null)
      setEditInput("")
      mode.enterNormal()
      void load()
    } catch (err) {
      setEditError(String(err))
    } finally {
      setEditSaving(false)
    }
  }

  // push status line into the app status bar
  createEffect(() => {
    if (!props.focused) return
    const parts: string[] = []
    if (editing()) parts.push("editing " + editing()!.col)
    else if (filterText()) parts.push(`filter "${filterText()}"`)
    if (sortCol() !== null && sortDir()) parts.push(`sort ${cols()[sortCol()!]} ${sortDir()}`)
    const total = displayRows().length
    const filterNote = filterText() ? " (filtered)" : ""
    parts.push(`row ${total > 0 ? cursor() + 1 : 0}/${total}${filterNote} · col ${colCursor() + 1}/${cols().length}`)
    parts.push(`· page ${page()}${hasMore() ? "+" : ""}`)
    buffers.setStatus(props.meta.id, parts.join("  "))
  })

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>

      {/* Header bar */}
      <box height={1} paddingLeft={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.blue} attributes={1}>{headerLabel()}  </text>
        <Show when={!loading()} fallback={<text fg={COLORS.yellow}>loading…</text>}>
          <Show when={isFiltering()}>
            <text fg={COLORS.yellow}>filter: {filterText()}</text>
          </Show>
          <Show when={!isFiltering() && filterText()}>
            <text fg={COLORS.yellow}>filter("{filterText()}")  </text>
          </Show>
          <Show when={sortCol() !== null && sortDir()}>
            <text fg={COLORS.green}>sorted by {cols()[sortCol()!]} {sortDir() === "asc" ? "↑" : "↓"}  </text>
          </Show>
          <text fg={COLORS.muted}>
            {isFiltering()
              ? " · enter: apply · esc: cancel"
              : headerHints()}
          </text>
        </Show>
      </box>

      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1}><text fg={COLORS.red}>{error()}</text></box>
      </Show>

      <Show when={!loading() && !error()}>
        {/* Column header */}
        <box flexDirection="row" height={1} backgroundColor={COLORS.surface} onMouseScroll={onScroll}>
          <text fg={COLORS.muted} width={2}> </text>
          <For each={visCols()}>
            {(ci) => {
              const isColActive = () => ci === colCursor()
              const isSorted = () => ci === sortCol() && sortDir()
              return (
                <text
                  fg={isSorted() ? COLORS.green : isColActive() ? COLORS.yellow : COLORS.blue}
                  attributes={1}
                  width={(widths()[ci] ?? MAX_COL_W) + 1}
                >
                  {trunc(cols()[ci]!, widths()[ci] ?? MAX_COL_W)}{isSorted() ? (sortDir() === "asc" ? "↑" : "↓") : ""}
                </text>
              )
            }}
          </For>
        </box>

        {/* Data rows */}
        <For each={visRows()}>
          {(row, vi) => {
            const isRowActive = () => props.focused && vi() + rowOff() === cursor()
            return (
              <box
                flexDirection="row"
                height={1}
                backgroundColor={isRowActive() ? COLORS.overlay : COLORS.background}
                onMouseUp={() => setCursor(vi() + rowOff())}
                onMouseScroll={onScroll}
              >
                <text fg={COLORS.mauve} width={2}>{isRowActive() ? "▶ " : "  "}</text>
                <For each={visCols()}>
                  {(ci) => {
                    const w = widths()[ci] ?? MAX_COL_W
                    const colName = cols()[ci]!
                    const raw = row[colName]
                    const val = raw != null && typeof raw === "object" ? JSON.stringify(raw) : String(raw ?? "")
                    const isNull = row[colName] == null
                    const isColActive = () => ci === colCursor()
                    return (
                      <text
                        fg={isNull ? COLORS.muted : isColActive() && isRowActive() ? COLORS.yellow : isRowActive() ? COLORS.text : COLORS.subtext}
                        width={w + 1}
                      >
                        {isNull ? "NULL" : trunc(val, w)}
                      </text>
                    )
                  }}
                </For>
              </box>
            )
          }}
        </For>
      </Show>

      {/* Cell edit modal overlay */}
      <Show when={editing()}>
        {(e) => (
          <box
            position="absolute"
            top={0} left={0}
            width={props.width}
            height={props.height}
            alignItems="center"
            justifyContent="center"
          >
            <box flexDirection="column" width={EDIT_W}>
              <box height={1} paddingLeft={2} backgroundColor={COLORS.mauve} flexDirection="row">
                <text fg={COLORS.background} attributes={1}>Edit: {e().col}</text>
                <Show when={editSaving()}>
                  <text fg={COLORS.background}>  saving…</text>
                </Show>
              </box>
              <box flexDirection="row" height={1} backgroundColor={COLORS.surface} paddingLeft={1} paddingRight={1}>
                <text fg={COLORS.text}>{editInput()}</text>
                <text fg={COLORS.mauve}>█</text>
              </box>
              <Show when={editError()}>
                <box paddingLeft={1} paddingTop={1}>
                  <text fg={COLORS.red}>{editError()}</text>
                </box>
              </Show>
              <box height={1} paddingLeft={1} backgroundColor={COLORS.surface}>
                <text fg={COLORS.muted}>Enter save  ·  Esc cancel</text>
              </box>
            </box>
          </box>
        )}
      </Show>

    </box>
  )
}
