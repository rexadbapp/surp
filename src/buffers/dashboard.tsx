import { createSignal, createMemo, createEffect, For, Show, onMount, onCleanup, type JSX } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import { useConnection } from "../context/connection"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"
import { hoverProps, isHovered } from "../ui/hover"
import type { PinnedProject } from "../connections/store"
import * as connStore from "../connections/store"

// ── ASCII art logo ────────────────────────────────────────────────────────────
const LOGO = [
  "███████╗██╗   ██╗██████╗ ██████╗ ",
  "██╔════╝██║   ██║██╔══██╗██╔══██╗",
  "███████╗██║   ██║██████╔╝██████╔╝",
  "╚════██║██║   ██║██╔══██╗██╔═══╝ ",
  "███████║╚██████╔╝██║  ██║██║     ",
  "╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ",
]
const LOGO_W = 34
const SUBTITLE = "connect to any database  ·  supabase too"

// ── grid geometry ─────────────────────────────────────────────────────────────
const COLS = 3
const GAP = 1
const MARGIN = 2
const CARD_H = 5

function trunc(s: string, w: number): string {
  return s.length <= w ? s : s.slice(0, Math.max(0, w - 1)) + "…"
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DashboardBuffer(props: BufferProps) {
  const connCtx = useConnection()
  const buffers = useBuffers()
  const keymap  = useKeymap()
  const renderer = useRenderer()

  const [cursor, setCursor] = createSignal(0)

  type Card =
    | { kind: "pg"; id: string; name: string; profile: import("../connections/types").PostgresProfile }
    | { kind: "sb"; id: string; name: string; pin: PinnedProject }

  // home-page cards: saved postgres profiles + pinned supabase projects
  const cards = createMemo<Card[]>(() => [
    ...connCtx.savedProfiles().map((profile): Card => ({ kind: "pg", id: profile.id, name: profile.name || profile.host, profile })),
    ...connCtx.pinnedProjects().map((pin): Card => ({ kind: "sb", id: `sb-${pin.ref}`, name: pin.name, pin })),
  ])
  const totalCards = () => cards().length

  const cardW = createMemo(() => Math.max(18, Math.floor((props.width - MARGIN * 2 - GAP * (COLS - 1)) / COLS)))

  // rows of card indices, COLS per row — connections only
  const rows = createMemo(() => {
    const out: number[][] = []
    for (let i = 0; i < totalCards(); i += COLS) {
      const row: number[] = []
      for (let j = i; j < Math.min(i + COLS, totalCards()); j++) row.push(j)
      out.push(row)
    }
    return out
  })

  // keep cursor in bounds when profiles change
  createEffect(() => {
    const max = Math.max(0, totalCards() - 1)
    if (cursor() > max) setCursor(max)
  })

  function openNew() { buffers.open("connections", { mode: "form" }) }
  function openPasteUrl() { buffers.open("connections", { mode: "url" }) }
  function openSupabase() { buffers.open("projects") }
  function openImport() { buffers.open("import") }

  function activate(idx: number) {
    const card = cards()[idx]
    if (!card) return
    if (card.kind === "pg") void connCtx.connectSavedProfile(card.profile.name)
    else void connCtx.connectPinned(card.pin)
  }

  function deleteSelected() {
    const card = cards()[cursor()]
    if (!card) return
    if (card.kind === "pg") void connCtx.deleteSavedProfile(card.profile.id)
    else {
      const rest = connCtx.pinnedProjects().filter((p) => p.ref !== card.pin.ref)
      void connStore.setPinned(rest).then(() => connCtx.refreshPinned())
    }
  }

  keymap.onAction("move_right", () => { if (props.focused) setCursor((c) => Math.min(totalCards() - 1, c + 1)) })
  keymap.onAction("move_left",  () => { if (props.focused) setCursor((c) => Math.max(0, c - 1)) })
  keymap.onAction("move_down",  () => { if (props.focused) setCursor((c) => Math.min(totalCards() - 1, c + COLS)) })
  keymap.onAction("move_up",    () => { if (props.focused) setCursor((c) => Math.max(0, c - COLS)) })
  keymap.onAction("select",     () => { if (props.focused) activate(cursor()) })
  keymap.onAction("delete",     () => { if (props.focused) deleteSelected() })
  keymap.onAction("refresh",    () => { if (props.focused) void connCtx.refreshSaved() })

  // quick shortcuts: n new form · u paste url · x disconnect
  onMount(() => {
    const kh = renderer.keyInput
    function onKey(e: KeyEvent) {
      if (!props.focused || e.ctrl || e.meta || e.name.length !== 1) return
      if (e.name === "n") openNew()
      else if (e.name === "u") openPasteUrl()
      else if (e.name === "i") openImport()
      else if (e.name === "x" && connCtx.active()) void connCtx.disconnect()
    }
    kh.on("keypress", onKey)
    onCleanup(() => kh.off("keypress", onKey))
  })

  const logoPad = createMemo(() => Math.max(0, Math.floor((props.width - LOGO_W) / 2)))
  const subPad  = createMemo(() => Math.max(0, Math.floor((props.width - SUBTITLE.length) / 2)))
  const gridPad = createMemo(() => Math.max(MARGIN, Math.floor((props.width - (cardW() * COLS + GAP * (COLS - 1))) / 2)))

  // ── plain-text action links (not cards) ──────────────────────
  function ActionLink(props: { id: string; icon: string; label: string; hint: string; onActivate: () => void }) {
    const hovered = () => isHovered(props.id)
    const tips: Record<string, string> = {
      "dash-action-new": "Open the new-connection form",
      "dash-action-url": "Paste a postgres:// connection string",
      "dash-action-sb": "Browse your Supabase projects",
      "dash-action-import": "Import Supabase projects to this page",
    }
    return (
      <box flexDirection="row" {...hoverProps(props.id, tips[props.id])} onMouseUp={() => props.onActivate()}>
        <text fg={COLORS.blue}>{props.icon} </text>
        <text fg={hovered() ? COLORS.lavender : COLORS.text} attributes={1}>{props.label}</text>
        <text fg={COLORS.muted}> {props.hint}</text>
      </box>
    )
  }

  function renderCard(idx: number, focused: boolean) {
    const selected = () => focused && cursor() === idx
    const hovered = () => isHovered(`dash-card-${idx}`)
    const card = cards()[idx]!
    const isConnected = () =>
      card.kind === "pg"
        ? connCtx.active()?.id === card.profile.id
        : connCtx.active()?.kind === "supabase" && connCtx.active()?.supabase?.ref === card.pin.ref

    const tip = () =>
      card.kind === "pg"
        ? `${card.profile.user ? card.profile.user + "@" : ""}${card.profile.host}:${card.profile.port ?? 5432}/${card.profile.database ?? ""}${card.profile.ssl ? " · ssl" : ""} — ↵ connect`
        : `Supabase project ${card.pin.name} — ↵ connect`

    const frame = (content: () => JSX.Element) => (
      <box
        flexDirection="column"
        width={cardW()}
        height={CARD_H}
        marginRight={GAP}
        backgroundColor={selected() ? COLORS.overlay : hovered() ? COLORS.overlay : COLORS.surface}
        {...hoverProps(`dash-card-${idx}`, tip())}
        onMouseUp={() => { setCursor(idx); activate(idx) }}
      >
        <box height={1} backgroundColor={isConnected() ? COLORS.green : selected() ? COLORS.mauve : card.kind === "sb" ? COLORS.teal : COLORS.border} />
        <box flexDirection="column" paddingLeft={2} paddingTop={1}>
          <box height={1} flexDirection="row">
            <Show when={isConnected()}>
              <text fg={COLORS.green}>● </text>
            </Show>
            <text fg={selected() || hovered() ? COLORS.text : COLORS.subtext} attributes={selected() || hovered() ? 1 : 0}>
              {trunc(card.name || "connection", cardW() - 4 - (isConnected() ? 2 : 0))}
            </text>
          </box>
          {content()}
        </box>
      </box>
    )

    if (card.kind === "pg") {
      const p = card.profile
      return frame(() => (
        <box flexDirection="column">
          <box height={1} paddingLeft={2}>
            <text fg={COLORS.muted}>
              {trunc(`${p.user ? `${p.user}@` : ""}${p.host}`, cardW() - 4)}
            </text>
          </box>
          <box height={1} paddingLeft={2} flexDirection="row">
            <text fg={COLORS.subtext}>{trunc(p.database ?? "", Math.floor((cardW() - 4) / 2))}</text>
            <text fg={p.ssl ? COLORS.teal : COLORS.overlay}>{p.ssl ? "ssl" : ""}</text>
          </box>
        </box>
      ))
    }

    const pin = card.pin
    return frame(() => (
      <box flexDirection="column">
        <box height={1} paddingLeft={2}>
          <text fg={COLORS.muted}>{trunc(`supabase · ${pin.ref}`, cardW() - 4)}</text>
        </box>
        <box height={1} paddingLeft={2}>
          <text fg={COLORS.teal}>{pin.accountId !== "primary" ? trunc(`account: ${pin.accountId}`, cardW() - 4) : ""}</text>
        </box>
      </box>
    ))
  }

  return (
    <box flexDirection="column" width={props.width} height={props.height} backgroundColor={COLORS.background}>

      {/* Logo */}
      <box height={1} />
      <For each={LOGO}>
        {(line) => (
          <box height={1} paddingLeft={logoPad()}>
            <text fg={COLORS.lavender}>{line}</text>
          </box>
        )}
      </For>
      <box height={1} paddingLeft={subPad()}>
        <text fg={COLORS.muted}>{SUBTITLE}</text>
      </box>

      {/* Active connection strip */}
      <box height={1} />
      <box height={1} paddingLeft={gridPad()} flexDirection="row">
        <Show when={connCtx.active()} fallback={
          <text fg={COLORS.muted}>not connected</text>
        }>
          {(c) => (
            <>
              <text fg={COLORS.green}>● </text>
              <text fg={COLORS.text}>connected to {c()!.label}</text>
              <text fg={COLORS.muted}>  ·  x disconnect</text>
            </>
          )}
        </Show>
      </box>

      {/* Actions — plain text, not boxes */}
      <box height={1} />
      <box height={1} paddingLeft={gridPad()} flexDirection="row">
        <ActionLink id="dash-action-new" icon="⊕" label="new connection" hint="(n)" onActivate={openNew} />
        <text fg={COLORS.overlay}>   </text>
        <ActionLink id="dash-action-url" icon="⎆" label="paste url" hint="(u)" onActivate={openPasteUrl} />
        <text fg={COLORS.overlay}>   </text>
        <ActionLink id="dash-action-sb" icon="◉" label="supabase" hint="(:projects)" onActivate={openSupabase} />
        <text fg={COLORS.overlay}>   </text>
        <ActionLink id="dash-action-import" icon="⇩" label="import" hint="(:import)" onActivate={openImport} />
      </box>

      {/* Connections grid */}
      <box height={1} />
      <Show when={totalCards() > 0} fallback={
        <box paddingLeft={gridPad()}>
          <text fg={COLORS.muted}>no connections yet — press n, paste a url with u, or import supabase projects with :import</text>
        </box>
      }>
        <box flexDirection="column" paddingLeft={gridPad()}>
          <For each={rows()}>
            {(row) => (
              <box flexDirection="row" height={CARD_H}>
                <For each={row}>
                  {(idx) => renderCard(idx, props.focused)}
                </For>
              </box>
            )}
          </For>
        </box>
      </Show>

      {/* Footer hints */}
      <box height={1} />
      <box height={1} paddingLeft={gridPad()} flexDirection="row">
        <text fg={COLORS.muted}>
          hjkl navigate  ·  ↵ connect  ·  d delete  ·  space e explorer  ·  :help
        </text>
      </box>

    </box>
  )
}
