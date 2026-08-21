import { createSignal, createMemo, For, Show, onMount } from "solid-js"
import { useAuth } from "../context/auth"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import { listAuthUsers, getAuthUserDB, deleteAuthUser } from "../auth/api"
import type { AuthUser, AuthUserDetail } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

// ─── Shared helpers ───────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    })
  } catch { return iso }
}

function fmtDT(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  } catch { return iso }
}

function providerLabel(u: AuthUser): string {
  return u.providers.length > 0 ? u.providers.join(", ") : "email"
}

function trunc(s: string, w: number) { return s.length <= w ? s : s.slice(0, w - 1) + "…" }

// ─── Caches ───────────────────────────────────────────────────

const usersCache = new Map<string, AuthUser[]>()
const detailCache = new Map<string, AuthUserDetail>()

// ─── Detail: Card sub-component ───────────────────────────────

function Card(p: { label: string; value: string; sub?: string; fg?: string; width: number }) {
  return (
    <box width={p.width} height={5} backgroundColor={COLORS.surface} flexDirection="column">
      <box height={1} />
      <box height={1} paddingLeft={2}><text fg={COLORS.muted}>{trunc(p.label, p.width - 4)}</text></box>
      <box height={1} paddingLeft={2}><text fg={p.fg ?? COLORS.text} attributes={1}>{trunc(p.value, p.width - 4)}</text></box>
      <box height={1} paddingLeft={2}><text fg={COLORS.muted}>{p.sub ? trunc(p.sub, p.width - 4) : ""}</text></box>
      <box height={1} />
    </box>
  )
}

type Tab = "overview" | "identities" | "factors"
const TABS: Tab[] = ["overview", "identities", "factors"]
const TAB_LBL: Record<Tab, string> = {
  overview: "Overview", identities: "Identities", factors: "MFA Factors",
}

// ─── Detail View ──────────────────────────────────────────────

