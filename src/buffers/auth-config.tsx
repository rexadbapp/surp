import { createSignal, createEffect, onMount, Show, For } from "solid-js"
import { useAuth } from "../context/auth"
import { useKeymap } from "../context/keymap"
import { getAuthConfig, type AuthConfig } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

const EXCLUDED_KEYS = new Set([
  "JWT_SECRET", "SMTP_PASS", "SECURITY_CAPTCHA_SECRET", "password_hibp_enabled",
])

export function AuthConfigBuffer(props: BufferProps) {
  const auth = useAuth()
  const keymap = useKeymap()

  const [config, setConfig] = createSignal<AuthConfig | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const projectRef = () => props.meta.data?.["project"] ?? ""

  async function load() {
    const token = auth.token()
    const ref = projectRef()
    if (!token || !ref) return
    setLoading(true); setError(null)
    try {
      const cfg = await getAuthConfig(token, ref)
      setConfig(cfg)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => void load())
  keymap.onAction("refresh", () => { if (props.focused) void load() })

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      <box height={1} paddingLeft={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.mauve} attributes={1}>Auth Config  </text>
        <text fg={COLORS.muted}>{projectRef()}</text>
        <Show when={loading()}>
          <text fg={COLORS.yellow}>  loading…</text>
        </Show>
        <text fg={COLORS.muted}>  ·  r: refresh</text>
      </box>

      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.red}>{error()}</text>
        </box>
      </Show>

      <Show when={!loading() && !config() && !error()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.subtext}>No project selected. Open from a project buffer.</text>
        </box>
      </Show>

      <Show when={config()}>
        {(c) => {
          const entries = Object.entries(c())
            .filter(([k]) => !EXCLUDED_KEYS.has(k) && !k.startsWith("SMTP_PASS") && !k.startsWith("SECURITY_CAPTCHA_SECRET"))
            .sort(([a], [b]) => a.localeCompare(b))

          return (
            <box flexDirection="column" paddingLeft={2} paddingTop={1}>
              <text fg={COLORS.blue} attributes={1}>Authentication Settings</text>
              <box height={1} />
              <For each={entries}>
                {([key, val]) => {
                  const display = formatValue(val)
                  return (
                    <box flexDirection="row" height={1}>
                      <text fg={COLORS.muted} width={38}>{key}</text>
                      <text fg={key.startsWith("provider_") && val === true ? COLORS.green : key.startsWith("provider_") && val === false ? COLORS.red : COLORS.text}>
                        {display}
                      </text>
                    </box>
                  )
                }}
              </For>
            </box>
          )
        }}
      </Show>
    </box>
  )
}

function formatValue(val: unknown): string {
  if (typeof val === "boolean") return val ? "true" : "false"
  if (val === null || val === undefined) return "—"
  if (Array.isArray(val)) return val.length > 0 ? val.join(", ") : "—"
  return String(val)
}
