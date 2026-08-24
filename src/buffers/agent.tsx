import { createSignal, createMemo, For, Show, onMount, onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent, PasteEvent } from "@opentui/core"
import { useMode } from "../context/mode"
import { useBuffers } from "../context/buffers"
import { useConnection } from "../context/connection"
import { useKeymap } from "../context/keymap"
import {
  agentItems,
  agentBusy,
  agentInitializing,
  agentInitError,
  agentModel,
  setExecutorProvider,
  sendAgentPrompt,
  abortAgent,
} from "../agent/session"
import type { AgentItem } from "../agent/session"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

interface Line {
  text: string
  fg: string
  attributes?: number
}

function isPrintable(event: KeyEvent): boolean {
  return event.name.length === 1 && !event.ctrl && !event.meta
}
function toChar(event: KeyEvent): string {
  if (event.shift && event.name === ";") return ":"
  if (event.shift && event.name.length === 1) return event.name.toUpperCase()
  return event.name
}

function wrapText(text: string, width: number): string[] {
  const w = Math.max(20, width)
  const out: string[] = []
  for (const para of text.split("\n")) {
    if (para.length <= w) {
      out.push(para)
      continue
    }
    let line = ""
    for (const word of para.split(" ")) {
      if (line.length === 0) line = word
      else if (line.length + 1 + word.length <= w) line += " " + word
      else {
        out.push(line)
        line = word.length > w ? "" : word
        while (word.length > w) {
          out.push(word.slice(0, w))
          // remaining handled by continuing loop — approximate hard-split:
          break
        }
      }
    }
    if (line) out.push(line)
  }
  return out
}

