import { createMemo, createSignal, Show, onMount, onCleanup } from "solid-js"
import { useMode } from "../context/mode"
import { useBuffers } from "../context/buffers"
import { useConnection } from "../context/connection"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import { COLORS } from "./colors"

const PL_RIGHT = "" // ▶ powerline left→right separator
const PL_LEFT  = "" // ◀ powerline right→left separator

const MODE_BG: Record<string, string> = {
  normal:  COLORS.blue,
  command: COLORS.yellow,
  insert:  COLORS.green,
  visual:  COLORS.mauve,
}
const MODE_LABEL: Record<string, string> = {
  normal:  "NORMAL",
  command: "COMMAND",
  insert:  "INSERT",
  visual:  "VISUAL",
}
const BUF_ICON: Record<string, string> = {
  projects: "◉",
  tables:   "≡",
  table:    "⊞",
  sql:      "λ",
  login:    "⎆",
  account:  "⚙",
  help:     "?",
}

function getTime() {
  const d = new Date()
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0")
}

function trunc(s: string, w: number): string {
  return s.length <= w ? s : s.slice(0, Math.max(0, w - 1)) + "…"
}

interface StatusBarProps { width: number }

export function StatusBar(props: StatusBarProps) {
  const mode    = useMode()
  const buffers = useBuffers()
  const connCtx = useConnection()
  const keymap  = useKeymap()
  const yank    = useYank()

  const [branch, setBranch] = createSignal("main")
  const [time, setTime]     = createSignal(getTime())

  onMount(async () => {
    try {
      const proc = Bun.spawn(["git", "branch", "--show-current"], { stdout: "pipe", stderr: "ignore", cwd: process.cwd() })
      const text = await new Response(proc.stdout).text()
      const b = text.trim()
      if (b) setBranch(b)
    } catch {}

    const tick = setInterval(() => setTime(getTime()), 30_000)
    onCleanup(() => clearInterval(tick))
  })

  const modeBg    = createMemo(() => MODE_BG[mode.mode()] ?? COLORS.blue)
  const modeLabel = createMemo(() => MODE_LABEL[mode.mode()] ?? mode.mode().toUpperCase())
  const active    = createMemo(() => buffers.activeBuffer())
  const bufIcon   = createMemo(() => BUF_ICON[active()?.type ?? ""] ?? "·")
  const bufName   = createMemo(() => active()?.title ?? "[No buffer]")
  const bufCount  = createMemo(() => `${buffers.list.length} buf`)

  // width budget so buffer name + status never overflow into the right cluster
  const LEFT_RESERVE = 50
  const RIGHT_RESERVE = 36
  const avail = () => Math.max(20, props.width - LEFT_RESERVE - RIGHT_RESERVE)
  const bufNameMax = () => Math.min(40, Math.max(10, Math.floor(avail() * 0.5)))
  const statusMax = () => Math.max(8, avail() - bufNameMax() - 3)
  const pending   = createMemo(() => {
    const seq = keymap.pendingSequence()
    return seq.length > 0 ? seq.join("") : ""
  })

  return (
    <box flexDirection="row" width={props.width} height={1} backgroundColor={COLORS.surface}>

      {/* ── Left ─────────────────────────────────────────── */}
      {/* Mode badge */}
      <box paddingLeft={1} paddingRight={1} backgroundColor={modeBg()}>
        <text fg={COLORS.surface} attributes={1}>{modeLabel()}</text>
      </box>
      {/* Powerline separator mode → branch */}
      <box backgroundColor={COLORS.overlay}><text fg={modeBg()}>{PL_RIGHT}</text></box>

      {/* Git branch */}
      <box paddingLeft={1} paddingRight={1} backgroundColor={COLORS.overlay}>
        <text fg={COLORS.text}> {branch()}</text>
      </box>
      {/* Separator branch → connection */}
      <Show when={connCtx.active()}>
        <box backgroundColor={COLORS.background}><text fg={COLORS.overlay}>{PL_RIGHT}</text></box>
        <box paddingLeft={1} paddingRight={1} backgroundColor={COLORS.background}>
          <text fg={connCtx.active()!.kind === "postgres" ? COLORS.blue : COLORS.green}>
            ● {trunc(connCtx.active()!.label, 24)}
          </text>
        </box>
      </Show>
      {/* Separator branch → buffer name */}
      <box backgroundColor={COLORS.background}><text fg={COLORS.overlay}>{PL_RIGHT}</text></box>

      {/* Buffer icon + name  (replaced by yank notification when active) */}
      <box paddingLeft={1} paddingRight={1} flexGrow={1} flexDirection="row" backgroundColor={COLORS.background}>
        {yank.notification()
          ? <text fg={COLORS.green}>  {yank.notification()}</text>
          : <>
              <text fg={COLORS.muted}>{bufIcon()} </text>
              <text fg={COLORS.text} width={bufNameMax()}>{trunc(bufName(), bufNameMax())}</text>
              <Show when={active()?.status}>
                <text fg={COLORS.subtext} width={statusMax()}>  {trunc(active()!.status ?? "", statusMax())}</text>
              </Show>
            </>
        }
      </box>

      {/* ── Right ────────────────────────────────────────── */}
      {/* Pending key sequence */}
      <box paddingLeft={1} paddingRight={1} backgroundColor={COLORS.background}>
        <text fg={COLORS.yellow}>{pending()}</text>
      </box>

      {/* Separator → buf count */}
      <box backgroundColor={COLORS.background}><text fg={COLORS.overlay}>{PL_LEFT}</text></box>
      <box paddingLeft={1} paddingRight={1} backgroundColor={COLORS.overlay}>
        <text fg={COLORS.subtext}>⊕ {bufCount()}</text>
      </box>

      {/* Separator → clock */}
      <box backgroundColor={COLORS.overlay}><text fg={modeBg()}>{PL_LEFT}</text></box>
      <box paddingLeft={1} paddingRight={1} backgroundColor={modeBg()}>
        <text fg={COLORS.surface} attributes={1}>⊙ {time()}</text>
      </box>

    </box>
  )
}
