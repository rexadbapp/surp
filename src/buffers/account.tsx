import { Show } from "solid-js"
import type { BufferProps } from "./types"
import { useAuth } from "../context/auth"
import { CURRENT_VERSION } from "../version"
import { COLORS } from "../ui/colors"

export function AccountBuffer(props: BufferProps) {
  const auth = useAuth()

  return (
    <box
      flexDirection="column"
      width={props.width}
      height={props.height}
      backgroundColor={COLORS.background}
    >
      <box flexDirection="column" paddingLeft={2} paddingTop={1} width={props.width - 4}>
        {/* Header */}
        <box paddingBottom={1}>
          <text fg={COLORS.mauve} attributes={1}>surp — About</text>
        </box>

        {/* Version */}
        <box paddingBottom={1}>
          <text fg={COLORS.subtext}>Version: </text>
          <text fg={COLORS.text}>{CURRENT_VERSION}</text>
        </box>

        {/* Supabase auth status */}
        <box paddingBottom={1}>
          <text fg={COLORS.subtext}>Supabase: </text>
          <text fg={auth.isLoggedIn() ? COLORS.green : COLORS.yellow}>
            {auth.isLoggedIn() ? "Connected" : "Not logged in"}
          </text>
        </box>

        {/* Actions */}
        <box paddingTop={1} flexDirection="column">
          <Show when={!auth.isLoggedIn()}>
            <text fg={COLORS.muted}>· :login        — Authenticate with Supabase</text>
          </Show>
          <Show when={auth.isLoggedIn()}>
            <text fg={COLORS.muted}>· :logout       — Logout from Supabase</text>
          </Show>
          <text fg={COLORS.muted}>· :update       — Check for and apply updates</text>
          <text fg={COLORS.muted}>· :check-update — Show whether a newer version is available</text>
        </box>
      </box>
    </box>
  )
}