const SPIN_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function AgentBuffer(props: BufferProps) {
  const mode = useMode()
  const buffers = useBuffers()
  const connCtx = useConnection()
  const keymap = useKeymap()
  const renderer = useRenderer()

  const [input, setInput] = createSignal("")
  const [scrollFromBottom, setScrollFromBottom] = createSignal(0)
  const [spin, setSpin] = createSignal(0)

  // Wire the live connection lookup once; the closure always reads the current active().
  onMount(() => {
    setExecutorProvider(() => {
      const act = connCtx.active()
      if (!act) return null
      return {
        kind: act.driver.kind === "supabase" ? "supabase" : "postgres",
        label: act.label,
        query: async (t: string) => (await act.driver.query(t)).rows,
        readOnlyQuery: act.driver.readOnlyQuery
          ? async (t: string, ms?: number) => (await act.driver.readOnlyQuery!(t, ms)).rows
          : undefined,
      }
    })

    const initial = props.meta.data?.["prompt"]
    if (typeof initial === "string" && initial.trim()) void sendAgentPrompt(initial)

    const initErr = props.meta.data?.["initError"]
    if (typeof initErr === "string" && initErr.trim()) {
      import("../agent/session").then((m) => m.pushAgentNotice(initErr, "error"))
    }

    let timer: ReturnType<typeof setInterval> | null = null
    timer = setInterval(() => setSpin((s) => s + 1), 90)
    onCleanup(() => {
      if (timer) clearInterval(timer)
    })
  })

  // Flatten transcript items into display lines.
  const lines = createMemo<Line[]>(() => {
    const w = props.width - 2
    const out: Line[] = []
    for (const item of agentItems()) out.push(...itemLines(item, w, spin()))
    return out
  })

  function itemLines(item: AgentItem, w: number, frame: number): Line[] {
    switch (item.kind) {
      case "user":
        return wrapText(`❯ ${item.text}`, w).map((t, i) => ({
          text: i === 0 ? t : `  ${t}`,
          fg: COLORS.blue,
          attributes: i === 0 ? 1 : 0,
        }))
      case "assistant":
        if (item.text.length === 0) {
          // Empty + not live = run was stopped before any tokens arrived;
          // don't leave a spinner ghost behind.
          return item.live
            ? [{ text: `${SPIN_FRAMES[frame % SPIN_FRAMES.length]} thinking…`, fg: COLORS.muted }]
            : [{ text: "· stopped", fg: COLORS.muted }]
        }
        return wrapText(item.text, w).map((t) => ({ text: t, fg: COLORS.text }))
      case "tool": {
        if (item.state === "running") {
          const argHint = trunc(item.args, Math.max(10, w - item.name.length - 6))
          return [{ text: `${SPIN_FRAMES[frame % SPIN_FRAMES.length]} ${item.name} ${argHint}`, fg: COLORS.yellow }]
        }
        const glyph = item.state === "done" ? "✔" : "✖"
        const fg = item.state === "done" ? COLORS.subtext : COLORS.red
        const body = item.summary ? `${item.name} · ${trunc(item.summary, Math.max(10, w - item.name.length - 6))}` : item.name
        return [{ text: `${glyph} ${body}`, fg, attributes: item.state === "error" ? 1 : 0 }]
      }
      case "error":
        return wrapText(`✖ ${item.text}`, w).map((t) => ({ text: t, fg: COLORS.red }))
      case "info":
        return [{ text: `· ${trunc(item.text, w)}`, fg: COLORS.muted }]
    }
  }

  function trunc(s: string, w: number): string {
    return s.length <= w ? s : s.slice(0, Math.max(0, w - 1)) + "…"
  }

  const transcriptH = createMemo(() => Math.max(1, props.height - 3))

  // Window into the flattened lines. scrollFromBottom(0) = follow tail.
  const visStart = createMemo(() => {
    const n = lines().length
    const h = transcriptH()
    if (n <= h) return 0
    return Math.max(0, n - h - scrollFromBottom())
  })
  const vis = createMemo(() => {
    const s = visStart(), h = transcriptH(), n = lines().length
    const out: number[] = []
    for (let i = s; i < Math.min(s + h, n); i++) out.push(i)
    return out
  })

  keymap.onAction("move_up", () => { if (props.focused) scrollBy(-1) })
  keymap.onAction("move_down", () => { if (props.focused) scrollBy(1) })
  keymap.onAction("scroll_up", () => { if (props.focused) scrollBy(-Math.floor(transcriptH() / 2)) })
  keymap.onAction("scroll_down", () => { if (props.focused) scrollBy(Math.floor(transcriptH() / 2)) })
  keymap.onAction("go_top", () => { if (props.focused) setScrollFromBottom(lines().length) })
  keymap.onAction("go_bottom", () => { if (props.focused) setScrollFromBottom(0) })

  function scrollBy(delta: number) {
    setScrollFromBottom((s) => Math.max(0, s + delta))
  }

  function submit() {
    const text = input().trim()
    if (!text) return
    setInput("")
    setScrollFromBottom(0)
    void sendAgentPrompt(text)
    buffers.setStatus(props.meta.id, "")
  }

  onMount(() => {
    const kh = renderer.keyInput

    function onKeypress(event: KeyEvent) {
      if (!props.focused) return

      // Normal mode niceties: Enter/i jump into the composer; esc stops a run.
      if (mode.is("normal")) {
        if (event.name === "escape" && agentBusy()) {
          event.stopPropagation()
          void abortAgent()
          return
        }
        if (event.name === "return" || event.name === "enter" || event.name === "i") {
          event.stopPropagation()
          mode.enterInsert()
          return
        }
        return
      }
      if (!mode.is("insert")) return
      event.stopPropagation()

      if (event.name === "escape") {
        // While a request is running, esc means STOP (stays in the composer).
        if (agentBusy()) {
          void abortAgent()
          return
        }
        mode.enterNormal()
        return
      }
      if (event.name === "return" || event.name === "enter") {
        submit()
        return
      }
      if (event.name === "backspace") {
        setInput((s) => s.slice(0, -1))
        return
      }
      if (event.ctrl && event.name === "u") {
        setInput("")
        return
      }
      if (event.name === "space" || event.sequence === " ") {
        setInput((s) => (s + " ").slice(0, 4000))
        return
      }
      if (isPrintable(event)) setInput((s) => (s + toChar(event)).slice(0, 4000))
    }

    kh.on("keypress", onKeypress)

    // Coalesced / bracketed-pasted text arrives as a paste event
    const decoder = new TextDecoder()
    function onPaste(event: PasteEvent) {
      if (!props.focused || !mode.is("insert")) return
      event.preventDefault()
      const text = decoder.decode(event.bytes).replace(/[\r\n]+/g, " ")
      if (text) setInput((s) => (s + text).slice(0, 4000))
    }
    kh.on("paste", onPaste)
    onCleanup(() => {
      kh.off("keypress", onKeypress)
      kh.off("paste", onPaste)
      // Never leave the global keyboard in insert mode after this buffer dies.
      if (!mode.is("normal")) mode.enterNormal()
    })
  })

  const connLabel = createMemo(() => connCtx.active()?.label ?? "no connection")
  const statusLine = createMemo(() => {
    if (agentBusy()) return `${SPIN_FRAMES[spin() % SPIN_FRAMES.length]} working…  (esc: stop)`
    if (agentInitializing()) return "starting agent…"
    if (agentInitError()) return "agent failed to start — see transcript"
    return ""
  })

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      <box height={1} paddingLeft={1} flexDirection="row" backgroundColor={COLORS.overlay}>
        <text fg={COLORS.mauve} attributes={1}>✦ agent</text>
        <Show when={agentModel()}>
          <text fg={COLORS.subtext}>  {agentModel()}</text>
        </Show>
        <text fg={connCtx.active() ? COLORS.blue : COLORS.red}>  ⎈ {trunc(connLabel(), Math.max(12, props.width - 40))}</text>
        <text fg={COLORS.muted}>  ·  i ask  esc stop/normal  j/k scroll  :agent-new reset</text>
      </box>

      <Show when={agentInitError()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.red}>{wrapText(agentInitError()!, props.width - 4)[0]}</text>
          <text fg={COLORS.muted}>
            configure a model with DBAGENT_MODEL=provider/model env or ~/.dbagent/config.json {"{"}"model":"provider/model"{"}"}
          </text>
        </box>
      </Show>

      <box flexDirection="column" height={transcriptH()} overflow={"hidden" as any} paddingLeft={1} paddingTop={0}>
        <For each={vis()}>
          {(idx) => {
            const line = () => lines()[idx]
            return (
              <Show when={line()} fallback={<box height={1} />}>
                <text fg={line()!.fg} attributes={line()!.attributes}>{line()!.text}</text>
              </Show>
            )
          }}
        </For>
        <Show when={lines().length === 0 && !agentInitError()}>
          <box flexDirection="column" paddingTop={1}>
            <text fg={COLORS.muted}>Ask anything about the connected database.</text>
            <text fg={COLORS.subtext}>Examples:</text>
            <text fg={COLORS.subtext}>  · what tables exist and which is the biggest?</text>
            <text fg={COLORS.subtext}>  · find columns that look like emails across all tables</text>
            <text fg={COLORS.subtext}>  · explain what the orders → users relationship looks like</text>
            <text fg={COLORS.yellow}>  read-only mode: it can never modify your data</text>
          </box>
        </Show>
      </box>

      <box height={1} flexDirection="row" paddingLeft={1} backgroundColor={COLORS.surface}>
        <text fg={COLORS.mauve}>❯ </text>
        {/* Single text node incl. cursor — splitting into siblings makes the
            renderer's cell-diff leave stale cursor blocks during fast typing */}
        <text fg={COLORS.text}>{input()}{mode.is("insert") ? "▌" : ""}</text>
        <Show when={statusLine()}><text fg={COLORS.yellow}>  {statusLine()}</text></Show>
      </box>
    </box>
  )
}
