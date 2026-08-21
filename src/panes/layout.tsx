import { createSignal, createMemo, Show } from "solid-js"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import type { MouseEvent } from "@opentui/core"
import { Pane } from "./pane"
import { Sidebar } from "./sidebar"
import { TabLine } from "../ui/tabline"

interface LayoutProps {
  width: number
  height: number
}

type SplitDir = "vertical" | "horizontal"
interface Split { dir: SplitDir; ratio: number }

const MIN_SIDEBAR_W = 16
const MAX_SIDEBAR_W = 60

export function Layout(props: LayoutProps) {
  const buffers = useBuffers()
  const keymap = useKeymap()
  const [split, setSplit] = createSignal<Split | null>(null)
  const [focusedPane, setFocusedPane] = createSignal<0 | 1>(0)
  const [secondBuf, setSecondBuf] = createSignal<string | null>(null)
  const [showSidebar, setShowSidebar] = createSignal(false)
  const [sidebarFocused, setSidebarFocused] = createSignal(false)
  const [sidebarW, setSidebarW] = createSignal(28)
  let isResizing = false

  // Derive current project from any open buffer that has one
  const currentProject = createMemo(() => {
    const active = buffers.activeBuffer()
    if (active?.data?.["project"]) {
      return { ref: active.data["project"], name: active.data["projectName"] ?? active.data["project"] }
    }
    const any = buffers.list.find((b) => b.data?.["project"])
    if (any?.data?.["project"]) {
      return { ref: any.data["project"], name: any.data["projectName"] ?? any.data["project"] }
    }
    return null
  })

  keymap.onAction("toggle_sidebar", () => {
    if (!showSidebar()) {
      setShowSidebar(true)
      setSidebarFocused(true)
    } else if (sidebarFocused()) {
      setShowSidebar(false)
      setSidebarFocused(false)
    } else {
      setSidebarFocused(true)
    }
  })

  keymap.onAction("vsplit", () => {
    setSplit({ dir: "vertical", ratio: 0.5 })
    setSecondBuf(buffers.open("projects"))
    setFocusedPane(1)
  })
  keymap.onAction("split", () => {
    setSplit({ dir: "horizontal", ratio: 0.5 })
    setSecondBuf(buffers.open("projects"))
    setFocusedPane(1)
  })
  keymap.onAction("close_pane", () => {
    if (!split()) return
    const b = secondBuf()
    if (b) buffers.close(b)
    setSplit(null); setSecondBuf(null); setFocusedPane(0)
  })
  keymap.onAction("pane_left", () => {
    if (showSidebar() && !sidebarFocused()) { setSidebarFocused(true); return }
    if (split()?.dir === "vertical") setFocusedPane(0)
    else buffers.prevBuffer()
  })
  keymap.onAction("pane_right", () => {
    if (showSidebar() && sidebarFocused()) { setSidebarFocused(false); return }
    if (split()?.dir === "vertical") setFocusedPane(1)
    else buffers.nextBuffer()
  })
  keymap.onAction("pane_up", () => { if (split()?.dir === "horizontal") setFocusedPane(0) })
  keymap.onAction("pane_down", () => { if (split()?.dir === "horizontal") setFocusedPane(1) })

  const mainFocused = createMemo(() => !sidebarFocused())
  const mainWidth = createMemo(() => showSidebar() ? props.width - sidebarW() - 1 : props.width)

  const firstBufId = createMemo(() => {
    const all = buffers.list.filter((b) => b.id !== secondBuf())
    if (focusedPane() === 0) return buffers.active()
    return all.at(-1)?.id ?? null
  })

  // TabLine occupies 1 row; panes get the rest
  const paneHeight = createMemo(() => Math.max(1, props.height - 1))

  function renderPanes() {
    const s = split()
    const h = paneHeight()
    const w = mainWidth()
    if (!s) {
      return <Pane bufferId={buffers.active()} focused={mainFocused()} width={w} height={h} />
    }
    if (s.dir === "vertical") {
      const w1 = Math.floor(w * s.ratio)
      return (
        <box flexDirection="row" width={w} height={h}>
          <Pane bufferId={firstBufId()} focused={mainFocused() && focusedPane() === 0} width={w1} height={h} />
          <Pane bufferId={secondBuf()} focused={mainFocused() && focusedPane() === 1} width={w - w1} height={h} />
        </box>
      )
    }
    const h1 = Math.floor(h * s.ratio)
    return (
      <box flexDirection="column" width={w} height={h}>
        <Pane bufferId={firstBufId()} focused={mainFocused() && focusedPane() === 0} width={w} height={h1} />
        <Pane bufferId={secondBuf()} focused={mainFocused() && focusedPane() === 1} width={w} height={h - h1} />
      </box>
    )
  }

  function onLayoutMouse(e: MouseEvent) {
    if (e.type === "up") { isResizing = false; return }
    if (!isResizing) return
    if (e.type === "drag" || e.type === "move") {
      setSidebarW(Math.max(MIN_SIDEBAR_W, Math.min(MAX_SIDEBAR_W, e.x)))
    }
  }

  return (
    <box flexDirection="row" width={props.width} height={props.height} onMouse={onLayoutMouse}>
      <Show when={showSidebar()}>
        <Sidebar
          projectRef={currentProject()?.ref ?? null}
          projectName={currentProject()?.name ?? "Explorer"}
          width={sidebarW()}
          height={props.height}
          focused={sidebarFocused()}
          onClose={() => setSidebarFocused(false)}
          activeBufferType={buffers.activeBuffer()?.type ?? null}
        />
        {/* Resize handle — mousedown here starts resize, tracked at layout level */}
        <box
          width={1}
          height={props.height}
          onMouseDown={() => { isResizing = true }}
        />
      </Show>
      <box flexDirection="column" width={mainWidth()} height={props.height}>
        <TabLine width={mainWidth()} />
        {renderPanes()}
      </box>
    </box>
  )
}

import { COLORS } from "../ui/colors"
