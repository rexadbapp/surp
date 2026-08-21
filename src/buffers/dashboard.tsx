import { createSignal, createMemo, For, Show } from "solid-js"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

// ── ASCII art logo ────────────────────────────────────────────────────────────
// "SURP" in ANSI-shadow figlet style
const LOGO = [
  "███████╗██╗   ██╗██████╗ ██████╗ ",
  "██╔════╝██║   ██║██╔══██╗██╔══██╗",
  "███████╗██║   ██║██████╔╝██████╔╝",
  "╚════██║██║   ██║██╔══██╗██╔═══╝ ",
  "███████║╚██████╔╝██║  ██║██║     ",
  "╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ",
]
const LOGO_W = 34
const SUBTITLE = "supabase tui  ·  manage your projects from the terminal"

// ── Menu items ────────────────────────────────────────────────────────────────
type ItemId = "projects" | "sql" | "schema" | "lint" | "logs" | "functions" | "help" | "quit"

interface Item {
  id:    ItemId
  icon:  string
  label: string
  cmd:   string
}

const ITEMS: Item[] = [
  { id: "projects",  icon: "◉", label: "Projects",    cmd: ":projects"  },
  { id: "sql",       icon: "ƛ", label: "SQL Editor",  cmd: ":sql"       },
  { id: "schema",    icon: "◈", label: "Schema ERD",  cmd: ":schema"    },
  { id: "lint",      icon: "◎", label: "Lint",        cmd: ":lint"      },
  { id: "logs",      icon: "☰", label: "Logs",        cmd: ":logs"      },
  { id: "functions", icon: "ƒ", label: "Functions",   cmd: ":functions" },
  { id: "help",      icon: "ⓘ", label: "Help",        cmd: ":help"      },
  { id: "quit",      icon: "⏻", label: "Quit",        cmd: ":quit"      },
]

// ITEM_W: "  icon  label               cmd"
//          23 1 2 label_w=18  spaces 4  cmd_w=12
const LABEL_W = 18
const CMD_W   = 12
const ITEM_W  = 2 + 1 + 2 + LABEL_W + 4 + CMD_W   // 41

// ── Component ─────────────────────────────────────────────────────────────────
export function DashboardBuffer(props: BufferProps) {
  const buffers = useBuffers()
  const keymap  = useKeymap()

  const [cursor, setCursor] = createSignal(0)

  function openItem(item: Item) {
    switch (item.id) {
      case "projects":  buffers.open("projects"); break
      case "sql":       buffers.open("sql"); break
      case "schema":    buffers.open("schema"); break
      case "lint":      buffers.open("lint"); break
      case "logs":      buffers.open("logs"); break
      case "functions": buffers.open("functions"); break
      case "help":      buffers.open("help"); break
      case "quit":      process.exit(0); break
    }
  }

  keymap.onAction("move_up",   () => { if (props.focused) setCursor(c => Math.max(0, c - 1)) })
  keymap.onAction("move_down", () => { if (props.focused) setCursor(c => Math.min(ITEMS.length - 1, c + 1)) })
  keymap.onAction("select",    () => { if (props.focused) openItem(ITEMS[cursor()]!) })
  keymap.onAction("go_top",    () => { if (props.focused) setCursor(0) })
  keymap.onAction("go_bottom", () => { if (props.focused) setCursor(ITEMS.length - 1) })

  // Centering
  const logoPad  = createMemo(() => Math.max(0, Math.floor((props.width - LOGO_W) / 2)))
  const subPad   = createMemo(() => Math.max(0, Math.floor((props.width - SUBTITLE.length) / 2)))
  const itemPad  = createMemo(() => Math.max(0, Math.floor((props.width - ITEM_W) / 2)))
  const footPad  = createMemo(() => Math.max(0, Math.floor((props.width - 50) / 2)))

  // Vertical centering
  // LOGO(6) + subline(1) + gap(1) + items(ITEMS*2-1=13) + gap(1) + footer(1) = 23 rows
  const CONTENT_H = LOGO.length + 2 + (ITEMS.length * 2 - 1) + 2 + 1
  const topPad = createMemo(() => Math.max(0, Math.floor((props.height - CONTENT_H) / 2)))

  return (
    <box flexDirection="column" width={props.width} height={props.height} backgroundColor={COLORS.background}>

      {/* Top padding for vertical centering */}
      <box height={topPad()} />

      {/* Logo */}
      <For each={LOGO}>
        {(line) => (
          <box height={1} paddingLeft={logoPad()}>
            <text fg={COLORS.lavender}>{line}</text>
          </box>
        )}
      </For>

      {/* Subtitle */}
      <box height={1} />
      <box height={1} paddingLeft={subPad()}>
        <text fg={COLORS.muted}>{SUBTITLE}</text>
      </box>

      {/* Gap */}
      <box height={1} />

      {/* Menu items */}
      <For each={ITEMS}>
        {(item, i) => {
          const active = () => props.focused && i() === cursor()
          return (
            <box flexDirection="column">
              <box
                height={1}
                paddingLeft={itemPad()}
                flexDirection="row"
                onMouseUp={() => { setCursor(i()); openItem(item) }}
              >
                {/* Cursor indicator */}
                <text fg={active() ? COLORS.mauve : COLORS.background}>{"▶ "}</text>

                {/* Icon */}
                <text fg={active() ? COLORS.mauve : COLORS.blue}>{item.icon}</text>
                <text fg={COLORS.muted}>{"  "}</text>

                {/* Label */}
                <text
                  fg={active() ? COLORS.text : COLORS.subtext}
                  width={LABEL_W}
                  attributes={active() ? 1 : 0}
                >
                  {item.label.padEnd(LABEL_W)}
                </text>

                {/* Spacer */}
                <text fg={COLORS.muted}>{"    "}</text>

                {/* Command hint */}
                <text fg={active() ? COLORS.peach : COLORS.overlay}>{item.cmd}</text>
              </box>

              {/* Gap between items */}
              <Show when={i() < ITEMS.length - 1}>
                <box height={1} />
              </Show>
            </box>
          )
        }}
      </For>

      {/* Gap */}
      <box height={1} />

      {/* Footer */}
      <box height={1} paddingLeft={footPad()} flexDirection="row">
        <text fg={COLORS.teal}>⚡ </text>
        <text fg={COLORS.teal}>surp</text>
        <text fg={COLORS.muted}>  ·  j/k navigate  enter open  : command</text>
      </box>

    </box>
  )
}
