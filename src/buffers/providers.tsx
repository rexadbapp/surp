import { createSignal, createEffect, onMount, Show, For } from "solid-js"
import { useAuth } from "../context/auth"
import { useKeymap } from "../context/keymap"
import { getAuthConfig, type AuthConfig } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

interface ProviderInfo {
  key: string
  name: string
  enabled: boolean
}

const PROVIDER_LABELS: Record<string, string> = {
  provider_github_enabled: "GitHub",
  provider_google_enabled: "Google",
  provider_apple_enabled: "Apple",
  provider_azure_enabled: "Azure",
  provider_facebook_enabled: "Facebook",
  provider_twitter_enabled: "Twitter",
  provider_discord_enabled: "Discord",
  provider_slack_enabled: "Slack",
  provider_keycloak_enabled: "Keycloak",
  provider_linkedin_enabled: "LinkedIn",
  provider_notion_enabled: "Notion",
  provider_spotify_enabled: "Spotify",
  provider_workos_enabled: "WorkOS",
  provider_zoom_enabled: "Zoom",
  provider_twitch_enabled: "Twitch",
  provider_gitlab_enabled: "GitLab",
  EXTERNAL_ANONYMOUS_USERS_ENABLED: "Anonymous Users",
}

export function ProvidersBuffer(props: BufferProps) {
  const auth = useAuth()
  const keymap = useKeymap()

  const [config, setConfig] = createSignal<AuthConfig | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [cursor, setCursor] = createSignal(0)

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
  keymap.onAction("move_up", () => {
    if (!props.focused) return
    setCursor((c) => Math.max(0, c - 1))
  })
  keymap.onAction("move_down", () => {
    if (!props.focused) return
    setCursor((c) => Math.min(providers().length - 1, c + 1))
  })

  const providers = () => {
    const c = config()
    if (!c) return []
    return Object.keys(PROVIDER_LABELS)
      .filter((k) => k in c)
      .map((k) => ({ key: k, name: PROVIDER_LABELS[k], enabled: Boolean(c[k]) }))
  }

  const enabledCount = () => providers().filter((p) => p.enabled).length

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      <box height={1} paddingLeft={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.lavender} attributes={1}>Auth Providers  </text>
        <text fg={COLORS.muted}>{projectRef()}</text>
        <Show when={loading()}>
          <text fg={COLORS.yellow}>  loading…</text>
        </Show>
        <Show when={!loading() && config()}>
          <text fg={COLORS.subtext}>  {enabledCount()} enabled</text>
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
          <text fg={COLORS.subtext}>No project selected.</text>
        </box>
      </Show>

      <Show when={config()}>
        <box flexDirection="column" paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.blue} attributes={1}>OAuth & SSO Providers</text>
          <box height={1} />
          <For each={providers()}>
            {(p, i) => {
              const active = () => props.focused && i() === cursor()
              return (
                <box
                  flexDirection="row"
                  height={1}
                  backgroundColor={active() ? COLORS.overlay : COLORS.background}
                >
                  <text fg={active() ? COLORS.blue : COLORS.text} width={2}>
                    {active() ? "▶ " : "  "}
                  </text>
                  <text fg={p.enabled ? COLORS.text : COLORS.subtext} width={24}>{p.name}</text>
                  <text fg={p.enabled ? COLORS.green : COLORS.red} width={10}>
                    {p.enabled ? "enabled" : "disabled"}
                  </text>
                </box>
              )
            }}
          </For>

          <box height={1} />
          <text fg={COLORS.blue} attributes={1}>Settings</text>
          <box height={1} />
          <box flexDirection="row" height={1}>
            <text fg={COLORS.muted} width={30}>Anonymous Users:</text>
            <text fg={config()?.EXTERNAL_ANONYMOUS_USERS_ENABLED ? COLORS.green : COLORS.subtext}>
              {config()?.EXTERNAL_ANONYMOUS_USERS_ENABLED ? "enabled" : "disabled"}
            </text>
          </box>
          <box flexDirection="row" height={1}>
            <text fg={COLORS.muted} width={30}>Manual Email Verification:</text>
            <text fg={COLORS.text}>
              {config()?.SECURITY_MANUALLY_VERIFY_EMAIL ? "enabled" : "disabled"}
            </text>
          </box>
          <box flexDirection="row" height={1}>
            <text fg={COLORS.muted} width={30}>Auto-Confirm Email:</text>
            <text fg={COLORS.text}>
              {config()?.MAILER_AUTOCONFIRM ? "enabled" : "disabled"}
            </text>
          </box>

          <Show when={config()?.SITE_URL}>
            <box height={1} />
            <text fg={COLORS.blue} attributes={1}>Site</text>
            <box height={1} />
            <box flexDirection="row" height={1}>
              <text fg={COLORS.muted} width={30}>Site URL:</text>
              <text fg={COLORS.cyan}>{config()?.SITE_URL}</text>
            </box>
            <Show when={(config()?.URI_ALLOW_LIST?.length ?? 0) > 0}>
              <box flexDirection="row" height={1}>
                <text fg={COLORS.muted} width={30}>Allow List:</text>
                <text fg={COLORS.subtext}>{config()?.URI_ALLOW_LIST?.join(", ") ?? "—"}</text>
              </box>
            </Show>
          </Show>
        </box>
      </Show>
    </box>
  )
}
