import { createSignal } from "solid-js"
import type { KeyEvent } from "@opentui/core"
import { activePicker, setActivePicker } from "../command/picker-state"
import { getRuntime } from "./providers"
import { setAgentModel, agentModel } from "./session"

export interface ModelRow {
  id: string
  provider: string
  modelId: string
  current: boolean
}

type Phase = "loading" | "list" | "working" | "error"

const [phase, setPhase] = createSignal<Phase>("loading")
const [rows, setRows] = createSignal<ModelRow[]>([])
const [query, setQuery] = createSignal("")
const [selectedIdx, setSelectedIdx] = createSignal(0)
const [offset, setOffset] = createSignal(0)
const [status, setStatus] = createSignal("")

export function filteredModels(): ModelRow[] {
  const q = query().trim().toLowerCase()
  const all = rows()
  if (!q) return all
  return all.filter((r) => r.id.toLowerCase().includes(q))
}

export {
  phase as modelPhase,
  query as modelQuery,
  selectedIdx as modelSelectedIdx,
  offset as modelOffset,
  status as modelStatus,
}

function isOpen() {
  return activePicker() === "model-picker"
}

export function closeModelPicker() {
  setActivePicker(null)
}

export async function openModelPicker(): Promise<void> {
  setActivePicker("model-picker")
  setPhase("loading")
  setStatus("")
  try {
    const rt = await getRuntime()
    // create() already refreshed within freshness windows; force-pull so
    // brand-new releases are visible even mid-session.
    try {
      await rt.refresh({ allowNetwork: true })
    } catch {
      // offline or provider hiccup — fall back to the cached catalog
    }
    const available = await rt.getAvailable()
    const current = agentModel() || (await readCurrentLabel())
    const list: ModelRow[] = available
      .map((m) => ({
        id: `${m.provider}/${m.id}`,
        provider: m.provider,
        modelId: m.id,
        current: current === `${m.provider}/${m.id}`,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
    // keep the selection on the current model when the picker opens
    let start = 0
    if (current) {
      const at = list.findIndex((r) => r.current)
      if (at >= 0) start = at
    }
    setRows(list)
    setQuery("")
    setSelectedIdx(start)
    setOffset(Math.max(0, Math.min(start - Math.floor(LIST_H / 2), list.length - LIST_H)))
    setPhase("list")
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err))
    setPhase("error")
  }
}

async function readCurrentLabel(): Promise<string> {
  const { readFile } = await import("node:fs/promises")
  const path = await import("node:path")
  const home = process.env.DBAGENT_HOME ?? path.join(process.env.HOME ?? "", ".dbagent")
  try {
    const cfg = JSON.parse(await readFile(path.join(home, "config.json"), "utf8")) as { model?: string }
    return cfg.model || ""
  } catch {
    return ""
  }
}

async function select(row: ModelRow): Promise<void> {
  setPhase("working")
  setStatus(`switching to ${row.id}…`)
  const err = await setAgentModel(row.id)
  if (err) {
    setStatus(err)
    setPhase("error")
    return
  }
  closeModelPicker()
}

// ── key handling (singleton, installed before buffers) ───────────────────────

let installed = false

const LIST_H = 14

function isPrintable(e: KeyEvent): boolean {
  if (e.name === "space") return !e.ctrl && !e.meta
  return e.name.length === 1 && !e.ctrl && !e.meta
}
function toChar(e: KeyEvent): string {
  if (e.name === "space") return " "
  if (e.shift && e.name === ";") return ":"
  if (e.shift && e.name.length === 1) return e.name.toUpperCase()
  return e.name
}

export function installModelPickerHandler(kh: {
  on(type: string, fn: (event: any) => void): void
}): void {
  if (installed) return
  installed = true

  function ensureVisible(): void {
    const n = filteredModels().length
    if (n === 0) {
      setSelectedIdx(0)
      setOffset(0)
      return
    }
    const c = Math.min(selectedIdx(), n - 1)
    setSelectedIdx(c)
    setOffset((o) => {
      const clamped = Math.min(o, Math.max(0, n - LIST_H))
      if (c < clamped) return c
      if (c >= clamped + LIST_H) return c - LIST_H + 1
      return clamped
    })
  }

  function move(delta: number): void {
    const n = filteredModels().length
    if (n === 0) return
    setSelectedIdx(Math.max(0, Math.min(n - 1, selectedIdx() + delta)))
    ensureVisible()
  }

  async function onKeypress(raw: KeyEvent) {
    if (!isOpen()) return
    raw.stopPropagation?.()

    const ph = phase()

    if (raw.name === "escape") {
      if (ph === "list" && query()) {
        setQuery("")
        ensureVisible()
        return
      }
      closeModelPicker()
      return
    }

    if (ph === "error") {
      if (raw.name === "return" || raw.name === "enter") {
        setPhase("list")
        setStatus("")
      }
      return
    }
    if (ph !== "list") return

    if ((raw.name === "backspace" || raw.name === "delete") && !raw.ctrl && !raw.meta) {
      setQuery((q) => q.slice(0, -1))
      ensureVisible()
      return
    }
    if (raw.ctrl && raw.name === "u") {
      setQuery("")
      ensureVisible()
      return
    }
    if (isPrintable(raw)) {
      setQuery((q) => (q + toChar(raw)).slice(0, 60))
      setSelectedIdx(0)
      setOffset(0)
      return
    }

    if (raw.name === "up" || raw.name === "k") move(-1)
    else if (raw.name === "down" || raw.name === "j") move(1)
    else if (raw.name === "pageup") move(-LIST_H)
    else if (raw.name === "pagedown") move(LIST_H)
    else if (raw.name === "home") move(-(rows().length))
    else if (raw.name === "end") move(rows().length)
    else if (raw.name === "return" || raw.name === "enter") {
      const view = filteredModels()
      if (view.length > 0) void select(view[Math.min(selectedIdx(), view.length - 1)]!)
    }
  }

  kh.on("keypress", onKeypress)
}
