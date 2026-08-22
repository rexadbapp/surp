import { createSignal, createEffect, createMemo, For, Show, onMount, onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import { useConnection } from "../context/connection"
import { useKeymap } from "../context/keymap"
import { useMode } from "../context/mode"
import { useYank } from "../context/yank"
import { lintProject, type LintIssue } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"
import { hoverProps, isHovered } from "../ui/hover"

const issueCache = new Map<string, LintIssue[]>()

type Filter = "ALL" | "ERROR" | "WARN" | "INFO"
const FILTERS: Filter[] = ["ALL", "ERROR", "WARN", "INFO"]

const LEVEL_COLOR: Record<string, string> = {
  ERROR: COLORS.red,
  WARN:  COLORS.yellow,
  INFO:  COLORS.blue,
}

const LEVEL_BADGE: Record<string, string> = {
  ERROR: "ERR",
  WARN:  "WRN",
  INFO:  "INF",
}

function wrap(text: string, width: number): string[] {
  if (!text) return []
  const words = text.split(" ")
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    if (!cur) { cur = w; continue }
    if ((cur + " " + w).length <= width) { cur += " " + w }
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines
}

export function LintBuffer(props: BufferProps) {
  const connCtx = useConnection()
  const keymap = useKeymap()
  const yank   = useYank()
  const mode   = useMode()
  const renderer = useRenderer()

  const [issues,  setIssues]  = createSignal<LintIssue[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error,   setError]   = createSignal<string | null>(null)
  const [filter,  setFilter]  = createSignal<Filter>("ALL")
  const [cursor,  setCursor]  = createSignal(0)
  const [loadedFor, setLoadedFor] = createSignal<string | null>(null)

  const projectRef = () => String(props.meta.data?.["project"] ?? "")

  async function load(force = false) {
    const conn = connCtx.active()
    if (!conn) { setError("No database connected — use :connect"); return }
    setLoadedFor(conn.id)
    if (!force) {
      const cached = issueCache.get(conn.id)
      if (cached) { setIssues(cached); return }
    }
    setLoading(true); setError(null)
    try {
      const data = await lintProject(conn.driver, conn.supabase ? { supabase: conn.supabase } : undefined)
      issueCache.set(conn.id, data)
      setIssues(data)
      setCursor(0)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => { void load() })

  createEffect(() => {
    const connId = connCtx.active()?.id ?? null
    if (connId && connId !== loadedFor()) void load(true)
  })

  const filtered = createMemo(() => {
    const f = filter()
    if (f === "ALL") return issues()
    return issues().filter(i => i.level === f)
  })

  const counts = createMemo(() => ({
    ALL:   issues().length,
    ERROR: issues().filter(i => i.level === "ERROR").length,
    WARN:  issues().filter(i => i.level === "WARN").length,
    INFO:  issues().filter(i => i.level === "INFO").length,
  }))

  const selected = createMemo(() => filtered()[cursor()] ?? null)

  // Layout
  const listH    = createMemo(() => Math.max(3, Math.floor((props.height - 4) * 0.55)))
  const detailH  = createMemo(() => Math.max(2, props.height - 4 - listH()))
  const visItems = createMemo(() => {
    const n = listH()
    const c = cursor()
    const list = filtered()
    const start = Math.max(0, Math.min(c - Math.floor(n / 2), list.length - n))
    return { start, items: list.slice(start, start + n) }
  })

  function move(delta: number) {
    if (!props.focused) return
    const max = Math.max(0, filtered().length - 1)
    setCursor(c => Math.max(0, Math.min(c + delta, max)))
  }

  function cycleFilter(dir: 1 | -1) {
    if (!props.focused) return
    const idx = FILTERS.indexOf(filter())
    const next = (idx + dir + FILTERS.length) % FILTERS.length
    setFilter(FILTERS[next]!)
    setCursor(0)
  }

  keymap.onAction("move_down",   () => move(1))
  keymap.onAction("move_up",     () => move(-1))
  keymap.onAction("scroll_down", () => move(Math.floor(listH() / 2)))
  keymap.onAction("scroll_up",   () => move(-Math.floor(listH() / 2)))
  keymap.onAction("go_top",      () => { if (props.focused) setCursor(0) })
  keymap.onAction("go_bottom",   () => { if (props.focused) setCursor(Math.max(0, filtered().length - 1)) })
  keymap.onAction("refresh",     () => { if (props.focused) void load(true) })
  keymap.onAction("yank", () => {
    if (!props.focused) return
    const s = selected()
    if (!s) return
    const obj = s.metadata?.["schema"] && s.metadata?.["name"]
      ? `${s.metadata["schema"]}.${s.metadata["name"]}`
      : s.metadata?.["name"] ? String(s.metadata["name"]) : ""
    yank.yank(obj || s.name, s.title)
  })
  keymap.onAction("yank_row", () => {
    if (!props.focused) return
    const s = selected()
    if (!s) return
    const parts = [s.title]
    if (s.description) parts.push(s.description)
    if (s.detail) parts.push(s.detail)
    if (s.remediation) parts.push(`Remediation: ${s.remediation}`)
    yank.yank(parts.join("\n\n"), s.level)
  })

  onMount(() => {
    const kh = renderer.keyInput
    function onKey(e: KeyEvent) {
      if (!props.focused || !mode.is("normal")) return
      if ((e.name === "tab" || e.name === "f") && !e.ctrl && !e.meta) cycleFilter(1)
      if (e.name === "F" && !e.ctrl && !e.meta) cycleFilter(-1)
    }
    kh.on("keypress", onKey)
    onCleanup(() => kh.off("keypress", onKey))
  })

  function renderDetail(issue: LintIssue) {
    const w = props.width - 4
    const descLines  = wrap(issue.description, w)
    const detailLines = issue.detail ? wrap(issue.detail, w) : []
    const remLines   = issue.remediation ? wrap(issue.remediation, w) : []
    const obj = issue.metadata?.["schema"] && issue.metadata?.["name"]
      ? `${issue.metadata["schema"]}.${issue.metadata["name"]}`
      : issue.metadata?.["name"] ? String(issue.metadata["name"]) : ""

    return (
      <box flexDirection="column" width={props.width} paddingLeft={2} paddingTop={1}>
        <box flexDirection="row" height={1}>
          <text fg={LEVEL_COLOR[issue.level] ?? COLORS.text} attributes={1}>
            [{LEVEL_BADGE[issue.level] ?? issue.level}]{"  "}
          </text>
          <text fg={COLORS.text} attributes={1}>{issue.title}</text>
          <Show when={obj}>
            <text fg={COLORS.muted}>{"  "}{obj}</text>
          </Show>
        </box>
        <Show when={issue.categories?.length}>
          <box height={1} paddingTop={0}>
            <text fg={COLORS.teal}>{issue.categories.join(" · ")}</text>
          </box>
        </Show>
        <For each={descLines}>
          {(line) => <box height={1}><text fg={COLORS.subtext}>{line}</text></box>}
        </For>
        <Show when={detailLines.length > 0}>
          <box height={1}><text fg={COLORS.muted}> </text></box>
          <For each={detailLines}>
            {(line) => <box height={1}><text fg={COLORS.text}>{line}</text></box>}
          </For>
        </Show>
        <Show when={remLines.length > 0}>
          <box height={1}><text fg={COLORS.muted}> </text></box>
          <box height={1}><text fg={COLORS.green} attributes={1}>Remediation</text></box>
          <For each={remLines}>
            {(line) => <box height={1}><text fg={COLORS.subtext}>{line}</text></box>}
          </For>
        </Show>
      </box>
    )
  }

  function detailHint(issue: LintIssue): string {
    const m = issue.metadata
    // unindexed_foreign_keys has fkey_name directly in metadata
    if (m?.["fkey_name"]) return String(m["fkey_name"])
    const d = issue.detail
    if (!d) return ""
    // auth_rls_initplan: "...policy `policy_name` that..."
    let hit = d.match(/policy `([^`]+)`/)
    if (hit) return hit[1]!
    // multiple_permissive_policies: "...for role `role` for action `cmd`..."
    hit = d.match(/for role `([^`]+)` for action `([^`]+)`/)
    if (hit) return `${hit[1]} · ${hit[2]}`
    // unused_index: "Index `index_name` on table..."
    hit = d.match(/^Index `([^`]+)`/)
    if (hit) return hit[1]!
    return ""
  }

  const BADGE_W = 6
  const NAME_W  = createMemo(() => Math.floor((props.width - BADGE_W - 4) * 0.55))
  const OBJ_W   = createMemo(() => props.width - BADGE_W - 4 - NAME_W())

  function trunc(s: string, w: number) { return s.length <= w ? s : s.slice(0, w - 1) + "…" }

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>

      {/* Header */}
      <box height={1} paddingLeft={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.mauve} attributes={1}>Lint  </text>
        <text fg={COLORS.blue}>{projectRef() || connCtx.active()?.label || "no connection"}  </text>
        <Show when={loading()}>
          <text fg={COLORS.yellow}>running…</text>
        </Show>
        <Show when={!loading() && !error()}>
          <text fg={COLORS.muted}>
            {counts().ALL} issue{counts().ALL !== 1 ? "s" : ""}
            {counts().ERROR > 0 ? `  ${counts().ERROR} err` : ""}
            {counts().WARN  > 0 ? `  ${counts().WARN} warn` : ""}
            {counts().INFO  > 0 ? `  ${counts().INFO} info` : ""}
            {"  ·  r:refresh  f/tab:filter"}
          </text>
        </Show>
      </box>

      {/* Filter tabs */}
      <box height={1} backgroundColor={COLORS.surface} flexDirection="row" paddingLeft={1}>
        <For each={FILTERS}>
          {(f) => (
            <box
              height={1}
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={filter() === f ? COLORS.overlay : COLORS.surface}
            >
              <text fg={filter() === f ? COLORS.text : COLORS.muted} attributes={filter() === f ? 1 : 0}>
                {f}({counts()[f]}){"  "}
              </text>
            </box>
          )}
        </For>
      </box>

      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.red}>{error()}</text>
        </box>
      </Show>

      <Show when={!error()}>
        {/* Issue list */}
        <box flexDirection="column" height={listH()}>
          <For each={visItems().items}>
            {(issue, vi) => {
              const absIdx = () => vi() + visItems().start
              const active = () => props.focused && absIdx() === cursor()
              const hovered = () => isHovered(`lint-row-${props.meta.id}-${absIdx()}`)
              const obj = () => {
                const hint = detailHint(issue)
                if (hint) return hint
                const m = issue.metadata
                if (m?.["schema"] && m?.["name"]) return `${m["schema"]}.${m["name"]}`
                if (m?.["name"]) return String(m["name"])
                return ""
              }
              return (
                <box
                  flexDirection="row"
                  height={1}
                  backgroundColor={active() ? COLORS.overlay : hovered() ? COLORS.surface : COLORS.background}
                  {...hoverProps(`lint-row-${props.meta.id}-${absIdx()}`, issue.title)}
                  onMouseUp={() => setCursor(absIdx())}
                >
                  <text fg={COLORS.muted} width={2}>{active() ? "▶ " : "  "}</text>
                  <text
                    fg={LEVEL_COLOR[issue.level] ?? COLORS.text}
                    attributes={1}
                    width={BADGE_W}
                  >
                    {LEVEL_BADGE[issue.level] ?? issue.level}{"  "}
                  </text>
                  <text
                    fg={active() ? COLORS.text : COLORS.subtext}
                    width={NAME_W()}
                  >
                    {trunc(issue.name, NAME_W())}
                  </text>
                  <text fg={COLORS.muted} width={OBJ_W()}>
                    {trunc(obj(), OBJ_W())}
                  </text>
                </box>
              )
            }}
          </For>
        </box>

        {/* Detail pane separator */}
        <box height={1} backgroundColor={COLORS.surface} paddingLeft={1}>
          <Show when={selected()} fallback={<text fg={COLORS.muted}>no selection</text>}>
            {(s) => <text fg={COLORS.muted}>{s().title}</text>}
          </Show>
        </box>

        {/* Detail pane */}
        <box height={detailH()} overflow={"hidden" as any}>
          <Show when={selected()} fallback={
            <Show when={loading()}>
              <box paddingLeft={2} paddingTop={1}><text fg={COLORS.yellow}>loading…</text></box>
            </Show>
          }>
            {(s) => renderDetail(s())}
          </Show>
        </box>
      </Show>

      {/* Footer */}
      <box height={1} backgroundColor={COLORS.surface} paddingLeft={1}>
        <text fg={COLORS.muted}>
          {filtered().length > 0
            ? `${cursor() + 1}/${filtered().length}  ·  j/k: navigate  ·  f/tab: filter  ·  r: refresh`
            : "no issues"}
        </text>
      </box>

    </box>
  )
}
