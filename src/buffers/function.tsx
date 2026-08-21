import { createSignal, createMemo, createEffect, For, Show, onMount } from "solid-js"
import { useAuth } from "../context/auth"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import {
  getFunction, getFunctionBody, getFunctionLogs, getFunctionStats,
  type EdgeFunction, type FunctionLog, type FunctionStat,
} from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

// ── tabs ──────────────────────────────────────────────────────────────────────
type Tab = "overview" | "code" | "logs" | "invocations" | "settings"
const TABS: Tab[] = ["overview", "code", "logs", "invocations", "settings"]
const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview", code: "Code", logs: "Logs",
  invocations: "Invocations", settings: "Settings",
}

// ── cache ─────────────────────────────────────────────────────────────────────
const fnCache    = new Map<string, EdgeFunction>()
const bodyCache  = new Map<string, string>()
const logsCache  = new Map<string, FunctionLog[]>()
const statsCache = new Map<string, FunctionStat[]>()

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    })
  } catch { return iso }
}
function fmtHour(iso: string | null) {
  if (!iso) return "--:--"
  try { return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) }
  catch { return iso }
}
function trunc(s: string, w: number) { return s.length <= w ? s : s.slice(0, w - 1) + "…" }
function n(x: unknown): number { return typeof x === "number" ? x : (Number(x) || 0) }

// ── Card ──────────────────────────────────────────────────────────────────────
function Card(p: { label: string; value: string; sub?: string; fg?: string; width: number }) {
  return (
    <box width={p.width} height={5} backgroundColor={COLORS.surface} flexDirection="column">
      <box height={1} />
      <box height={1} paddingLeft={2}><text fg={COLORS.muted}>{trunc(p.label, p.width - 4)}</text></box>
      <box height={1} paddingLeft={2}><text fg={p.fg ?? COLORS.text} attributes={1}>{trunc(p.value, p.width - 4)}</text></box>
      <box height={1} paddingLeft={2}><text fg={COLORS.muted}>{p.sub ? trunc(p.sub, p.width - 4) : ""}</text></box>
      <box height={1} />
    </box>
  )
}

// ── Bar chart ─────────────────────────────────────────────────────────────────
const BLOCKS = " ▁▂▃▄▅▆▇█"
const CHART_H = 7

interface Span { text: string; fg: string }

function buildChart(stats: FunctionStat[], chartW: number): Span[][] {
  if (stats.length === 0) return []
  const maxVal = Math.max(1, ...stats.map(s => n(s.invocations)))
  const colW   = Math.max(1, Math.floor((chartW - 1) / stats.length))
  const rows   = Array.from({ length: CHART_H }, () =>
    Array.from({ length: chartW }, () => ({ ch: " ", fg: "" }))
  )

  stats.forEach((d, i) => {
    const x    = i * colW
    const fill = Math.round(n(d.invocations) / maxVal * CHART_H * 8)
    const fg   = n(d.errors) > 0 ? COLORS.red : COLORS.teal

    for (let row = 0; row < CHART_H; row++) {
      const level = Math.max(0, Math.min(8, fill - (CHART_H - 1 - row) * 8))
      if (level === 0) continue
      const ch = BLOCKS[level]!
      for (let bx = 0; bx < colW && x + bx < chartW; bx++) {
        rows[row]![x + bx] = { ch, fg }
      }
    }
  })

  return rows.map(row => {
    const spans: Span[] = []
    for (const c of row) {
      const last = spans[spans.length - 1]
      if (last && last.fg === c.fg) last.text += c.ch
      else spans.push({ text: c.ch, fg: c.fg })
    }
    return spans
  })
}

