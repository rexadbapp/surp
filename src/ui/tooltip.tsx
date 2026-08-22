import { createEffect, createSignal, Show, onCleanup } from "solid-js"
import { hoveredId, hoverPos, getTooltip } from "./hover"
import { COLORS } from "./colors"

const DWELL_MS = 2000

/**
 * Floating tooltip shown after hovering a registered element for ~2s.
 * Mount ONCE near the app root, above all content:
 *
 *   <TooltipLayer width={w} height={h} />
 */
export function TooltipLayer(props: { width: number; height: number }) {
  const [visible, setVisible] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = null }
  }

  createEffect(() => {
    const id = hoveredId()
    setVisible(false)
    clearTimer()
    if (!id) return
    const text = getTooltip(id)
    if (!text) return
    timer = setTimeout(() => setVisible(true), DWELL_MS)
  })
  onCleanup(clearTimer)

  // pointer position at show time (kept stable while visible)
  const pos = () => {
    if (visible()) {
      const p = hoverPos()
      if (p) return p
    }
    return null
  }

  const TIP_W = (text: string) => Math.min(60, text.length + 2)

  return (
    <Show when={visible() && pos()}>
      {(p) => {
        const text = getTooltip(hoveredId()!) ?? ""
        const w = TIP_W(text)
        // place below-right of the pointer, clamped to the viewport
        const x = Math.max(0, Math.min(props.width - w, p().x + 1))
        const y = Math.max(0, Math.min(props.height - 1, p().y + 1))
        return (
          <box
            position="absolute"
            left={x}
            top={y}
            width={w}
            height={1}
            backgroundColor={COLORS.mauve}
            paddingLeft={1}
          >
            <text fg={COLORS.background} attributes={1}>{text}</text>
          </box>
        )
      }}
    </Show>
  )
}
