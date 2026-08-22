import { createMemo, For, Show } from "solid-js"
import { useBuffers } from "../context/buffers"
import { COLORS } from "./colors"
import { hoverProps, isHovered } from "./hover"

const MAX_NAME = 18
const PAD      = 2   // paddingLeft + paddingRight per tab
const ARROW_W  = 2   // width of ◀ / ▶ indicator

interface TabLineProps { width: number }

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}

export function TabLine(props: TabLineProps) {
  const buffers = useBuffers()

  const tabs = createMemo(() => buffers.list.map((buf) => {
    const label = (buf.modified ? "● " : "") + buf.title
    const name  = truncate(label, MAX_NAME)
    return { ...buf, name, tabW: name.length + PAD }
  }))

  const activeIdx = createMemo(() => {
    const id = buffers.active()
    const idx = tabs().findIndex((t) => t.id === id)
    return idx < 0 ? 0 : idx
  })

  const window = createMemo(() => {
    const list = tabs()
    const n    = list.length
    if (!n) return { start: 0, end: 0, overLeft: false, overRight: false }

    const totalW = list.reduce((s, t) => s + t.tabW, 0)
    if (totalW <= props.width) {
      return { start: 0, end: n, overLeft: false, overRight: false }
    }

    const ai  = activeIdx()
    let lo    = ai
    let hi    = ai
    let used  = list[ai].tabW

    while (true) {
      // Arrow cost depends on whether edges are reached
      const arrowL = (l: number) => l > 0     ? ARROW_W : 0
      const arrowR = (h: number) => h < n - 1 ? ARROW_W : 0

      const canLeft = lo > 0 && (() => {
        const cost = used + list[lo - 1].tabW + arrowL(lo - 1) + arrowR(hi)
        return cost <= props.width
      })()

      const canRight = hi < n - 1 && (() => {
        const cost = used + list[hi + 1].tabW + arrowL(lo) + arrowR(hi + 1)
        return cost <= props.width
      })()

      if (!canLeft && !canRight) break

      // Expand toward the side that currently has fewer tabs (keep active centered)
      const leftCount  = ai - lo
      const rightCount = hi - ai
      if (canLeft && (!canRight || leftCount <= rightCount)) {
        lo--
        used += list[lo].tabW
      } else {
        hi++
        used += list[hi].tabW
      }
    }

    return { start: lo, end: hi + 1, overLeft: lo > 0, overRight: hi < n - 1 }
  })

  const visible = createMemo(() => tabs().slice(window().start, window().end))

  return (
    <box flexDirection="row" width={props.width} height={1} backgroundColor={COLORS.surface}>

      <Show when={window().overLeft}>
        <box width={ARROW_W} height={1} backgroundColor={COLORS.surface}>
          <text fg={COLORS.muted}>◀ </text>
        </box>
      </Show>

      <For each={visible()}>
        {(buf) => {
          const isActive = () => buffers.active() === buf.id
          const hovered  = () => isHovered(`tab-${buf.id}`)
          return (
            <box
              width={buf.tabW}
              height={1}
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={isActive() ? COLORS.background : hovered() ? COLORS.overlay : COLORS.surface}
              {...hoverProps(`tab-${buf.id}`, `Switch to ${buf.title}`)}
              onMouseUp={() => buffers.focus(buf.id)}
            >
              <text fg={isActive() ? COLORS.text : COLORS.subtext} attributes={isActive() || hovered() ? 1 : 0}>
                {buf.name}
              </text>
            </box>
          )
        }}
      </For>

      <Show when={window().overRight}>
        <box width={ARROW_W} height={1} backgroundColor={COLORS.surface}>
          <text fg={COLORS.muted}> ▶</text>
        </box>
      </Show>

      <box flexGrow={1} backgroundColor={COLORS.surface} />
    </box>
  )
}
