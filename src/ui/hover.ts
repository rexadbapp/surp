import { createSignal } from "solid-js"

/**
 * Global hover state + tooltip registry, driven by terminal mouse-motion
 * events (OpenTUI delivers "over"/"out" per renderable).
 *
 * Tooltips: pass text as the second arg to hoverProps() and mount
 * <TooltipLayer/> once near the app root — it shows the tip after a
 * 2-second dwell and positions it at the pointer.
 */

export interface HoverPos {
  x: number
  y: number
}

const [hoveredId, setHoveredId] = createSignal<string | null>(null)
const [hoverPos, setHoverPos] = createSignal<HoverPos | null>(null)

export { hoveredId, setHoveredId, hoverPos, setHoverPos }

export function isHovered(id: string): boolean {
  return hoveredId() === id
}

/** Drop all hover state — used when the UI context changes (tab switch, …)
 *  so tooltips/highlights can't leak across views. */
export function clearHover(): void {
  setHoveredId(null)
  setHoverPos(null)
}

/** id → tooltip text */
const tooltipRegistry = new Map<string, string>()

export function getTooltip(id: string): string | undefined {
  return tooltipRegistry.get(id)
}

export interface HoverHandlers {
  onMouse: (e: { type?: string; x?: number; y?: number }) => void
}

/**
 * Spread onto any renderable to make it hover-aware, optionally with a
 * tooltip shown after dwelling ~2s:
 *
 *   <box {...hoverProps("dash-card-0", "Connect to prod")} onMouseUp={select} ...>
 *
 * Only wires mouse events; merge existing onMouseUp/onMouseScroll explicitly.
 */
export function hoverProps(id: string, tooltip?: string): HoverHandlers {
  if (tooltip != null) tooltipRegistry.set(id, tooltip)
  return {
    onMouse: (e) => {
      const type = e?.type
      if (type === "over" || type === "move") {
        setHoveredId(id)
        if (typeof e?.x === "number" && typeof e?.y === "number") {
          setHoverPos({ x: e.x, y: e.y })
        }
      } else if (type === "out") {
        if (hoveredId() === id) {
          setHoveredId(null)
          setHoverPos(null)
        }
      }
    },
  }
}
