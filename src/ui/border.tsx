import type { JSX } from "@opentui/solid/jsx-runtime"
import { COLORS } from "./colors"

interface BoxProps {
  children: JSX.Element
  width?: number
  height?: number
  title?: string
  focused?: boolean
  flexDirection?: "row" | "column"
  flexGrow?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
}

/** A bordered box with optional title (like nvim window border) */
export function BorderBox(props: BoxProps) {
  const borderColor = () => (props.focused ? COLORS.blue : COLORS.border)

  return (
    <box
      flexDirection={props.flexDirection ?? "column"}
      flexGrow={props.flexGrow}
      width={props.width}
      height={props.height}
      border={["top", "bottom", "left", "right"] as any}
      borderColor={borderColor()}
      paddingLeft={props.paddingLeft ?? 1}
      paddingRight={props.paddingRight ?? 1}
      paddingTop={props.paddingTop ?? 0}
      paddingBottom={props.paddingBottom ?? 0}
    >
      {props.children}
    </box>
  )
}

/** A single horizontal separator line */
export function HRule(props: { width: number; color?: string }) {
  return (
    <box width={props.width} height={1} backgroundColor={props.color ?? COLORS.border} />
  )
}
