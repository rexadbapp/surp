import { createMemo, For, Show } from "solid-js"
import { useBuffers } from "../context/buffers"
import { useConnection } from "../context/connection"
import { renderBuffer } from "../buffers/registry"
import { COLORS } from "../ui/colors"

const LOGO = [
  "███████╗██╗   ██╗██████╗ ██████╗ ",
  "██╔════╝██║   ██║██╔══██╗██╔══██╗",
  "███████╗██║   ██║██████╔╝██████╔╝",
  "╚════██║██║   ██║██╔══██╗██╔═══╝ ",
  "███████║╚██████╔╝██║  ██║██║     ",
  "╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ",
]

const OPEN: Array<{ key: string; desc: string }> = [
  { key: ":login   ", desc: "Authenticate" },
  { key: ":projects", desc: "Browse projects" },
  { key: ":tables  ", desc: "List tables" },
  { key: ":lint    ", desc: "Run DB linter" },
  { key: ":help    ", desc: "All commands" },
]

const NAV: Array<{ key: string; desc: string }> = [
  { key: "space e  ", desc: "Explorer" },
  { key: "H / L    ", desc: "Switch tabs" },
  { key: "ctrl+w   ", desc: "Pane splits" },
  { key: ":        ", desc: "Command palette" },
]

function Splash(props: { width: number; height: number }) {
  return (
    <box
      flexDirection="column"
      width={props.width}
      height={props.height}
      backgroundColor={COLORS.background}
      alignItems="center"
      justifyContent="center"
    >
      {/* ASCII logo */}
      <box flexDirection="column" alignItems="center" paddingBottom={1}>
        <For each={LOGO}>
          {(line) => <box><text fg={COLORS.mauve} attributes={1}>{line}</text></box>}
        </For>
      </box>

      {/* Subtitle */}
      <box paddingBottom={2} alignItems="center">
        <text fg={COLORS.subtext}>nvim-style Supabase client</text>
      </box>

      {/* Two-column shortcuts */}
      <box flexDirection="row">
        {/* Open */}
        <box flexDirection="column" paddingRight={6}>
          <box paddingBottom={1}>
            <text fg={COLORS.blue} attributes={1}> Open</text>
          </box>
          <For each={OPEN}>
            {(item) => (
              <box flexDirection="row">
                <text fg={COLORS.yellow}> {item.key}  </text>
                <text fg={COLORS.muted}>{item.desc}</text>
              </box>
            )}
          </For>
        </box>

        {/* Navigate */}
        <box flexDirection="column">
          <box paddingBottom={1}>
            <text fg={COLORS.blue} attributes={1}> Navigate</text>
          </box>
          <For each={NAV}>
            {(item) => (
              <box flexDirection="row">
                <text fg={COLORS.yellow}> {item.key}  </text>
                <text fg={COLORS.muted}>{item.desc}</text>
              </box>
            )}
          </For>
        </box>
      </box>
    </box>
  )
}

interface PaneProps {
  bufferId: string | null
  focused: boolean
  width: number
  height: number
}

/**
 * Tab-less placeholder shown when a connection is live but no buffer is open.
 * Not a real buffer — it never appears in the tab line.
 */
function EmptyExplorerPrompt(props: { width: number; height: number }) {
  return (
    <box
      flexDirection="column"
      width={props.width}
      height={props.height}
      backgroundColor={COLORS.background}
      alignItems="center"
      justifyContent="center"
    >
      <box height={1}>
        <text fg={COLORS.subtext}>← pick a table from the explorer</text>
      </box>
      <box height={1} />
      <box height={1} flexDirection="row">
        <text fg={COLORS.muted}>:sql editor  ·  n new connection  ·  u paste url  ·  :help</text>
      </box>
    </box>
  )
}

export function Pane(props: PaneProps) {
  const buffers = useBuffers()
  const connCtx = useConnection()

  const meta = createMemo(() => {
    if (!props.bufferId) return null
    return buffers.list.find((b) => b.id === props.bufferId) ?? null
  })

  return (
    <Show
      when={meta()}
      fallback={
        <Show
          when={connCtx.active()}
          fallback={<Splash width={props.width} height={props.height} />}
        >
          <EmptyExplorerPrompt width={props.width} height={props.height} />
        </Show>
      }
    >
      {(m) => (
        <box
          flexDirection="column"
          width={props.width}
          height={props.height}
          flexGrow={1}
          backgroundColor={COLORS.background}
        >
          {renderBuffer({
            meta: m(),
            focused: props.focused,
            width: props.width,
            height: props.height,
          })}
        </box>
      )}
    </Show>
  )
}