function DetailView(props: BufferProps) {
  const auth   = useAuth()
  const keymap = useKeymap()
  const yank   = useYank()

  const ref    = () => String(props.meta.data?.["project"] ?? "")
  const userId = () => String(props.meta.data?.["userId"] ?? "")
  const ck     = () => `${ref()}/${userId()}`

  const [tab, setTab] = createSignal<Tab>("overview")
  const [scroll, setScroll] = createSignal(0)
  const [user, setUser] = createSignal<AuthUserDetail | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  async function load(force = false) {
    const token = auth.token()
    const r = ref(), u = userId()
    if (!token || !r || !u) return
    const key = ck()
    if (!force && detailCache.has(key)) { setUser(detailCache.get(key)!); return }
    setLoading(true); setError(null)
    try {
      const d = await getAuthUserDB(token, r, u)
      if (d) { detailCache.set(key, d); setUser(d) }
      else setError("User not found")
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  onMount(() => void load())

  keymap.onAction("refresh", () => {
    if (!props.focused) return
    detailCache.delete(ck())
    void load(true)
  })
  keymap.onAction("move_up", () => {
    if (!props.focused) return
    if (tab() === "overview" || tab() === "identities") setScroll((s) => Math.max(0, s - 1))
  })
  keymap.onAction("move_down", () => {
    if (!props.focused) return
    if (tab() === "overview" || tab() === "identities") setScroll((s) => s + 1)
  })
  keymap.onAction("scroll_up", () => {
    if (!props.focused) return
    if (tab() === "overview" || tab() === "identities") setScroll((s) => Math.max(0, s - Math.floor(contentH() / 2)))
  })
  keymap.onAction("scroll_down", () => {
    if (!props.focused) return
    if (tab() === "overview" || tab() === "identities") setScroll((s) => s + Math.floor(contentH() / 2))
  })
  keymap.onAction("yank", () => {
    if (!props.focused) return
    const u = user()
    if (u) yank.yank(u.id, "user_id")
  })
  keymap.onAction("yank_row", () => {
    if (!props.focused) return
    const u = user()
    if (u) yank.yank(`${u.email ?? u.phone ?? "unknown"}\n${u.id}`, "auth_user")
  })
  // reset scroll on tab switch
  keymap.onAction("move_left", () => {
    if (!props.focused) return
    const i = TABS.indexOf(tab())
    if (i > 0) { setTab(TABS[i - 1]!); setScroll(0) }
  })
  keymap.onAction("move_right", () => {
    if (!props.focused) return
    const i = TABS.indexOf(tab())
    if (i < TABS.length - 1) { setTab(TABS[i + 1]!); setScroll(0) }
  })

  const cardW = createMemo(() => Math.max(18, Math.floor((props.width - 6) / 2)))
  const contentH = createMemo(() => Math.max(1, props.height - 4))

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      <box height={1} paddingLeft={1} flexDirection="row" backgroundColor={COLORS.overlay}>
        <text fg={COLORS.mauve} attributes={1}>auth-user  </text>
        <text fg={COLORS.text}>{userId().slice(0, 8)}</text>
        <Show when={loading()}><text fg={COLORS.yellow}>  loading…</text></Show>
        <text fg={COLORS.muted}>  ·  h/l tab  j/k scroll  y yank  r refresh</text>
      </box>

      <box height={1} flexDirection="row" backgroundColor={COLORS.surface} paddingLeft={1}>
        <For each={TABS}>
          {(t) => {
            const active = () => t === tab()
            return (
              <box
                paddingLeft={1} paddingRight={2}
                backgroundColor={active() ? COLORS.overlay : COLORS.surface}
                onMouseUp={() => { setTab(t); setScroll(0) }}
              >
                <text fg={active() ? COLORS.mauve : COLORS.muted} attributes={active() ? 1 : 0}>
                  {TAB_LBL[t]}
                </text>
              </box>
            )
          }}
        </For>
      </box>

      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1} flexGrow={1}><text fg={COLORS.red}>{error()}</text></box>
      </Show>

      <Show when={!error()}>
        <box flexGrow={1} height={contentH()} overflow={"hidden" as any}>
          <box position="absolute" top={-scroll()} left={0} width={props.width}>

            <Show when={tab() === "overview"}>
              <Show when={user()}>
                {(u) => {
                  const meta = JSON.stringify(u().user_metadata, null, 2) || "{}"
                  const metaLines = meta.split("\n")
                  return (
                    <box flexDirection="column" paddingLeft={2} paddingTop={1}>
                      <box height={1}><text fg={COLORS.text} attributes={1}>{u().email ?? u().phone ?? "(no email)"}</text></box>
                      <box height={1} />
                      <box flexDirection="row">
                        <Card label="EMAIL" value={u().email ?? "—"} width={cardW()} />
                        <box width={2} />
                        <Card label="PHONE" value={u().phone ?? "—"} width={cardW()} />
                      </box>
                      <box height={1} />
                      <box flexDirection="row">
                        <Card label="SIGNED UP" value={fmtDT(u().created_at)} width={cardW()} />
                        <box width={2} />
                        <Card label="LAST SIGN IN" value={fmtDT(u().last_sign_in_at)} width={cardW()} />
                      </box>
                      <box height={1} />
                      <box flexDirection="row">
                        <Card label="CONFIRMED" value={fmtDT(u().confirmed_at)} fg={u().confirmed_at ? COLORS.green : COLORS.red} width={cardW()} />
                        <box width={2} />
                        <Card label="BANNED UNTIL" value={fmtDT(u().banned_until)} fg={u().banned_until ? COLORS.red : COLORS.muted} width={cardW()} />
                      </box>
                      <box height={1} />
                      <box flexDirection="column" backgroundColor={COLORS.surface} paddingLeft={2} paddingTop={1} paddingBottom={1}>
                        <text fg={COLORS.muted}>USER ID</text>
                        <box height={1} />
                        <text fg={COLORS.text}>{u().id}</text>
                      </box>
                      <box height={1} />
                      <box flexDirection="row">
                        <Card label="ROLE" value={u().role} width={cardW()} />
                        <box width={2} />
                        <Card label="SSO USER" value={u().is_sso_user ? "yes" : "no"} fg={u().is_sso_user ? COLORS.yellow : COLORS.muted} width={cardW()} />
                      </box>
                      <box height={1} />
                      <box flexDirection="row">
                        <Card label="IDENTITIES" value={String(u().identities.length)} width={cardW()} />
                        <box width={2} />
                        <Card label="PROVIDERS" value={u().providers.join(", ") || "email"} width={cardW()} />
                      </box>
                      <box height={1} />
                      <box flexDirection="column" backgroundColor={COLORS.surface} paddingLeft={2} paddingTop={1} paddingBottom={1}>
                        <text fg={COLORS.muted}>USER METADATA</text>
                        <box height={1} />
                        <For each={metaLines}>
                          {(line) => <box height={1}><text fg={COLORS.subtext}>{line}</text></box>}
                        </For>
                      </box>
                    </box>
                  )
                }}
              </Show>
            </Show>

            <Show when={tab() === "identities"}>
              <Show when={user()}>
                {(u) => (
                  <box flexDirection="column" paddingLeft={2} paddingTop={1}>
                    <box height={1}><text fg={COLORS.blue} attributes={1}>Linked Identities</text></box>
                    <Show when={!u().identities || u().identities.length === 0}>
                      <box height={1} /><text fg={COLORS.muted}>No linked identities</text>
                    </Show>
                    <Show when={u().identities && u().identities.length > 0}>
                      <box height={1} />
                      <box height={1} flexDirection="row" backgroundColor={COLORS.surface} paddingLeft={1}>
                        <text fg={COLORS.muted} width={38}>PROVIDER</text>
                        <text fg={COLORS.muted}>ID</text>
                      </box>
                      <For each={u().identities}>
                        {(id) => (
                          <box height={1} flexDirection="row" paddingLeft={1}>
                            <text fg={COLORS.text} width={38}>{id.provider}</text>
                            <text fg={COLORS.subtext}>{id.id}</text>
                          </box>
                        )}
                      </For>
                    </Show>
                  </box>
                )}
              </Show>
            </Show>

            <Show when={tab() === "factors"}>
              <Show when={user()}>
                {(_) => (
                  <box flexDirection="column" paddingLeft={2} paddingTop={1}>
                    <box height={1}><text fg={COLORS.blue} attributes={1}>MFA Factors</text></box>
                    <box height={1} />
                    <text fg={COLORS.muted}>MFA factor information is not available through database queries</text>
                  </box>
                )}
              </Show>
            </Show>

          </box>
        </box>
      </Show>
    </box>
  )
}

