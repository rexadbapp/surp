import { createSignal, createMemo, createEffect, untrack, For, Show, onMount } from "solid-js"
import { useConnection } from "../context/connection"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import { listSchemaFull, type SchemaTable } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

const schemaCache = new Map<string, SchemaTable[]>()

// ── helpers ───────────────────────────────────────────────────────────────────
function shortType(t: string): string {
  return t
    .replace("timestamp with time zone", "timestamptz")
    .replace("timestamp without time zone", "timestamp")
    .replace("character varying", "varchar")
    .replace("double precision", "float8")
    .replace(" without time zone", "")
}

function fit(s: string, w: number): string {
  return s.length > w ? s.slice(0, w - 1) + "…" : s.padEnd(w)
}

// ── canvas ────────────────────────────────────────────────────────────────────
interface Cell { ch: string; fg: string }

// Box-drawing direction bitmask  R=1 D=2 L=4 U=8
const CHAR_MASK: Record<string, number> = {
  "─": 5, "│": 10,
  "┌": 3, "┐": 6, "└": 9, "┘": 12,
  "├": 11, "┤": 14, "┬": 7, "┴": 13, "┼": 15,
}
const MASK_CHAR: Record<number, string> = {}
for (const [ch, m] of Object.entries(CHAR_MASK)) MASK_CHAR[+m] = ch

class Canvas {
  cells: (Cell | null)[][]
  constructor(public w: number, public h: number) {
    this.cells = Array.from({ length: h }, () => new Array<Cell | null>(w).fill(null))
  }

  inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h }
  get(x: number, y: number): Cell | null { return this.inBounds(x, y) ? this.cells[y]![x]! : null }

  set(x: number, y: number, ch: string, fg: string) {
    if (this.inBounds(x, y)) this.cells[y]![x] = { ch, fg }
  }

  str(x: number, y: number, s: string, fg: string) {
    for (let i = 0; i < s.length; i++) this.set(x + i, y, s[i]!, fg)
  }

  // Merge box-drawing chars so crossing lines produce ┼ etc.
  lineSet(x: number, y: number, ch: string, fg: string) {
    if (!this.inBounds(x, y)) return
    const ex = this.cells[y]![x]
    if (ex) {
      const em = CHAR_MASK[ex.ch], im = CHAR_MASK[ch]
      if (em !== undefined && im !== undefined) {
        this.cells[y]![x] = { ch: MASK_CHAR[em | im] ?? ch, fg }
        return
      }
    }
    this.cells[y]![x] = { ch, fg }
  }
}

// ── card geometry ─────────────────────────────────────────────────────────────
const CARD_W = 34   // total width including borders
//  col:  0   1   2   3   4   5..18  19  20..31  32  33
//        │  pk  sp null sp  name14  sp  type12  sp   │

const PK_OFF   = 1
const NULL_OFF = 3
const NAME_OFF = 5,  NAME_W = 14
const TYPE_OFF = 20, TYPE_W = 12

const GAP_X   = 8
const GAP_Y   = 3
const MARGIN  = 2

interface Pos { x: number; y: number }

function cardH(t: SchemaTable) { return t.columns.length + 4 }

function layoutTables(tables: SchemaTable[]): { pos: Pos[]; cw: number; ch: number } {
  const n = tables.length
  if (n === 0) return { pos: [], cw: 80, ch: 24 }
  const nCols = Math.max(1, Math.round(Math.sqrt(n * 0.7)))
  const colY   = new Array<number>(nCols).fill(MARGIN)
  const pos: Pos[] = tables.map((t, i) => {
    const col = i % nCols
    const p   = { x: MARGIN + col * (CARD_W + GAP_X), y: colY[col]! }
    colY[col]! += cardH(t) + GAP_Y
    return p
  })
  return {
    pos,
    cw: MARGIN + nCols * (CARD_W + GAP_X) + MARGIN,
    ch: Math.max(...colY) + MARGIN,
  }
}

