import { createContext, useContext, createSignal, onCleanup, onMount, type Accessor, type ParentProps } from "solid-js"
import type { ActiveConnection, Capability, DatabaseDriver, PostgresConnectOptions, PostgresProfile } from "../connections/types"
import type { PinnedProject } from "../connections/store"
import { createDriver } from "../connections/registry"
import * as store from "../connections/store"
import { parsePostgresUrl, describePostgresOptions } from "../connections/url"
import * as accounts from "../auth/accounts"
import { useAuth } from "./auth"
import { useBuffers } from "./buffers"
import { setSidebarOpen, setSidebarFocused } from "../panes/sidebar-state"

export interface ConnectFormInput extends PostgresConnectOptions {
  name?: string
  save?: boolean
}

export interface ConnectionContextValue {
  active: Accessor<ActiveConnection | null>
  connecting: Accessor<boolean>
  error: Accessor<string | null>
  savedProfiles: Accessor<PostgresProfile[]>
  pinnedProjects: Accessor<PinnedProject[]>
  /** Capability check against the active connection */
  has: (cap: Capability) => boolean
  /** `:connect postgres://user:pass@host:port/db?sslmode=...` */
  connectPostgresUrl: (url: string, opts?: { name?: string; save?: boolean }) => Promise<boolean>
  /** `:connect <saved-profile-name>` */
  connectSavedProfile: (nameOrId: string) => Promise<boolean>
  /** Structured connect (form buffer) */
  connectPostgresForm: (input: ConnectFormInput) => Promise<boolean>
  /** Connect to a pinned Supabase project from the home page */
  connectPinned: (pin: PinnedProject) => Promise<boolean>
  /** Activate a Supabase project (used by projects buffer + commands with explicit refs) */
  openProject: (opts: { ref: string; name?: string; accountId?: string }) => Promise<boolean>
  disconnect: () => Promise<void>
  refreshSaved: () => Promise<void>
  refreshPinned: () => Promise<void>
  deleteSavedProfile: (id: string) => Promise<void>
}

const ConnectionContext = createContext<ConnectionContextValue>()