// ─── List View ────────────────────────────────────────────────

function ListView(props: BufferProps) {
  const auth    = useAuth()
  const buffers = useBuffers()
  const keymap  = useKeymap()
  const [users, setUsers] = createSignal<AuthUser[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [cursor, setCursor] = createSignal(0)

  const projectRef = () => props.meta.data?.["project"] ?? ""

  async function load() {
    const token = auth.token()
    const ref = projectRef()
    if (!token || !ref) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const list = await listAuthUsers(token, ref)
      setUsers(list)
      usersCache.set(props.meta.id, list)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  onMount(() => {
    const cached = usersCache.get(props.meta.id)
    if (cached) { setUsers(cached); setLoading(false) }
    else void load()
  })

  keymap.onAction("refresh", () => {
    if (!props.focused) return
    usersCache.delete(props.meta.id)
    void load()
  })
  keymap.onAction("move_up", () => {
    if (!props.focused) return
    setCursor((c) => Math.max(0, c - 1))
  })
  keymap.onAction("move_down", () => {
    if (!props.focused) return
    setCursor((c) => Math.min(users().length - 1, c + 1))
  })
  keymap.onAction("select", () => {
    if (!props.focused) return
    const u = users()[cursor()]
    if (u) {
      buffers.open(
        "auth-user",
        { project: projectRef(), userId: u.id },
        `User: ${u.email ?? u.phone ?? u.id.slice(0, 8)}`,
      )
    }
  })
  keymap.onAction("delete", () => {
    if (!props.focused) return
    const u = users()[cursor()]
    if (!u) return
    const token = auth.token()
    if (!token) return
    deleteAuthUser(token, projectRef(), u.id)
      .then(() => { void load() })
      .catch((e: Error) => setError(String(e)))
  })

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      <box paddingLeft={1} height={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.subtext} attributes={1}>Auth Users  </text>
        <text fg={COLORS.muted}>{projectRef()}</text>
        <Show when={!loading()}>
          <text fg={COLORS.subtext}>  ({users().length} shown)</text>
        </Show>
      </box>

      <Show when={loading()}>
        <box paddingLeft={2} paddingTop={1}><text fg={COLORS.subtext}>Loading...</text></box>
      </Show>
      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1}><text fg={COLORS.red}>{error()}</text></box>
      </Show>
      <Show when={!loading() && users().length === 0 && !error()}>
        <box paddingLeft={2} paddingTop={1}><text fg={COLORS.subtext}>No auth users found</text></box>
      </Show>

      <Show when={!loading()}>
        <For each={users()}>
          {(user, i) => {
            const active = () => props.focused && i() === cursor()
            return (
              <box
                flexDirection="row"
                paddingLeft={1}
                height={1}
                backgroundColor={active() ? COLORS.overlay : COLORS.background}
                onMouseUp={() => {
                  setCursor(i())
                  buffers.open("auth-user", { project: projectRef(), userId: user.id }, `User: ${user.email ?? user.phone ?? user.id.slice(0, 8)}`)
                }}
              >
                <text fg={active() ? COLORS.blue : COLORS.text} width={36}>
                  {active() ? "▶ " : "  "}{user.email ?? user.phone ?? "(no email)"}
                </text>
                <text fg={COLORS.muted} width={16}>{providerLabel(user)}</text>
                <text fg={COLORS.subtext}>{fmtDate(user.last_sign_in_at ?? user.created_at)}</text>
              </box>
            )
          }}
        </For>
      </Show>
    </box>
  )
}

// ─── Main Export ──────────────────────────────────────────────

export function UsersBuffer(props: BufferProps) {
  if (props.meta.data?.["userId"]) {
    return <DetailView {...props} />
  }
  return <ListView {...props} />
}
