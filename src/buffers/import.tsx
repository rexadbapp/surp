import { createSignal, createMemo, For, Show, onMount, onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import { useConnection } from "../context/connection"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import { useMode } from "../context/mode"
import * as accounts from "../auth/accounts"
import { listProjects, type Project } from "../auth/api"
import type { PinnedProject } from "../connections/store"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

interface ProjectRow {
  ref: string
  name: string
  accountId: string
  accountName: string
}

export function ImportBuffer(props: BufferProps) {
  const connCtx = useConnection()
  const buffers = useBuffers()
  const keymap  = useKeymap()
  const mode    = useMode()
  const renderer = useRenderer()

  const [rows, setRows] = createSignal<ProjectRow[]>([])
  const [checked, setChecked] = createSignal<Set<string>>(new Set())
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [cursor, setCursor] = createSignal(0)

  // add-account mini form
  const [addingAccount, setAddingAccount] = createSignal(false)
  const [fieldName, setFieldName] = createSignal("")
  const [fieldToken, setFieldToken] = createSignal("")
  const [fieldIdx, setFieldIdx] = createSignal(0)
  const [savingAccount, setSavingAccount] = createSignal(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const accountList = await accounts.listAccounts()
      const out: ProjectRow[] = []
      for (const acc of accountList) {
        const token = await accounts.readAccountToken(acc.id)
        if (!token) continue // primary without login — skip silently
        try {
          const projects: Project[] = await listProjects(token)
          for (const p of projects) {
            out.push({ ref: p.id, name: p.name, accountId: acc.id, accountName: acc.name })
          }
        } catch (e) {
          setError(`account "${acc.name}": ${String(e)}`)
        }
      }
      setRows(out)
      // pre-check whatever is already pinned
      const pins = await (await import("../connections/store")).listPinned()
      setChecked(new Set(pins.map((p) => p.ref)))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => void load())

  async function persistChecks() {
    const pins: PinnedProject[] = rows()
      .filter((r) => checked().has(r.ref))
      .map((r) => ({ ref: r.ref, name: r.name, accountId: r.accountId }))
    const { setPinned } = await import("../connections/store")
    await setPinned(pins)
    await connCtx.refreshPinned()
  }

  function toggleChecked() {
    const r = rows()[cursor()]
    if (!r) return
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(r.ref)) next.delete(r.ref)
      else next.add(r.ref)
      return next
    })
    void persistChecks()
  }

  // ── add-account flow ─────────────────────────────────────────
  function openAddAccount() {
    setAddingAccount(true)
    setFieldName("")
    setFieldToken("")
    setFieldIdx(0)
    mode.enterInsert()
  }

  function cancelAddAccount() {
    setAddingAccount(false)
    mode.enterNormal()
  }

  async function submitAccount() {
    const name = fieldName().trim()
    const token = fieldToken().trim()
    if (!name || !token) return
    setSavingAccount(true)
    setError(null)
    try {
      const { validateToken } = await import("../auth/index")
      if (!(await validateToken(token))) {
        setError("Invalid access token — check it and try again")
        setSavingAccount(false)
        return
      }
      await accounts.saveAccount(name, token)
      cancelAddAccount()
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setSavingAccount(false)
    }
  }

  // ── keymaps (list mode) ──────────────────────────────────────
  keymap.onAction("move_down", () => {
    if (!props.focused || addingAccount()) return
    setCursor((c) => Math.min(rows().length - 1, c + 1))
  })
  keymap.onAction("move_up", () => {
    if (!props.focused || addingAccount()) return
    setCursor((c) => Math.max(0, c - 1))
  })
  keymap.onAction("select", () => {
    if (!props.focused || addingAccount()) return
    toggleChecked()
  })
  keymap.onAction("escape", () => {
    if (!props.focused || addingAccount()) return
    buffers.close(props.meta.id)
  })

  // raw keys: a add account · space toggle · form typing
  onMount(() => {
    const kh = renderer.keyInput
    const decoder = new TextDecoder()
    function onKey(e: KeyEvent) {
      if (!props.focused) return

      if (addingAccount()) {
        if ((e.name === "escape") && !e.ctrl && !e.meta) { e.stopPropagation?.(); cancelAddAccount(); return }
        if ((e.name === "tab") && !e.ctrl && !e.meta) {
          e.stopPropagation?.()
          setFieldIdx((i) => (i === 0 ? 1 : 0))
          return
        }
        if ((e.name === "return" || e.name === "enter" || e.name === "linefeed" || e.sequence === "\r" || e.sequence === "\n") && !e.ctrl && !e.meta) {
          e.stopPropagation?.()
          void submitAccount()
          return
        }
        if ((e.name === "backspace" || e.name === "delete") && !e.ctrl && !e.meta) {
          fieldIdx() === 0 ? setFieldName((v) => v.slice(0, -1)) : setFieldToken((v) => v.slice(0, -1))
          e.stopPropagation?.()
          return
        }
        if (e.name.length === 1 && !e.ctrl && !e.meta) {
          const ch = e.shift ? e.name.toUpperCase() : e.name
          fieldIdx() === 0 ? setFieldName((v) => v + ch) : setFieldToken((v) => v + ch)
          e.stopPropagation?.()
        }
        return
      }

      if (e.name.length === 1 && !e.ctrl && !e.meta) {
        if (e.name === "a") { openAddAccount(); return }
        if (e.name === " ") { toggleChecked(); return }
      }
    }
    function onPaste(event: { bytes: Uint8Array; preventDefault: () => void }) {
      if (!props.focused || !addingAccount()) return
      const text = decoder.decode(event.bytes)
      if (!text) return
      fieldIdx() === 0 ? setFieldName((v) => v + text) : setFieldToken((v) => v + text)
      event.preventDefault()
    }
    kh.on("keypress", onKey)
    kh.on("paste", onPaste)
    onCleanup(() => {
      kh.off("keypress", onKey)
      kh.off("paste", onPaste)
    })
  })

  // group rows by account with header indices
  const display = createMemo(() => {
    const out: Array<{ kind: "header"; label: string } | { kind: "row"; row: ProjectRow; idx: number }> = []
    let lastAccount = ""
    rows().forEach((row, idx) => {
      if (row.accountName !== lastAccount) {
        lastAccount = row.accountName
        out.push({ kind: "header", label: `account: ${row.accountName}` })
      }
      out.push({ kind: "row", row, idx })
    })
    return out
  })

  const formW = () => Math.min(64, Math.max(40, props.width - 8))

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>

      <box paddingLeft={1} height={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.teal} attributes={1}>Import from Supabase  </text>
        <text fg={COLORS.muted}>check projects to pin them to the home page</text>
      </box>

      <Show when={connCtx.error()}>
        <box paddingLeft={2} paddingTop={1}><text fg={COLORS.red}>{connCtx.error()}</text></box>
      </Show>

      {/* ── Add-account mini form ─────────────────────────────── */}
      <Show when={addingAccount()}>
        <box flexDirection="column" paddingLeft={2} paddingTop={1} width={formW()}>
          <box height={1}>
            <text fg={COLORS.mauve} attributes={1}>Add Supabase account</text>
          </box>
          <box height={1}><text fg={COLORS.muted}>paste a personal access token (supabase.com/dashboard/account/tokens)</text></box>
          <box height={1} />
          <box flexDirection="row" height={1}>
            <text fg={COLORS.text} width={12}>Name</text>
            <box width={formW() - 12} height={1} backgroundColor={fieldIdx() === 0 ? COLORS.overlay : COLORS.surface} paddingLeft={1}>
              <text fg={fieldName() ? COLORS.text : COLORS.muted}>{fieldName() || "work"}{fieldIdx() === 0 ? "█" : ""}</text>
            </box>
          </box>
          <box flexDirection="row" height={1}>
            <text fg={COLORS.text} width={12}>Token</text>
            <box width={formW() - 12} height={1} backgroundColor={fieldIdx() === 1 ? COLORS.overlay : COLORS.surface} paddingLeft={1}>
              <text fg={fieldToken() ? COLORS.text : COLORS.muted}>
                {fieldToken() ? "•".repeat(Math.min(fieldToken().length, 24)) : "sbp_…"}{fieldIdx() === 1 ? "█" : ""}
              </text>
            </box>
          </box>
          <box height={1} />
          <box height={1}>
            <text fg={COLORS.muted}>{savingAccount() ? "validating…" : "tab switch · ↵ save · esc cancel"}</text>
          </box>
        </box>
      </Show>

      {/* ── Project list ──────────────────────────────────────── */}
      <Show when={!addingAccount()}>
        <Show when={loading()}>
          <box paddingLeft={2} paddingTop={1}><text fg={COLORS.subtext}>Loading projects…</text></box>
        </Show>
        <Show when={error()}>
          <box paddingLeft={2} paddingTop={1}><text fg={COLORS.yellow}>{error()}</text></box>
        </Show>
        <Show when={!loading() && rows().length === 0 && !error()}>
          <box paddingLeft={2} paddingTop={1} flexDirection="column">
            <text fg={COLORS.subtext}>No projects found.</text>
            <text fg={COLORS.muted}>press a to add another supabase account</text>
          </box>
        </Show>

        <For each={display()}>
          {(item) => {
            return (
              <Show when={item.kind === "header"} fallback={
                (() => {
                  const it = item as { kind: "row"; row: ProjectRow; idx: number }
                  const active = () => props.focused && cursor() === it.idx
                  const isChecked = () => checked().has(it.row.ref)
                  return (
                    <box
                      flexDirection="row" paddingLeft={1} height={1}
                      backgroundColor={active() ? COLORS.overlay : COLORS.background}
                      onMouseUp={() => { setCursor(it.idx); toggleChecked() }}
                    >
                      <text fg={isChecked() ? COLORS.green : COLORS.muted} width={4}>
                        {isChecked() ? "[x]" : "[ ]"}
                      </text>
                      <text fg={active() ? COLORS.text : COLORS.subtext} width={28}>
                        {active() ? "▶ " : "  "}{it.row.name}
                      </text>
                      <text fg={COLORS.muted}>{it.row.ref}</text>
                    </box>
                  )
                })()
              }>
                <box paddingLeft={1} height={1} marginTop={item.kind === "header" ? 1 : 0}>
                  <text fg={COLORS.blue} attributes={1}>{(item as { label: string }).label}</text>
                </box>
              </Show>
            )
          }}
        </For>

        <box height={1} />
        <box height={1} paddingLeft={1} backgroundColor={COLORS.surface}>
          <text fg={COLORS.muted}>space check/uncheck · checks apply live · a add account · esc done</text>
        </box>
      </Show>

    </box>
  )
}
