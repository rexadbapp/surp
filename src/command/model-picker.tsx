import { Show, For } from "solid-js"
import { COLORS } from "../ui/colors"
import type { ModelRow } from "../agent/model-picker"
import {
  modelPhase,
  modelQuery,
  filteredModels,
  modelSelectedIdx,
  modelOffset,
  modelStatus,
} from "../agent/model-picker"

interface ModelPickerProps {
  width: number
  height: number
}

const DIALOG_W = 72
const LIST_H = 14

export function ModelPicker(props: ModelPickerProps) {
  const phase = () => modelPhase()
  const view = () => filteredModels()
  const slice = () => view().slice(modelOffset(), modelOffset() + LIST_H)
  const position = () =>
    view().length > 0 ? `${Math.min(modelSelectedIdx() + 1, view().length)}/${view().length}` : "0/0"

  return (
    <box
      flexDirection="column"
      width={props.width}
      height={props.height}
      alignItems="center"
      justifyContent="center"
    >
      <box flexDirection="column" width={DIALOG_W}>
        <box
          flexDirection="row"
          height={1}
          paddingLeft={2}
          backgroundColor={COLORS.mauve}
        >
          <text fg={COLORS.background} attributes={1}>Model Picker</text>
          <Show when={phase() === "list"}>
            <text fg={COLORS.background}>  ·  /filter  ↑↓/jk: nav  enter: select  esc: clear</text>
          </Show>
        </box>

        <Show when={phase() === "loading"}>
          <box height={1} paddingLeft={2} backgroundColor={COLORS.surface}>
            <text fg={COLORS.subtext}>Loading available models…</text>
          </box>
        </Show>

        <Show when={phase() === "working"}>
          <box height={1} paddingLeft={2} backgroundColor={COLORS.surface}>
            <text fg={COLORS.subtext}>{modelStatus() || "Working…"}</text>
          </box>
        </Show>

        <Show when={phase() === "error"}>
          <box height={1} paddingLeft={2} backgroundColor={COLORS.surface}>
            <text fg={COLORS.red}>{modelStatus()}</text>
            <text fg={COLORS.subtext}> — enter to go back, esc to close</text>
          </box>
        </Show>

        <Show when={phase() === "list"}>
          <box flexDirection="column" paddingLeft={2} paddingRight={2} height={LIST_H + 2} backgroundColor={COLORS.surface}>
            <box flexDirection="row" height={1}>
              <text fg={COLORS.blue}>/ </text>
              <text fg={COLORS.text}>{modelQuery()}</text>
              <text fg={COLORS.blue}>▌</text>
            </box>
            <For each={slice()}>
              {(row: ModelRow, i: () => number) => {
                const idx = () => modelOffset() + i()
                const selected = () => idx() === modelSelectedIdx()
                return (
                  <box flexDirection="row" height={1}>
                    <text
                      fg={selected() ? COLORS.blue : COLORS.text}
                      attributes={selected() ? 1 : 0}
                      width={2}
                    >
                      {selected() ? "▶" : " "}
                    </text>
                    <text
                      fg={row.current ? COLORS.green : selected() ? COLORS.blue : COLORS.text}
                      width={44}
                    >
                      {row.id}
                      {row.current ? " *" : ""}
                    </text>
                  </box>
                )
              }}
            </For>
            <Show when={view().length === 0}>
              <text fg={COLORS.subtext}>
                No matching models — esc clears the filter
              </text>
            </Show>
          </box>
          <box height={1} paddingLeft={2} backgroundColor={COLORS.surface}>
            <text fg={COLORS.subtext}>
              * current · {position()} · keys stored via :agent-login
            </text>
          </box>
        </Show>

        <box height={1}>
          <text fg={COLORS.subtext}>esc closes</text>
        </box>
      </box>
    </box>
  )
}