// ── Component ─────────────────────────────────────────────────────────────────
export function FunctionBuffer(props: BufferProps) {
  const auth   = useAuth()
  const keymap = useKeymap()
  const yank   = useYank()

  const ref  = () => String(props.meta.data?.["project"] ?? "")
  const slug = () => String(props.meta.data?.["slug"] ?? "")
  const url  = () => `https://${ref()}.supabase.co/functions/v1/${slug()}`
  const ck   = () => `${ref()}/${slug()}`

  const [tab,    setTab]    = createSignal<Tab>("overview")
  const [scroll, setScroll] = createSignal<Record<Tab, number>>({
    overview: 0, code: 0, logs: 0, invocations: 0, settings: 0,
  })

  const [fn,    setFn]    = createSignal<EdgeFunction | null>(null)
  const [body,  setBody]  = createSignal<string | null>(null)
  const [logs,  setLogs]  = createSignal<FunctionLog[]>([])
  const [stats, setStats] = createSignal<FunctionStat[]>([])

  const [fnLoad,    setFnLoad]    = createSignal(false)
  const [bodyLoad,  setBodyLoad]  = createSignal(false)
  const [logsLoad,  setLogsLoad]  = createSignal(false)
  const [statsLoad, setStatsLoad] = createSignal(false)

  const [fnErr,    setFnErr]    = createSignal<string | null>(null)
  const [bodyErr,  setBodyErr]  = createSignal<string | null>(null)
  const [logsErr,  setLogsErr]  = createSignal<string | null>(null)
  const [statsErr, setStatsErr] = createSignal<string | null>(null)

  async function loadFn(force = false) {
    const token = auth.token(), r = ref(), s = slug()
    if (!token || !r || !s) return
    const key = ck()
    if (!force && fnCache.has(key)) { setFn(fnCache.get(key)!); return }
    setFnLoad(true); setFnErr(null)
    try { const d = await getFunction(token, r, s); fnCache.set(key, d); setFn(d) }
    catch (e) { setFnErr(String(e)) }
    finally { setFnLoad(false) }
  }

  async function loadBody(force = false) {
    const token = auth.token(), r = ref(), s = slug()
    if (!token || !r || !s) return
    const key = ck()
    if (!force && bodyCache.has(key)) { setBody(bodyCache.get(key)!); return }
    setBodyLoad(true); setBodyErr(null)
    try { const d = await getFunctionBody(token, r, s); bodyCache.set(key, d); setBody(d) }
    catch (e) { setBodyErr(String(e)) }
    finally { setBodyLoad(false) }
  }

  async function loadLogs(force = false) {
    const f = fn(), token = auth.token(), r = ref()
    if (!f || !token || !r) return
    const key = ck()
    if (!force && logsCache.has(key)) { setLogs(logsCache.get(key)!); return }
    setLogsLoad(true); setLogsErr(null)
    try { const d = await getFunctionLogs(token, r, f.id); logsCache.set(key, d); setLogs(d) }
    catch (e) { setLogsErr(String(e)) }
    finally { setLogsLoad(false) }
  }

  async function loadStats(force = false) {
    const f = fn(), token = auth.token(), r = ref()
    if (!f || !token || !r) return
    const key = ck()
    if (!force && statsCache.has(key)) { setStats(statsCache.get(key)!); return }
    setStatsLoad(true); setStatsErr(null)
    try { const d = await getFunctionStats(token, r, f.id); statsCache.set(key, d); setStats(d) }
    catch (e) { setStatsErr(String(e)) }
    finally { setStatsLoad(false) }
  }

  onMount(() => void loadFn())

  createEffect(() => {
    const t = tab(), f = fn()
    if (!f) return
    if (t === "code"        && body()  === null    && !bodyLoad())  void loadBody()
    if (t === "logs"        && logs().length === 0 && !logsLoad())  void loadLogs()
    if (t === "invocations" && stats().length === 0 && !statsLoad()) void loadStats()
  })

  const contentH = createMemo(() => Math.max(1, props.height - 2))

  function scrollTab(delta: number) {
    const t = tab()
    setScroll(s => ({ ...s, [t]: Math.max(0, s[t] + delta) }))
  }

  keymap.onAction("move_left",   () => { if (props.focused) { const i = TABS.indexOf(tab()); if (i > 0) setTab(TABS[i-1]!) } })
  keymap.onAction("move_right",  () => { if (props.focused) { const i = TABS.indexOf(tab()); if (i < TABS.length-1) setTab(TABS[i+1]!) } })
  keymap.onAction("move_up",     () => { if (props.focused) scrollTab(-1) })
  keymap.onAction("move_down",   () => { if (props.focused) scrollTab(1) })
  keymap.onAction("scroll_up",   () => { if (props.focused) scrollTab(-Math.floor(contentH() / 2)) })
  keymap.onAction("scroll_down", () => { if (props.focused) scrollTab(Math.floor(contentH() / 2)) })
  keymap.onAction("yank",        () => { if (props.focused) yank.yank(url(), "url") })
  keymap.onAction("yank_row",    () => {
    if (!props.focused) return
    const f = fn()
    if (f) yank.yank(`${f.name}\n${url()}\n${f.slug}`, "function")
  })
  keymap.onAction("refresh", () => {
    if (!props.focused) return
    const key = ck()
    fnCache.delete(key); bodyCache.delete(key); logsCache.delete(key); statsCache.delete(key)
    void loadFn()
    const t = tab()
    if (t === "code")        void loadBody(true)
    if (t === "logs")        void loadLogs(true)
    if (t === "invocations") void loadStats(true)
  })

  const cardW = createMemo(() => Math.max(18, Math.floor((props.width - 6) / 2)))

  // ── Overview ───────────────────────────────────────────────────────────────
  function TabOverview() {
    return (
      <Show when={fn()}>
        {(f) => (
          <box flexDirection="column" paddingLeft={2} paddingTop={1}>
            <box height={1}><text fg={COLORS.text} attributes={1}>{f().name}</text></box>
            <box height={1}><text fg={COLORS.blue}>{url()}</text></box>
            <box height={1} />
            <box flexDirection="row">
              <Card label="STATUS"  value={f().status} fg={f().status === "ACTIVE" ? COLORS.green : COLORS.yellow} width={cardW()} />
              <box width={2} />
              <Card label="VERSION" value={`v${f().version}`} width={cardW()} />
            </box>
            <box height={1} />
            <box flexDirection="row">
              <Card label="ENTRYPOINT" value={f().entrypoint_path ?? "index.ts"} width={cardW()} />
              <box width={2} />
              <Card
                label="VERIFY JWT"
                value={f().verify_jwt != null ? (f().verify_jwt ? "enabled" : "disabled") : "—"}
                fg={f().verify_jwt ? COLORS.green : COLORS.red}
                width={cardW()}
              />
            </box>
            <box height={1} />
            <box flexDirection="row">
              <Card label="CREATED" value={fmtDate(f().created_at)} width={cardW()} />
              <box width={2} />
              <Card label="UPDATED" value={fmtDate(f().updated_at)} width={cardW()} />
            </box>
          </box>
        )}
      </Show>
    )
  }

  // ── Code ──────────────────────────────────────────────────────────────────
  function TabCode() {
    const lines = createMemo(() => (body() ?? "").split("\n"))
    const sc    = createMemo(() => scroll()["code"])
    const numW  = createMemo(() => String(lines().length).length)
    const codeW = createMemo(() => Math.max(1, props.width - numW() - 3))
    const vis   = createMemo(() => lines().slice(sc(), sc() + contentH()))

    return (
      <>
        <Show when={bodyLoad()}>
          <box paddingLeft={2} paddingTop={1}><text fg={COLORS.yellow}>loading code…</text></box>
        </Show>
        <Show when={!bodyLoad() && bodyErr()}>
          <box paddingLeft={2} paddingTop={1}><text fg={COLORS.red}>{bodyErr()}</text></box>
        </Show>
        <Show when={!bodyLoad() && !bodyErr() && body() === null}>
          <box paddingLeft={2} paddingTop={1}><text fg={COLORS.muted}>no source available</text></box>
        </Show>
        <Show when={!bodyLoad() && !bodyErr() && body() !== null}>
          <box flexDirection="column">
            <For each={vis()}>
              {(line, i) => (
                <box height={1} flexDirection="row">
                  <text fg={COLORS.overlay} width={numW() + 2}>
                    {String(sc() + i() + 1).padStart(numW()) + "  "}
                  </text>
                  <text fg={COLORS.text}>{trunc(line, codeW())}</text>
                </box>
              )}
            </For>
          </box>
        </Show>
      </>
    )
  }

  // ── Logs ──────────────────────────────────────────────────────────────────
  function TabLogs() {
    const sc    = createMemo(() => scroll()["logs"])
    const vis   = createMemo(() => logs().slice(sc(), sc() + contentH() - 1))
    const msgW  = createMemo(() => Math.max(10, props.width - 2 - 20 - 7 - 6))

    const lvlFg = (m: Record<string, unknown>) => {
      const lvl = String(m["level"] ?? "").toLowerCase()
      return lvl === "error" ? COLORS.red : lvl === "warn" ? COLORS.yellow : COLORS.subtext
    }
    const statusFg = (m: Record<string, unknown>) => {
      const s = Number(m["status"] ?? 0)
      return s >= 500 ? COLORS.red : s >= 400 ? COLORS.yellow : s > 0 ? COLORS.green : COLORS.muted
    }

    return (
      <>
        <Show when={logsLoad()}>
          <box paddingLeft={2} paddingTop={1}><text fg={COLORS.yellow}>loading logs…</text></box>
        </Show>
        <Show when={!logsLoad() && logsErr()}>
          <box paddingLeft={2} paddingTop={1}><text fg={COLORS.red}>{logsErr()}</text></box>
        </Show>
        <Show when={!logsLoad() && !logsErr() && logs().length === 0}>
          <box paddingLeft={2} paddingTop={1}><text fg={COLORS.muted}>no log entries found</text></box>
        </Show>
        <Show when={!logsLoad() && !logsErr() && logs().length > 0}>
          <box flexDirection="column">
            <box height={1} flexDirection="row" paddingLeft={1} backgroundColor={COLORS.surface}>
              <text fg={COLORS.muted} width={20}>TIMESTAMP</text>
              <text fg={COLORS.muted} width={7}>LEVEL</text>
              <text fg={COLORS.muted} width={6}>STATUS</text>
              <text fg={COLORS.muted}>MESSAGE</text>
            </box>
            <For each={vis()}>
              {(log) => {
                const m = (log.metadata ?? {}) as Record<string, unknown>
                return (
                  <box height={1} flexDirection="row" paddingLeft={1}>
                    <text fg={COLORS.muted}  width={20}>{trunc(fmtDate(log.timestamp), 19)}</text>
                    <text fg={lvlFg(m)}      width={7}>{trunc(String(m["level"] ?? "info"), 6)}</text>
                    <text fg={statusFg(m)}   width={6}>{m["status"] != null ? String(m["status"]) : "—"}</text>
                    <text fg={COLORS.text}>{trunc(log.event_message, msgW())}</text>
                  </box>
                )
              }}
            </For>
          </box>
        </Show>
      </>
    )
  }

  // ── Invocations ───────────────────────────────────────────────────────────
  function TabInvocations() {
    const s        = createMemo(() => stats())
    const totalInv = createMemo(() => s().reduce((a, d) => a + n(d.invocations), 0))
    const totalErr = createMemo(() => s().reduce((a, d) => a + n(d.errors), 0))
    const errRate  = createMemo(() => totalInv() > 0 ? ((totalErr() / totalInv()) * 100).toFixed(1) : "0.0")
    const chartW   = createMemo(() => Math.max(24, props.width - 6))
    const chart    = createMemo(() => buildChart(s(), chartW()))
    const colW     = createMemo(() => Math.max(1, Math.floor((chartW() - 1) / Math.max(1, s().length))))
    const maxV     = createMemo(() => Math.max(1, ...s().map(d => n(d.invocations))))
    const tableRows = createMemo(() =>
      [...s()].reverse().slice(0, Math.max(1, contentH() - CHART_H - 8))
    )

    return (
      <box flexDirection="column" paddingLeft={2} paddingTop={1}>
        <box height={1} flexDirection="row">
          <text fg={COLORS.subtext} attributes={1}>Last 24h  </text>
          <text fg={COLORS.teal} attributes={1}>{totalInv().toLocaleString()}</text>
          <text fg={COLORS.muted}> invocations  </text>
          <text fg={totalErr() > 0 ? COLORS.red : COLORS.muted} attributes={totalErr() > 0 ? 1 : 0}>
            {totalErr().toLocaleString()}
          </text>
          <text fg={COLORS.muted}> errors  </text>
          <text fg={totalErr() > 0 ? COLORS.peach : COLORS.muted}>{errRate()}%</text>
        </box>
        <box height={1} />

        <Show when={statsLoad()}><text fg={COLORS.yellow}>loading stats…</text></Show>
        <Show when={!statsLoad() && statsErr()}><text fg={COLORS.red}>{statsErr()}</text></Show>

        <Show when={!statsLoad() && !statsErr() && s().length === 0}>
          <text fg={COLORS.muted}>no invocation data available</text>
          <box height={1} />
          <text fg={COLORS.overlay}>analytics API may require different credentials,</text>
          <text fg={COLORS.overlay}>or this function has no recent invocations</text>
        </Show>

        <Show when={!statsLoad() && !statsErr() && s().length > 0}>
          <box flexDirection="column">
            <box height={1} paddingLeft={1}>
              <text fg={COLORS.muted}>{maxV().toLocaleString()}</text>
            </box>
            <For each={chart()}>
              {(row) => (
                <box height={1} flexDirection="row">
                  <For each={row}>
                    {(span) => <text fg={span.fg || COLORS.surface}>{span.text}</text>}
                  </For>
                </box>
              )}
            </For>
            <box height={1}>
              <text fg={COLORS.border}>{"─".repeat(chartW())}</text>
            </box>
            <box height={1} flexDirection="row">
              <For each={s()}>
                {(d, i) => (
                  <text fg={COLORS.muted} width={colW()}>
                    {i() % 3 === 0 ? fmtHour(d.hour).slice(0, 5) : ""}
                  </text>
                )}
              </For>
            </box>
            <box height={1} />
            <box height={1} flexDirection="row">
              <text fg={COLORS.teal}>█ </text>
              <text fg={COLORS.muted}>invocations  </text>
              <text fg={COLORS.red}>█ </text>
              <text fg={COLORS.muted}>hour with errors</text>
            </box>
            <box height={1} />
            <box height={1}><text fg={COLORS.subtext} attributes={1}>Hourly breakdown</text></box>
            <box height={1} flexDirection="row" backgroundColor={COLORS.surface} paddingLeft={1}>
              <text fg={COLORS.muted} width={10}>HOUR</text>
              <text fg={COLORS.muted} width={14}>INVOCATIONS</text>
              <text fg={COLORS.muted}>ERRORS</text>
            </box>
            <For each={tableRows()}>
              {(d) => (
                <box height={1} flexDirection="row" paddingLeft={1}>
                  <text fg={COLORS.subtext} width={10}>{fmtHour(d.hour)}</text>
                  <text fg={COLORS.text}     width={14}>{n(d.invocations).toLocaleString()}</text>
                  <text fg={n(d.errors) > 0 ? COLORS.red : COLORS.muted}>{n(d.errors).toLocaleString()}</text>
                </box>
              )}
            </For>
          </box>
        </Show>
      </box>
    )
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  function TabSettings() {
    return (
      <Show when={fn()}>
        {(f) => (
          <box flexDirection="column" paddingLeft={2} paddingTop={1}>
            <box flexDirection="row">
              <Card
                label="VERIFY JWT"
                value={f().verify_jwt != null ? (f().verify_jwt ? "enabled" : "disabled") : "not set"}
                sub={f().verify_jwt ? "requests require valid JWT" : "all requests allowed"}
                fg={f().verify_jwt ? COLORS.green : COLORS.yellow}
                width={cardW()}
              />
              <box width={2} />
              <Card
                label="IMPORT MAP"
                value={f().import_map_path ?? (f().import_map ? "inline" : "none")}
                width={cardW()}
              />
            </box>
            <box height={1} />
            <box flexDirection="row">
              <Card label="ENTRYPOINT"      value={f().entrypoint_path ?? "index.ts"} width={cardW()} />
              <box width={2} />
              <Card
                label="STATIC PATTERNS"
                value={f().static_patterns?.length > 0 ? f().static_patterns.join(", ") : "none"}
                width={cardW()}
              />
            </box>
            <box height={1} />
            <box flexDirection="column" backgroundColor={COLORS.surface} paddingLeft={2} paddingTop={1} paddingBottom={1}>
              <text fg={COLORS.muted}>FUNCTION ID</text>
              <box height={1} />
              <text fg={COLORS.text}>{f().id}</text>
            </box>
            <box height={1} />
            <box flexDirection="column" backgroundColor={COLORS.surface} paddingLeft={2} paddingTop={1} paddingBottom={1}>
              <text fg={COLORS.muted}>INVOKE URL</text>
              <box height={1} />
              <text fg={COLORS.blue}>{url()}</text>
            </box>
          </box>
        )}
      </Show>
    )
  }

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>

      {/* Header */}
      <box height={1} paddingLeft={1} flexDirection="row" backgroundColor={COLORS.overlay}>
        <text fg={COLORS.green} attributes={1}>function  </text>
        <text fg={COLORS.text}>{slug()}</text>
        <Show when={fnLoad() || bodyLoad() || logsLoad() || statsLoad()}>
          <text fg={COLORS.yellow}>  loading…</text>
        </Show>
        <text fg={COLORS.muted}>{"  ·  h/l tab  j/k scroll  y url  r refresh"}</text>
      </box>

      {/* Tab bar */}
      <box height={1} flexDirection="row" backgroundColor={COLORS.surface} paddingLeft={1}>
        <For each={TABS}>
          {(t) => {
            const active = () => t === tab()
            return (
              <box
                paddingLeft={1}
                paddingRight={2}
                backgroundColor={active() ? COLORS.overlay : COLORS.surface}
                onMouseUp={() => setTab(t)}
              >
                <text fg={active() ? COLORS.mauve : COLORS.muted} attributes={active() ? 1 : 0}>
                  {TAB_LABEL[t]}
                </text>
              </box>
            )
          }}
        </For>
      </box>

      <Show when={fnErr()}>
        <box paddingLeft={2} paddingTop={1} flexGrow={1}>
          <text fg={COLORS.red}>{fnErr()}</text>
        </box>
      </Show>

      <Show when={!fnErr()}>
        <box flexDirection="column" flexGrow={1} height={contentH()} overflow={"hidden" as any}>
          <Show when={tab() === "overview"}><TabOverview /></Show>
          <Show when={tab() === "code"}><TabCode /></Show>
          <Show when={tab() === "logs"}><TabLogs /></Show>
          <Show when={tab() === "invocations"}><TabInvocations /></Show>
          <Show when={tab() === "settings"}><TabSettings /></Show>
        </box>
      </Show>

    </box>
  )
}
