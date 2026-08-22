import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

const SECTIONS = [
  {
    title: "Navigation",
    items: [
      ["j / k", "Move down / up"],
      ["h / l", "Move left / right"],
      ["gg / G", "Go to top / bottom"],
      ["ctrl+d / ctrl+u", "Scroll half page down / up"],
      ["ctrl+f / ctrl+b", "Page down / up"],
      ["enter", "Select / open"],
    ],
  },
  {
    title: "Buffers",
    items: [
      ["gt / gT", "Next / previous buffer"],
      ["q", "Close current buffer"],
      [":bd", "Delete buffer"],
    ],
  },
  {
    title: "Commands (press `:` to open)",
    items: [
      [":connect <url|name>", "Connect to postgres (DSN or saved profile)"],
      [":connections", "Manage saved database connections"],
      [":import", "Import Supabase projects (multi-account)"],
      [":disconnect", "Disconnect from the active database"],
      [":projects", "Open Supabase projects list"],
      [":tables [ref]", "Open table browser"],
      [":sql", "Open SQL editor"],
      [":theme", "Pick a color theme"],
      [":cursor", "Pick a cursor style"],
      [":login", "Login with personal access token"],
      [":logout", "Logout"],
      [":help / :h", "Show this help"],
      [":q / :quit", "Quit surp"],
    ],
  },
  {
    title: "Postgres connections",
    items: [
      [":connect postgres://u:p@host/db", "Quick-connect via DSN"],
      ["u", "Paste connection string (in :connections)"],
      ["?sslmode=disable", "Append to DSN to disable SSL"],
      ["x", "Disconnect (in :connections buffer)"],
      ["d", "Delete saved profile (in :connections buffer)"],
    ],
  },
  {
    title: "SQL Editor",
    items: [
      ["i", "Enter edit mode"],
      ["ctrl+enter", "Run query"],
      ["r", "Re-run query"],
      ["esc", "Exit edit mode"],
    ],
  },
]

export function HelpBuffer(props: BufferProps) {
  return (
    <box flexDirection="column" width={props.width} height={props.height} paddingLeft={2} paddingTop={1}>
      <box paddingBottom={1}>
        <text fg={COLORS.mauve} attributes={1}>surp — nvim for Supabase</text>
      </box>
      {SECTIONS.map((section) => (
        <box flexDirection="column" paddingBottom={1}>
          <text fg={COLORS.blue} attributes={1}>{section.title}</text>
          {section.items.map(([key, desc]) => (
            <box flexDirection="row" height={1}>
              <text fg={COLORS.yellow} width={24}>{key}</text>
              <text fg={COLORS.text}>{desc}</text>
            </box>
          ))}
        </box>
      ))}
      <box paddingTop={1}>
        <text fg={COLORS.subtext}>
          Config: ~/.config/surp/config.json — keybindings are fully customizable
        </text>
      </box>
    </box>
  )
}