// ── card drawing ──────────────────────────────────────────────────────────────
function drawCard(cvs: Canvas, t: SchemaTable, { x, y }: Pos, selected: boolean) {
  const bfg = selected ? COLORS.mauve  : COLORS.border
  const hfg = selected ? COLORS.mauve  : COLORS.blue
  const tfg = selected ? COLORS.text   : COLORS.subtext

  // content first so borders overwrite
  const header = (" " + fit(t.name, CARD_W - 4)).padEnd(CARD_W - 2)
  cvs.str(x + 1, y + 1, header, hfg)

  t.columns.forEach((col, ci) => {
    const cy  = y + 3 + ci
    const pk  = col.is_pk      ? "⚷" : " "
    const nl  = col.is_nullable ? "◇" : "◆"
    const nm  = fit(col.name, NAME_W)
    const raw = col.fk_table ? `→${col.fk_table}` : shortType(col.data_type)
    const ty  = fit(raw, TYPE_W)
    const tFg = col.fk_table ? COLORS.blue : COLORS.muted

    cvs.set(x + PK_OFF,   cy, pk,   col.is_pk ? COLORS.yellow : COLORS.muted)
    cvs.set(x + 2,        cy, " ",  "")
    cvs.set(x + NULL_OFF, cy, nl,   col.is_nullable ? COLORS.muted : tfg)
    cvs.set(x + 4,        cy, " ",  "")
    cvs.str(x + NAME_OFF, cy, nm,   tfg)
    cvs.set(x + 19,       cy, " ",  "")
    cvs.str(x + TYPE_OFF, cy, ty,   tFg)
    cvs.set(x + 32,       cy, " ",  "")
  })

  // borders last so they always win
  const bot = y + 3 + t.columns.length
  cvs.set(x, y, "┌", bfg); cvs.set(x + CARD_W - 1, y, "┐", bfg)
  for (let i = 1; i < CARD_W - 1; i++) cvs.set(x + i, y, "─", bfg)

  cvs.set(x, y + 1, "│", bfg); cvs.set(x + CARD_W - 1, y + 1, "│", bfg)

  cvs.set(x, y + 2, "├", bfg); cvs.set(x + CARD_W - 1, y + 2, "┤", bfg)
  for (let i = 1; i < CARD_W - 1; i++) cvs.set(x + i, y + 2, "─", bfg)

  for (let ci = 0; ci < t.columns.length; ci++) {
    cvs.set(x, y + 3 + ci, "│", bfg)
    cvs.set(x + CARD_W - 1, y + 3 + ci, "│", bfg)
  }

  cvs.set(x, bot, "└", bfg); cvs.set(x + CARD_W - 1, bot, "┘", bfg)
  for (let i = 1; i < CARD_W - 1; i++) cvs.set(x + i, bot, "─", bfg)
}

// ── connection routing ────────────────────────────────────────────────────────
function hline(cvs: Canvas, x1: number, x2: number, y: number, fg: string) {
  const lo = Math.min(x1, x2), hi = Math.max(x1, x2)
  for (let x = lo; x <= hi; x++) cvs.lineSet(x, y, "─", fg)
}
function vline(cvs: Canvas, x: number, y1: number, y2: number, fg: string) {
  const lo = Math.min(y1, y2), hi = Math.max(y1, y2)
  for (let y = lo; y <= hi; y++) cvs.lineSet(x, y, "│", fg)
}

function drawConnection(
  cvs: Canvas,
  fromP: Pos, fromColIdx: number,
  toP: Pos,
  fg: string,
) {
  if (fromP.x === toP.x && fromP.y === toP.y) return

  const srcX = fromP.x + CARD_W      // just past right border
  const srcY = fromP.y + 3 + fromColIdx
  const dstY = toP.y + 1             // target header row

  if (srcX < toP.x) {
    // source is left of target — simple L-shaped midpoint route
    const dstX = toP.x - 1
    const midX = Math.floor((srcX + dstX) / 2)

    hline(cvs, srcX, midX, srcY, fg)
    if (srcY !== dstY) {
      cvs.lineSet(midX, srcY, srcY < dstY ? "┐" : "┘", fg)
      vline(cvs, midX, srcY + (srcY < dstY ? 1 : -1), dstY + (srcY < dstY ? 0 : 1), fg)
      cvs.lineSet(midX, dstY, srcY < dstY ? "└" : "┌", fg)
    }
    hline(cvs, midX + 1, dstX, dstY, fg)
    cvs.set(dstX + 1, dstY, "►", fg)   // arrow touches card border

  } else {
    // source is right of or same column as target — route via right rail
    const dstX = toP.x - 1
    const railX = Math.max(fromP.x + CARD_W, toP.x + CARD_W) + 2

    hline(cvs, srcX, railX, srcY, fg)
    if (srcY !== dstY) {
      cvs.lineSet(railX, srcY, srcY < dstY ? "┐" : "┘", fg)
      vline(cvs, railX, srcY + (srcY < dstY ? 1 : -1), dstY + (srcY < dstY ? 0 : 1), fg)
      cvs.lineSet(railX, dstY, srcY < dstY ? "└" : "┌", fg)
    }
    hline(cvs, dstX, railX - 1, dstY, fg)
    cvs.set(dstX + 1, dstY, "►", fg)
  }
}

