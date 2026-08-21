import { createSignal, createEffect, onMount, Show, For } from "solid-js"
import { useAuth } from "../context/auth"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import { getProfile, listOrganizations, getOrganizationMembers, type Profile, type Organization, type OrganizationMember } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

type AuthTab = "account" | "orgs"

export function ProfileBuffer(props: BufferProps) {
  const auth = useAuth()
  const buffers = useBuffers()
  const keymap = useKeymap()
  const yank = useYank()

  const [profile, setProfile] = createSignal<Profile | null>(null)
  const [orgs, setOrgs] = createSignal<Organization[]>([])
  const [members, setMembers] = createSignal<Record<string, OrganizationMember[]>>({})
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [tab, setTab] = createSignal<AuthTab>("account")
  const [cursor, setCursor] = createSignal(0)

  async function load() {
    const token = auth.token()
    if (!token) return
    setLoading(true); setError(null)
    try {
      const [prof, orgList] = await Promise.all([
        getProfile(token).catch(() => null),
        listOrganizations(token).catch(() => [] as Organization[]),
      ])
      if (prof) setProfile(prof)
      setOrgs(orgList)
      const memMap: Record<string, OrganizationMember[]> = {}
      for (const org of orgList) {
        try {
          memMap[org.slug] = await getOrganizationMembers(token, org.slug)
        } catch {}
      }
      setMembers(memMap)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => void load())

  keymap.onAction("refresh", () => { if (props.focused) void load() })

  keymap.onAction("yank", () => {
    if (!props.focused) return
    const t = auth.token()
    if (t) yank.yank(t, "Token")
  })

  keymap.onAction("move_left", () => {
    if (!props.focused) return
    if (tab() === "orgs") { setTab("account"); setCursor(0) }
  })

  keymap.onAction("move_right", () => {
    if (!props.focused) return
    if (tab() === "account") { setTab("orgs"); setCursor(0) }
  })

  keymap.onAction("move_down", () => {
    if (!props.focused) return
    if (tab() === "orgs") setCursor((c) => Math.min(c + 1, orgs().length - 1))
  })

  keymap.onAction("move_up", () => {
    if (!props.focused) return
    if (tab() === "orgs") setCursor((c) => Math.max(c - 1, 0))
  })

  keymap.onAction("select", () => {
    if (!props.focused || tab() !== "orgs") return
    const org = orgs()[cursor()]
    if (org) buffers.open("projects", { org: org.slug }, `Projects: ${org.name}`)
  })

  function truncateToken(t: string): string {
    if (t.length <= 12) return t
    return t.slice(0, 6) + "…" + t.slice(-4)
  }

  const tokenPreview = () => {
    const t = auth.token()
    return t ? truncateToken(t) : null
  }

  const loggedIn = () => auth.isLoggedIn()

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      <box height={1} paddingLeft={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.mauve} attributes={1}>profile  </text>
        <Show when={loading()}>
          <text fg={COLORS.yellow}>loading…</text>
        </Show>
        <Show when={!loading() && loggedIn()}>
          <text fg={COLORS.green}> ● logged in</text>
        </Show>
        <Show when={!loading() && !loggedIn()}>
          <text fg={COLORS.red}> ○ not logged in</text>
        </Show>
        <text fg={COLORS.muted}>  ·  r: refresh</text>
      </box>

      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.red}>{error()}</text>
        </box>
      </Show>

      <Show when={!loggedIn() && !loading()}>
        <box flexDirection="column" paddingLeft={3} paddingTop={3}>
          <text fg={COLORS.text} attributes={1}>Not logged in</text>
          <box paddingTop={1}>
            <text fg={COLORS.subtext}>Run </text>
            <text fg={COLORS.yellow}>:login</text>
            <text fg={COLORS.subtext}> to authenticate with Supabase</text>
          </box>

        </box>
      </Show>

      <Show when={loggedIn() && !loading()}>
        {/* Tab bar */}
        <box flexDirection="row" height={1} paddingLeft={2} paddingTop={1}>
          <box
            width={12}
            height={1}
            backgroundColor={tab() === "account" ? COLORS.overlay : COLORS.background}
            onMouseUp={() => { setTab("account"); setCursor(0) }}
          >
            <text fg={tab() === "account" ? COLORS.text : COLORS.subtext} attributes={tab() === "account" ? 1 : 0}> Account</text>
          </box>
          <box width={1} />
          <box
            width={14}
            height={1}
            backgroundColor={tab() === "orgs" ? COLORS.overlay : COLORS.background}
            onMouseUp={() => { setTab("orgs"); setCursor(0) }}
          >
            <text fg={tab() === "orgs" ? COLORS.text : COLORS.subtext} attributes={tab() === "orgs" ? 1 : 0}> Organizations</text>
          </box>
        </box>

        <Show when={tab() === "account"}>
          <box flexDirection="column" paddingLeft={3} paddingTop={1}>
            <text fg={COLORS.blue} attributes={1}>Account</text>
            <box height={1} />
            <Show when={profile()}>
              {(p) => (
                <>
                  <box flexDirection="row" height={1}>
                    <text fg={COLORS.muted} width={14}>Email:</text>
                    <text fg={COLORS.text}>{p().primary_email}</text>
                  </box>
                  <box flexDirection="row" height={1}>
                    <text fg={COLORS.muted} width={14}>Username:</text>
                    <text fg={COLORS.text}>{p().username}</text>
                  </box>
                  <box flexDirection="row" height={1}>
                    <text fg={COLORS.muted} width={14}>ID:</text>
                    <text fg={COLORS.muted}>{p().gotrue_id}</text>
                  </box>
                </>
              )}
            </Show>
            <Show when={!profile()}>
              <text fg={COLORS.muted}>Could not fetch profile — token may be read-only</text>
            </Show>

            <box height={1} />
            <text fg={COLORS.blue} attributes={1}>Authentication</text>
            <box height={1} />
            <box flexDirection="row" height={1}>
              <text fg={COLORS.muted} width={14}>Token:</text>
              <text fg={COLORS.yellow}>{tokenPreview()}</text>
            </box>
            <box flexDirection="row" height={1}>
              <text fg={COLORS.muted} width={14}>Status:</text>
              <text fg={COLORS.green}>● Valid</text>
            </box>

            <box height={1} />
            <text fg={COLORS.blue} attributes={1}>Actions</text>
            <box height={1} />
            <box flexDirection="row" height={1}>
              <text fg={COLORS.yellow} width={24}>r</text>
              <text fg={COLORS.text}>Refresh auth data</text>
            </box>
            <box flexDirection="row" height={1}>
              <text fg={COLORS.yellow} width={24}>y</text>
              <text fg={COLORS.text}>Copy token to clipboard</text>
            </box>
            <box flexDirection="row" height={1}>
              <text fg={COLORS.yellow} width={24}>:login</text>
              <text fg={COLORS.text}>Authenticate with Supabase</text>
            </box>
            <box flexDirection="row" height={1}>
              <text fg={COLORS.yellow} width={24}>:logout</text>
              <text fg={COLORS.text}>Logout from Supabase</text>
            </box>
          </box>
        </Show>

        <Show when={tab() === "orgs"}>
          <box flexDirection="column" paddingLeft={3} paddingTop={1}>
            <box flexDirection="row" height={1}>
              <text fg={COLORS.blue} attributes={1}>Organizations</text>
              <text fg={COLORS.muted}> ({orgs().length})</text>
            </box>
            <box height={1} />
            <Show when={orgs().length === 0}>
              <text fg={COLORS.muted}>No organizations found</text>
            </Show>
            <For each={orgs()}>
              {(org, i) => {
                const active = () => tab() === "orgs" && i() === cursor()
                const mems = members()[org.slug] ?? []
                return (
                  <box flexDirection="column">
                    <box
                      flexDirection="row"
                      height={1}
                      backgroundColor={active() ? COLORS.overlay : COLORS.background}
                    >
                      <text fg={active() ? COLORS.blue : COLORS.text} width={2}>
                        {active() ? "▶ " : "  "}
                      </text>
                      <text fg={COLORS.text} attributes={1}>{org.name}</text>
                      <text fg={COLORS.muted}>  ({org.slug})</text>
                    </box>
                    <Show when={mems.length > 0}>
                      <For each={mems}>
                        {(mem) => (
                          <box flexDirection="row" height={1} paddingLeft={3}>
                            <text fg={COLORS.subtext}>· </text>
                            <text fg={COLORS.text}>{mem.email}</text>
                            <text fg={COLORS.muted}>  {mem.role_name}</text>
                          </box>
                        )}
                      </For>
                    </Show>
                  </box>
                )
              }}
            </For>
          </box>
        </Show>
      </Show>
    </box>
  )
}
