import { createSignal, createMemo, For, Show, onMount } from "solid-js"
import { useAuth } from "../context/auth"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import { getEdgeLogs, getPostgresLogs, getAuthLogs, type LogRow } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

type LogTab = "api" | "database" | "auth"
const TABS: LogTab[] = ["api", "database", "auth"]
const TAB_LABEL: Record<LogTab, string> = { api: "API", database: "Database", auth: "Auth" }

const caches = new Map<string, LogRow[]>()

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
  } catch { return iso }
}

function trunc(s: string, w: number) { return s.length <= w ? s : s.slice(0, w - 1) + "\u2026" }

const FETCHERS: Record<LogTab, (t: string, r: string, l: number) => Promise<LogRow[]>> = {
  api: getEdgeLogs,
  database: getPostgresLogs,
  auth: getAuthLogs,
}

export function LogsBuffer(props: BufferProps) {
  const auth = useAuth()
  const keymap = useKeymap()
  const yank = useYank()

  const ref = () => String(props.meta.data?.["project"] ?? "")

  const [tab, setTab] = createSignal<LogTab>("api")
  const [cursor, setCursor] = createSignal(0)
  const [logs, setLogs] = createSignal<LogRow[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  async function load(force = false) {
    const token = auth.token(), r = ref(), t = tab()
    if (!token || !r) return
    const ck = `${r}:${t}`
    if (!force && caches.has(ck)) { setLogs(caches.get(ck)!); return }
    setLoading(true); setError(null)
    try {
      const d = await FETCHERS[t](token, r, 500)
      caches.set(ck, d)
      setLogs(d)
      setCursor(0)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => void load())

  const contentH = createMemo(() => Math.max(1, props.height - 4))
  const rowH = createMemo(() => Math.max(1, contentH() - 1))
  const tsW = 20
  const colW = 8
  const statusW = createMemo(() => tab() === "auth" ? 0 : 8)
  const msgW = createMemo(() => Math.max(10, props.width - tsW - colW - statusW() - 4))

  const visStart = createMemo(() => {
    const c = cursor(), h = rowH(), n = logs().length
    if (n <= h) return 0
    let s = c - Math.floor(h / 2)
    return Math.max(0, Math.min(s, n - h))
  })
  const vis = createMemo(() => {
    cursor()
    const s = visStart(), h = rowH(), n = logs().length
    const end = Math.min(s + h, n)
    const out: number[] = []
    for (let i = s; i < end; i++) out.push(i)
    return out
  })

  function cursorMove(delta: number) {
    setCursor(c => {
      const max = Math.max(0, logs().length - 1)
      return Math.max(0, Math.min(max, c + delta))
    })
  }

  function switchTab(t: LogTab) {
    setTab(t)
    setCursor(0)
    setError(null)
    const ck = `${ref()}:${t}`
    if (caches.has(ck)) {
      setLogs(caches.get(ck)!)
    } else {
      const token = auth.token(), r = ref()
      if (!token || !r) return
      setLoading(true)
      FETCHERS[t](token, r, 500).then((d) => {
        caches.set(ck, d)
        setLogs(d)
      }).catch((e) => {
        setError(String(e))
      }).finally(() => setLoading(false))
    }
  }

  keymap.onAction("move_left", () => {
    if (!props.focused) return
    const i = TABS.indexOf(tab())
    if (i > 0) switchTab(TABS[i - 1]!)
  })
  keymap.onAction("move_right", () => {
    if (!props.focused) return
    const i = TABS.indexOf(tab())
    if (i < TABS.length - 1) switchTab(TABS[i + 1]!)
  })
  keymap.onAction("move_up", () => { if (props.focused) cursorMove(-1) })
  keymap.onAction("move_down", () => { if (props.focused) cursorMove(1) })
  keymap.onAction("scroll_up", () => { if (props.focused) cursorMove(-Math.floor(rowH() / 2)) })
  keymap.onAction("scroll_down", () => { if (props.focused) cursorMove(Math.floor(rowH() / 2)) })
  keymap.onAction("go_top", () => { if (props.focused) setCursor(0) })
  keymap.onAction("go_bottom", () => { if (props.focused) setCursor(Math.max(0, logs().length - 1)) })
  keymap.onAction("refresh", () => {
    if (!props.focused) return
    caches.clear()
    setCursor(0)
    void load(true)
  })
  keymap.onAction("yank", () => {
    if (!props.focused) return
    const log = logs()[cursor()]
    if (!log) return
    const t = tab()
    const val = t === "api" ? log.pathname ?? ""
      : t === "auth" ? log.pathname ?? log.event_message ?? ""
      : log.event_message ?? ""
    yank.yank(val, "message")
  })
  keymap.onAction("yank_row", () => {
    if (!props.focused) return
    const log = logs()[cursor()]
    if (!log) return
    yank.yank(JSON.stringify(log, null, 2), "row")
  })

  const COLUMN_LABELS: Record<LogTab, { info: string; status?: string; msg: string }> = {
    api: { info: "METHOD", status: "STATUS", msg: "PATH" },
    database: { info: "SEVERITY", status: "STATE", msg: "MESSAGE" },
    auth: { info: "LEVEL", msg: "MESSAGE" },
  }

  function infoCol(l: LogRow) {
    const t = tab()
    if (t === "database") {
      const lvl = (l.level ?? "").toUpperCase()
      const fg = lvl === "ERROR" || lvl === "FATAL" || lvl === "PANIC" ? COLORS.red
        : lvl === "WARNING" ? COLORS.yellow
        : COLORS.subtext
      return { fg, text: lvl }
    }
    if (t === "auth") {
      const lvl = (l.level ?? "").toLowerCase()
      const fg = lvl === "error" ? COLORS.red
        : lvl === "success" ? COLORS.green
        : COLORS.subtext
      return { fg, text: lvl }
    }
    return { fg: COLORS.green, text: (l.method ?? "").toUpperCase() }
  }

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      <box height={1} paddingLeft={1} flexDirection="row" backgroundColor={COLORS.overlay}>
        <text fg={COLORS.green} attributes={1}>logs  </text>
        <text fg={COLORS.blue}>{ref()}</text>
        <Show when={loading()}><text fg={COLORS.yellow}>  loading\u2026</text></Show>
        <Show when={!loading() && !error()}>
          <text fg={COLORS.muted}>  {logs().length} entries</text>
        </Show>
        <text fg={COLORS.muted}>  \u00b7  h/l tab  j/k nav  y yank  yy row  r refresh</text>
      </box>

      <box height={1} flexDirection="row" backgroundColor={COLORS.surface} paddingLeft={1}>
        <For each={TABS}>
          {(t) => {
            const active = () => t === tab()
            return (
              <box
                paddingLeft={1} paddingRight={2}
                backgroundColor={active() ? COLORS.overlay : COLORS.surface}
                onMouseUp={() => switchTab(t)}
              >
                <text fg={active() ? COLORS.mauve : COLORS.muted} attributes={active() ? 1 : 0}>
                  {TAB_LABEL[t]}
                </text>
              </box>
            )
          }}
        </For>
      </box>

      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1}><text fg={COLORS.red}>{error()}</text></box>
      </Show>

      <Show when={!error() && loading() && logs().length === 0}>
        <box paddingLeft={2} paddingTop={1}><text fg={COLORS.yellow}>loading logs\u2026</text></box>
      </Show>

      <Show when={!error() && !loading() && logs().length === 0}>
        <box paddingLeft={2} paddingTop={1}><text fg={COLORS.muted}>no log entries found</text></box>
      </Show>

      <Show when={logs().length > 0}>
        <box flexDirection="column" flexGrow={1} height={contentH()} overflow={"hidden" as any}>
          <box height={1} flexDirection="row" paddingLeft={1} backgroundColor={COLORS.surface}>
            <text fg={COLORS.muted} width={tsW}>TIMESTAMP</text>
            <text fg={COLORS.muted} width={colW}>{COLUMN_LABELS[tab()].info}</text>
            <Show when={statusW() > 0}>
              <text fg={COLORS.muted} width={statusW()}>{COLUMN_LABELS[tab()].status}</text>
            </Show>
            <text fg={COLORS.muted}>{COLUMN_LABELS[tab()].msg}</text>
          </box>
          <For each={vis()}>
            {(absIdx) => {
              const log = () => logs()[absIdx]
              const active = () => absIdx === cursor()
              const info = () => infoCol(log()!)
              const statusFg = () => {
                const sc = Number(log()?.status ?? 0)
                return sc >= 500 ? COLORS.red : sc >= 400 ? COLORS.yellow : sc > 0 ? COLORS.green : COLORS.subtext
              }
              const msg = () => {
                const l = log()!, t = tab()
                return t === "api" ? l.pathname ?? ""
                  : t === "auth" ? l.pathname ?? l.event_message ?? ""
                  : l.event_message ?? ""
              }
              return (
                <Show when={log()} fallback={<box height={1} />}>
                  <box height={1} flexDirection="row" paddingLeft={1}>
                    <text fg={active() ? COLORS.mauve : COLORS.muted}>{active() ? "\u25b8 " : "  "}</text>
                    <text fg={COLORS.muted} width={tsW}>{trunc(fmtDate(log()!.timestamp), tsW - 1)}</text>
                    <text fg={info().fg} width={colW}>{trunc(info().text, colW - 1)}</text>
                    <Show when={statusW() > 0}>
                      <text fg={statusFg()} width={statusW()}>{trunc(log()!.status ?? "", statusW() - 1)}</text>
                    </Show>
                    <text fg={COLORS.text}>{trunc(msg(), msgW())}</text>
                  </box>
                </Show>
              )
            }}
          </For>
        </box>
      </Show>
    </box>
  )
}