// ── full canvas build ─────────────────────────────────────────────────────────
function buildCanvas(
  tables: SchemaTable[],
  pos: Pos[],
  cw: number, ch: number,
  sel: number,
): Canvas {
  const cvs = new Canvas(cw, ch)

  // connections drawn first so cards render on top
  tables.forEach((t, ti) => {
    t.columns.forEach((col, ci) => {
      if (!col.fk_table) return
      const tgt = tables.findIndex((t2) => t2.name === col.fk_table && t2.schema === t.schema)
      if (tgt < 0 || tgt === ti) return
      const hi = ti === sel || tgt === sel
      drawConnection(cvs, pos[ti]!, ci, pos[tgt]!, hi ? COLORS.mauve : COLORS.muted)
    })
  })

  tables.forEach((t, ti) => drawCard(cvs, t, pos[ti]!, ti === sel))
  return cvs
}

// ── component ─────────────────────────────────────────────────────────────────
export function SchemaBuffer(props: BufferProps) {
  const connCtx = useConnection()
  const buffers = useBuffers()
  const keymap  = useKeymap()

  const ref    = () => String(props.meta.data?.["project"] ?? "")
  const schema = () => String(props.meta.data?.["schema"]  ?? "public")

  const [tables,  setTables]  = createSignal<SchemaTable[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error,   setError]   = createSignal<string | null>(null)
  const [cursor,  setCursor]  = createSignal(0)
  const [panX,    setPanX]    = createSignal(0)
  const [panY,    setPanY]    = createSignal(0)
  const [loadedFor, setLoadedFor] = createSignal<string | null>(null)

  async function load(force = false) {
    const conn = connCtx.active()
    if (!conn) return
    setLoadedFor(conn.id)
    const ck = `${conn.id}:${schema()}`
    if (!force) {
      const cached = schemaCache.get(ck)
      if (cached) { setTables(cached); return }
    }
    setLoading(true); setError(null)
    try {
      const data = await listSchemaFull(conn.driver, schema())
      schemaCache.set(ck, data)
      setTables(data); setCursor(0); setPanX(0); setPanY(0)
    } catch (e) { setError(String(e)) }
    finally     { setLoading(false) }
  }

  onMount(() => void load())

  createEffect(() => {
    const connId = connCtx.active()?.id ?? null
    if (connId && connId !== loadedFor()) void load(true)
  })

  const layout = createMemo(() => layoutTables(tables()))

  const canvas = createMemo(() => {
    const { pos, cw, ch } = layout()
    return buildCanvas(tables(), pos, cw, ch, cursor())
  })

  const vpH = createMemo(() => Math.max(1, props.height - 2))
  const vpW = createMemo(() => props.width)

  function clampPan(nx: number, ny: number) {
    const { cw, ch } = layout()
    setPanX(Math.max(0, Math.min(Math.max(0, cw - vpW()), nx)))
    setPanY(Math.max(0, Math.min(Math.max(0, ch - vpH()), ny)))
  }

  // Keep selected node visible
  createEffect(() => {
    const sel = cursor()
    const p   = layout().pos[sel]
    const t   = tables()[sel]
    if (!p || !t) return
    const ch  = cardH(t)
    const px  = untrack(panX), py = untrack(panY)
    const vw  = vpW(), vh = vpH()
    let nx = px, ny = py
    if (p.x - 2      < px)      nx = Math.max(0, p.x - 2)
    if (p.x + CARD_W > px + vw) nx = p.x + CARD_W - vw + 2
    if (p.y - 1      < py)      ny = Math.max(0, p.y - 1)
    if (p.y + ch     > py + vh) ny = p.y + ch - vh + 1
    if (nx !== px) setPanX(nx)
    if (ny !== py) setPanY(ny)
  })

  const PAN = 4
  keymap.onAction("move_up",     () => { if (props.focused) setCursor(c => Math.max(0, c - 1)) })
  keymap.onAction("move_down",   () => { if (props.focused) setCursor(c => Math.min(tables().length - 1, c + 1)) })
  keymap.onAction("move_left",   () => { if (props.focused) clampPan(panX() - PAN, panY()) })
  keymap.onAction("move_right",  () => { if (props.focused) clampPan(panX() + PAN, panY()) })
  keymap.onAction("scroll_up",   () => { if (props.focused) clampPan(panX(), panY() - PAN) })
  keymap.onAction("scroll_down", () => { if (props.focused) clampPan(panX(), panY() + PAN) })
  keymap.onAction("go_top",      () => { if (props.focused) { setCursor(0); setPanX(0); setPanY(0) } })
  keymap.onAction("go_bottom",   () => { if (props.focused) setCursor(tables().length - 1) })
  keymap.onAction("refresh",     () => { if (props.focused) void load(true) })
  keymap.onAction("select",      () => {
    if (!props.focused) return
    const t = tables()[cursor()]
    if (t) buffers.open("table", { project: ref(), schema: t.schema, table: t.name }, `${t.schema}.${t.name}`)
  })

  // Viewport: slice canvas, group runs of same-fg cells into spans
  const viewport = createMemo(() => {
    const cvs = canvas()
    const px  = panX(), py = panY(), vw = vpW(), vh = vpH()
    const rows: Array<Array<{ text: string; fg: string }>> = []

    for (let row = py; row < py + vh; row++) {
      const spans: Array<{ text: string; fg: string }> = []
      for (let col = px; col < px + vw; col++) {
        const cell = cvs.get(col, row)
        const ch   = cell?.ch ?? " "
        const fg   = cell?.fg ?? ""
        const last = spans[spans.length - 1]
        if (last && last.fg === fg) last.text += ch
        else spans.push({ text: ch, fg })
      }
      rows.push(spans)
    }
    return rows
  })

  const cursorTable = createMemo(() => tables()[cursor()])

  return (
    <box flexDirection="column" width={props.width} height={props.height}>

      {/* Header */}
      <box height={1} flexDirection="row" paddingLeft={1} backgroundColor={COLORS.overlay}>
        <text fg={COLORS.blue} attributes={1}>ERD  </text>
        <text fg={COLORS.muted}>schema </text>
        <text fg={COLORS.text}>{schema()}</text>
        <Show when={loading()}>
          <text fg={COLORS.yellow}>  loading…</text>
        </Show>
        <Show when={!loading() && !error()}>
          <text fg={COLORS.muted}>
            {"  "}{tables().length} tables
            {"  ·  j/k node  h/l/scroll pan  enter open  r refresh"}
          </text>
        </Show>
      </box>

      {/* Error */}
      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1} flexGrow={1}>
          <text fg={COLORS.red}>{error()}</text>
        </box>
      </Show>

      {/* Canvas */}
      <Show when={!error()}>
        <box flexDirection="column" flexGrow={1} height={vpH()} overflow={"hidden" as any}>
          <For each={viewport()}>
            {(spans) => (
              <box height={1} flexDirection="row">
                <For each={spans}>
                  {(span) => <text fg={span.fg || COLORS.muted}>{span.text}</text>}
                </For>
              </box>
            )}
          </For>
        </box>

        {/* Footer */}
        <box height={1} flexDirection="row" paddingLeft={1} backgroundColor={COLORS.surface}>
          <Show when={cursorTable()}>
            {(t) => (
              <>
                <text fg={COLORS.muted}>{cursor() + 1}/{tables().length}  </text>
                <text fg={COLORS.mauve} attributes={1}>{t().name}</text>
                <text fg={COLORS.muted}>  {t().columns.length} cols</text>
              </>
            )}
          </Show>
          <Show when={!cursorTable()}>
            <text fg={COLORS.muted}>no tables</text>
          </Show>
        </box>
      </Show>

    </box>
  )
}