export function ConnectionProvider(props: ParentProps) {
  const auth = useAuth()
  const buffers = useBuffers()

  const [active, setActive] = createSignal<ActiveConnection | null>(null)
  const [connecting, setConnecting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [profiles, setProfiles] = createSignal<PostgresProfile[]>([])
  const [pinned, setPinned] = createSignal<PinnedProject[]>([])

  const refreshSaved = async (): Promise<void> => {
    setProfiles(await store.listProfiles())
  }
  const refreshPinned = async (): Promise<void> => {
    setPinned(await store.listPinned())
  }
  onMount(() => {
    void refreshSaved()
    void refreshPinned()
  })

  // Close the driver's sockets when the app exits
  onCleanup(() => { void active()?.driver.close() })

  async function activate(conn: ActiveConnection): Promise<void> {
    const prev = active()
    if (prev && prev.id !== conn.id) {
      void prev.driver.close().catch(() => {})
    }
    setError(null)
    setActive(conn)
  }

  /**
   * Post-connect UX: open the explorer sidebar and dismiss the home page so
   * the tab-less "pick a table" placeholder takes over the main area.
   */
  function postConnectUi(): void {
    setSidebarOpen(true)
    setSidebarFocused(true)
    for (const b of [...buffers.list]) {
      if (b.type === "dashboard") buffers.close(b.id)
    }
  }

  async function connectWith(
    id: string,
    kind: ActiveConnection["kind"],
    label: string,
    makeDriver: () => DatabaseDriver,
    supabase?: { token: string; ref: string },
  ): Promise<boolean> {
    setConnecting(true)
    setError(null)
    try {
      const driver = makeDriver()
      await driver.testConnection()
      await activate({ id, kind, label, driver, ...(supabase ? { supabase } : {}) })
      postConnectUi()
      return true
    } catch (e) {
      setError(String(e))
      return false
    } finally {
      setConnecting(false)
    }
  }

  async function connectPostgresForm(input: ConnectFormInput): Promise<boolean> {
    if (!input.host?.trim()) {
      setError("Host is required")
      return false
    }
    let profileId: string | undefined
    if (input.save) {
      try {
        const saved = await store.saveProfile({
          name: input.name?.trim() || describePostgresOptions(input),
          host: input.host,
          port: input.port ?? 5432,
          user: input.user,
          password: input.password,
          database: input.database,
          ssl: input.ssl,
        })
        profileId = saved.id
        await refreshSaved()
      } catch (e) {
        setError(`Failed to save profile: ${String(e)}`)
      }
    }
    return connectWith(
      profileId ?? `pg-live-${Date.now()}`,
      "postgres",
      input.name?.trim() || describePostgresOptions(input),
      () => createDriver("postgres", input),
    )
  }

  async function connectPostgresUrl(url: string, opts?: { name?: string; save?: boolean }): Promise<boolean> {
    const parsed = parsePostgresUrl(url)
    if (!parsed) {
      setError("Invalid postgres:// connection string")
      return false
    }
    return connectPostgresForm({ ...parsed, name: opts?.name, save: opts?.save })
  }

  async function connectSavedProfile(nameOrId: string): Promise<boolean> {
    const key = nameOrId.trim().toLowerCase()
    const profile = profiles().find(
      (p) => p.id === key || p.name.toLowerCase() === key,
    ) ?? profiles().find((p) => p.name.toLowerCase().startsWith(key))
    if (!profile) {
      setError(`No saved connection named "${nameOrId}"`)
      return false
    }
    return connectWith(
      profile.id,
      "postgres",
      profile.name,
      () => createDriver("postgres", {
        host: profile.host,
        port: profile.port,
        user: profile.user,
        password: profile.password,
        database: profile.database,
        ssl: profile.ssl,
      }),
    )
  }

  async function resolveSupabaseToken(accountId?: string): Promise<string | null> {
    if (!accountId || accountId === accounts.PRIMARY_ACCOUNT_ID) return auth.token()
    return accounts.readAccountToken(accountId)
  }

  async function connectPinned(pin: PinnedProject): Promise<boolean> {
    return openProject({ ref: pin.ref, name: pin.name, accountId: pin.accountId })
  }

  async function openProject(opts: { ref: string; name?: string; accountId?: string }): Promise<boolean> {
    const token = await resolveSupabaseToken(opts.accountId)
    if (!token) {
      setError("No Supabase access token for this account (:login or :import → a)")
      return false
    }
    const cur = active()
    if (cur?.kind === "supabase" && cur.supabase?.ref === opts.ref) return true
    return connectWith(
      `sb-${opts.ref}`,
      "supabase",
      opts.name ?? opts.ref,
      () => createDriver("supabase", { token, ref: opts.ref, label: opts.name ?? opts.ref }),
      { token, ref: opts.ref },
    )
  }

  async function disconnect(): Promise<void> {
    const cur = active()
    if (!cur) return
    setActive(null)
    await cur.driver.close().catch(() => {})
  }

  const ctx: ConnectionContextValue = {
    active,
    connecting,
    error,
    savedProfiles: profiles,
    pinnedProjects: pinned,
    has: (cap) => active()?.driver.capabilities.has(cap) ?? false,
    connectPostgresUrl,
    connectSavedProfile,
    connectPostgresForm,
    connectPinned,
    openProject,
    disconnect,
    refreshSaved,
    refreshPinned,
    deleteSavedProfile: async (id: string) => {
      await store.deleteProfile(id)
      await refreshSaved()
    },
  }

  return <ConnectionContext.Provider value={ctx}>{props.children}</ConnectionContext.Provider>
}

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext)
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider")
  return ctx
}
