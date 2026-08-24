import { Show, For } from "solid-js"
import { COLORS } from "../ui/colors"
import type { ProviderRow } from "../agent/providers"
import {
  loginPhase,
  loginQuery,
  filteredProviders,
  loginProviders,
  loginSelectedIdx,
  loginOffset,
  loginPromptMsg,
  loginSecret,
  loginInputValue,
  loginStatus,
} from "../agent/providers"

interface ProviderLoginProps {
  width: number
  height: number
}

const DIALOG_W = 64
const LIST_H = 12

export function ProviderLogin(props: ProviderLoginProps) {
  const phase = () => loginPhase()
  const masked = () => "•".repeat(loginInputValue().length)
  const view = () => filteredProviders()
  const slice = () => view().slice(loginOffset(), loginOffset() + LIST_H)

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
          <text fg={COLORS.background} attributes={1}>Provider Login</text>
          <Show when={phase() === "list"}>
            <text fg={COLORS.background}>  ·  /filter  ↑↓: nav  enter: select  esc: clear</text>
          </Show>
          <Show when={phase() === "prompt"}>
            <text fg={COLORS.background}>  ·  enter: submit  ⌫: delete  ctrl-u: clear  esc: cancel</text>
          </Show>
        </box>

        {/* provider list */}
        <Show when={phase() === "list" || phase() === "loading"}>
          <box
            flexDirection="column"
            paddingLeft={2}
            paddingRight={2}
            height={LIST_H + 2}
            backgroundColor={COLORS.surface}
          >
            <Show when={phase() === "list"}>
              <box flexDirection="row" height={1}>
                <text fg={COLORS.blue}>/ </text>
                <text fg={COLORS.text}>{loginQuery()}</text>
                <text fg={COLORS.blue}>▌</text>
                <Show when={view().length !== loginProviders().length}>
                  <text fg={COLORS.subtext}>  — {view().length}/{loginProviders().length}</text>
                </Show>
              </box>
            </Show>
            <For each={slice()}>
              {(row: ProviderRow, i: () => number) => {
                const idx = () => loginOffset() + i()
                const sel = () => idx() === loginSelectedIdx()
                return (
                  <box flexDirection="row" height={1}>
                    <text
                      fg={sel() ? COLORS.blue : COLORS.text}
                      attributes={sel() ? 1 : 0}
                      width={30}
                    >
                      {sel() ? "▶ " : "  "}
                      {row.name}
                    </text>
                    <text width={10}>{row.configured ? "✓" : ""}</text>
                    <text fg={COLORS.subtext}>{row.id}</text>
                  </box>
                )
              }}
            </For>
            <Show when={phase() === "list" && view().length === 0}>
              <text fg={COLORS.subtext}>
                {loginProviders().length === 0 ? "No providers support API-key login" : "No matching providers"}
              </text>
            </Show>
            <Show when={phase() === "loading"}>
              <text fg={COLORS.subtext}>Loading providers…</text>
            </Show>
          </box>
        </Show>

        {/* secret / text prompt */}
        <Show when={phase() === "prompt"}>
          <box flexDirection="column" paddingLeft={2} paddingRight={2} backgroundColor={COLORS.surface}>
            <text fg={COLORS.text}>{loginPromptMsg()}</text>
            <box flexDirection="row" height={1}>
              <text fg={COLORS.blue}>&gt; </text>
              <text fg={loginSecret() ? COLORS.muted : COLORS.text}>
                {loginSecret() ? masked() : loginInputValue()}▌
              </text>
            </box>
          </box>
        </Show>

        {/* working */}
        <Show when={phase() === "working" || phase() === "loading"}>
          <box height={1} paddingLeft={2} backgroundColor={COLORS.surface}>
            <text fg={COLORS.subtext}>{loginStatus() || "Working…"}</text>
          </box>
        </Show>

        {/* error / done */}
        <Show when={phase() === "error" || phase() === "done"}>
          <box height={1} paddingLeft={2} backgroundColor={COLORS.surface}>
            <text fg={phase() === "error" ? COLORS.red : COLORS.green}>{loginStatus()}</text>
          </box>
        </Show>

        <box height={1} paddingLeft={2} backgroundColor={COLORS.surface}>
          <text fg={COLORS.subtext}>keys are stored in ~/.dbagent/auth.json</text>
        </box>
        <box height={1}>
          <text fg={COLORS.subtext}>esc closes</text>
        </box>
      </box>
    </box>
  )
}
