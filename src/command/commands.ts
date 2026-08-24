import { registerCommand } from "./registry"
import type { BuffersContextValue } from "../context/buffers"
import type { AuthContextValue } from "../context/auth"
import type { ConnectionContextValue } from "../context/connection"
import type { ModeContextValue } from "../context/mode"

let _buffers: BuffersContextValue | null = null
let _auth: AuthContextValue | null = null
let _mode: ModeContextValue | null = null
let _conn: ConnectionContextValue | null = null
let _destroy: (() => void) | null = null

export function setDestroyer(fn: () => void) {
  _destroy = fn
}

export function initCommands(
  buffers: BuffersContextValue,
  auth: AuthContextValue,
  mode: ModeContextValue,
  conn?: ConnectionContextValue,
) {
  _buffers = buffers
  _auth = auth
  _mode = mode
  _conn = conn ?? null
  registerAll()
}

function b(): BuffersContextValue {
  if (!_buffers) throw new Error("Commands not initialized")
  return _buffers
}

function a(): AuthContextValue {
  if (!_auth) throw new Error("Commands not initialized")
  return _auth
}

function m(): ModeContextValue {
  if (!_mode) throw new Error("Commands not initialized")
  return _mode
}

function c(): ConnectionContextValue | null {
  return _conn
}

/**
 * Resolve which database a command should act on.
 * - explicit supabase ref arg → activate/switch to that project
 * - otherwise fall back to the active connection (postgres or supabase)
 * Returns null when nothing usable is available.
 */
async function resolveTarget(refArg: string): Promise<string | null> {
  const connCtx = c()
  const cur = connCtx?.active()
  const ref = refArg || cur?.supabase?.ref || ""
  if (!ref) return cur ? "" : null
  if (cur?.supabase?.ref !== ref) {
    if (!connCtx) return null
    const ok = await connCtx.openProject({ ref })
    if (!ok) return null
  }
  return ref
}

/** Open the connections manager when a command has nothing to act on */
function openConnections() {
  b().open("connections")
}

function registerAll() {
  registerCommand({
    name: "dashboard",
    alias: ["dash"],
    description: "Open start dashboard",
    execute: () => { b().open("dashboard") },
  })

  registerCommand({
    name: "projects",
    description: "Open projects list",
    execute: () => { b().open("projects") },
  })

  registerCommand({
    name: "home",
    alias: ["start"],
    description: "Go to the home page (connections).  `home <ref>` opens a supabase project home",
    execute: async (args) => {
      const ref = args.trim()
      if (!ref) {
        b().open("dashboard")
        return
      }
      const active = b().activeBuffer()
      const projectName = active?.data?.["projectName"] ?? ref
      const target = await resolveTarget(ref)
      if (target === null) { openConnections(); return }
      if (target) b().open("home", { project: target, projectName }, projectName || target)
    },
  })

  registerCommand({
    name: "tables",
    description: "Open tables browser for the active connection (or a supabase ref)",
    execute: async (args) => {
      const active = b().activeBuffer()
      const [project, schema] = args.split(/\s+/)
      const sch = schema || (active?.data?.["schema"] ?? "public")
      const target = await resolveTarget(project ?? "")
      if (target === null) { openConnections(); return }
      if (target) b().open("tables", { project: target, schema: sch })
      else b().open("tables", { schema: sch })
    },
  })

  registerCommand({
    name: "sql",
    description: "Open SQL editor for the active connection",
    execute: async (args) => {
      const [project] = args.split(/\s+/)
      const target = project ? await resolveTarget(project) : (c()?.active() ? "" : null)
      if (target === null) { openConnections(); return }
      b().open("sql", target ? { project: target } : undefined)
    },
  })

  registerCommand({
    name: "agent",
    alias: ["ai"],
    description: "Open the AI database assistant.  `agent <question>` asks immediately",
    execute: (args) => {
      const q = args.trim()
      b().open("agent", q ? { prompt: q } : undefined)
    },
  })

  registerCommand({
    name: "agent-new",
    alias: ["ainew"],
    description: "Reset the AI assistant conversation",
    execute: async () => {
      const { newAgentChat } = await import("../agent/session")
      newAgentChat()
      b().open("agent")
    },
  })

  registerCommand({
    name: "agent-model",
    alias: ["aimodel"],
    description: "Set the AI model.  `agent-model provider/model` (e.g. opencode/hy3-free)",
    execute: async (args) => {
      const model = args.trim()
      if (!model) {
        const { openModelPicker } = await import("../agent/model-picker")
        void openModelPicker()
        return
      }
      const { setAgentModel } = await import("../agent/session")
      const err = await setAgentModel(model)
      b().open("agent", err ? { initError: err } : undefined)
    },
  })

  registerCommand({
    name: "agent-login",
    alias: ["ailogin"],
    description: "Log in to an AI provider with an API key",
    execute: async () => {
      const { openProviderLogin } = await import("../agent/providers")
      void openProviderLogin()
    },
  })

  registerCommand({
    name: "help",
    alias: ["h"],
    description: "Show help",
    execute: () => { b().open("help") },
  })

  registerCommand({
    name: "profile",
    alias: ["account", "whoami", "auth"],
    description: "Show authentication status and manage session",
    execute: () => { b().open("profile") },
  })

  registerCommand({
    name: "login",
    description: "Login to Supabase with a personal access token",
    execute: () => { b().open("login") },
  })

  registerCommand({
    name: "logout",
    description: "Logout from Supabase",
    execute: async () => { await a().logout() },
  })

  registerCommand({
    name: "connect",
    description: "Connect to a database.  `connect postgres://user@host/db`,  `connect <saved-name>`",
    execute: async (args) => {
      const connCtx = c()
      if (!connCtx) return
      const input = args.trim()
      if (!input) { b().open("connections"); return }
      if (/^postgres(ql)?:\/\//i.test(input)) {
        const ok = await connCtx.connectPostgresUrl(input)
        if (!ok) b().open("connections")
        return
      }
      const ok = await connCtx.connectSavedProfile(input)
      if (!ok) b().open("connections")
    },
  })

  registerCommand({
    name: "connections",
    alias: ["conn", "dbs"],
    description: "Manage database connections (saved profiles, new postgres connection)",
    execute: () => { b().open("connections") },
  })

  registerCommand({
    name: "import",
    description: "Import Supabase projects as home-page connections (across accounts)",
    execute: () => { b().open("import") },
  })

  registerCommand({
    name: "disconnect",
    alias: ["connoff"],
    description: "Disconnect from the active database",
    execute: async () => {
      await c()?.disconnect()
    },
  })

  registerCommand({
    name: "account",
    alias: ["about", "version"],
    description: "View version and update status",
    execute: () => { b().open("account") },
  })

  registerCommand({
    name: "update",
    alias: ["upgrade-cli", "self-update"],
    description: "Check for and apply surp updates from GitHub Releases",
    execute: async () => {
      const { checkForUpdate, performUpdate } = await import("../update/updater")
      const result = await checkForUpdate()
      if (!result.available) {
        b().open("account", {}, "About")
        return
      }
      await performUpdate(result as any)
      b().open("account", {}, "About")
    },
  })

  registerCommand({
    name: "check-update",
    alias: ["cu"],
    description: "Check if a newer version of surp is available",
    execute: async () => {
      const { checkForUpdate } = await import("../update/updater")
      const result = await checkForUpdate()
      b().open("account", {
        updateAvailable: String(result.available),
        currentVersion: result.currentVersion,
        ...(result.available ? { newVersion: (result as any).manifest.version } : {}),
      }, "About")
    },
  })

  registerCommand({
    name: "schema",
    description: "Open schema visualizer.  `schema <name>` or `schema <ref> <name>`",
    execute: async (args) => {
      const active = b().activeBuffer()
      const parts = args.trim().split(/\s+/).filter(Boolean)
      const target = parts.length >= 2
        ? await resolveTarget(parts[0]!)
        : await resolveTarget("")
      if (target === null) { openConnections(); return }
      const schema = parts.length >= 2
        ? parts[1]!
        : (parts[0] ?? String(active?.data?.["schema"] ?? "public"))
      b().open("schema", { ...(target ? { project: target } : {}), schema }, `Schema: ${schema}`)
    },
  })

  registerCommand({
    name: "functions",
    alias: ["fns"],
    description: "Open edge functions list for a project",
    execute: async (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      const target = await resolveTarget(project)
      if (target === null) { openConnections(); return }
      if (target) b().open("functions", { project: target })
    },
  })

  registerCommand({
    name: "create-function",
    alias: ["newfn"],
    description: "Create a new edge function for a project",
    execute: async (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      const target = await resolveTarget(project)
      if (target === null) { openConnections(); return }
      if (target) b().open("add-function", { project: target })
    },
  })

  registerCommand({
    name: "storage",
    alias: ["st"],
    description: "Open storage buckets for the active connection",
    execute: async (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      const target = await resolveTarget(project)
      if (target === null) { openConnections(); return }
      b().open("storage", target ? { project: target } : undefined, target ? `Storage: ${target}` : "Storage")
    },
  })

  registerCommand({
    name: "create-bucket",
    alias: ["newbucket"],
    description: "Create a new storage bucket",
    execute: async (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      const target = await resolveTarget(project)
      if (target === null || !c()?.active()) { openConnections(); return }
      b().open("create-bucket", target ? { project: target } : undefined)
    },
  })

  registerCommand({
    name: "logs",
    description: "Open logs viewer for a project",
    execute: async (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      const target = await resolveTarget(project)
      if (target === null) { openConnections(); return }
      if (target) b().open("logs", { project: target }, `Logs: ${target}`)
    },
  })

  registerCommand({
    name: "lint",
    description: "Run SQL linter (splinter) on the active database",
    execute: async (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      const target = await resolveTarget(project)
      if (target === null) { openConnections(); return }
      b().open("lint", target ? { project: target } : undefined)
    },
  })

  registerCommand({
    name: "settings",
    alias: ["config"],
    description: "Open project settings / configuration",
    execute: async (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      const projectName = active?.data?.["projectName"] ?? project
      const target = await resolveTarget(project)
      if (target === null) { openConnections(); return }
      if (target) b().open("settings", { project: target, projectName }, projectName || target)
    },
  })

  registerCommand({
    name: "quit",
    alias: ["q", "qa"],
    description: "Quit surp",
    execute: () => { _destroy?.() },
  })

  registerCommand({
    name: "close",
    alias: ["bd", "bdelete"],
    description: "Close current buffer",
    execute: () => {
      const buf = b().activeBuffer()
      if (buf) b().close(buf.id)
    },
  })

  registerCommand({
    name: "auth-config",
    alias: ["authcfg"],
    description: "Open Supabase Auth configuration for a project",
    execute: async (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      const target = await resolveTarget(project)
      if (target === null) { openConnections(); return }
      if (target) b().open("auth-config", { project: target })
    },
  })

  registerCommand({
    name: "users",
    alias: ["authusers", "ausers", "auser"],
    description: "List/detail auth users.  `users` on active connection,  `users <userId>` detail",
    execute: async (args) => {
      const active = b().activeBuffer()
      const parts = args.trim().split(/\s+/)
      const project = parts.length > 1 ? parts[0]! : ""
      const userId = parts.length > 1 ? parts[1] : parts[0]
      const target = await resolveTarget(project)
      if (target === null || !c()?.active()) { openConnections(); return }
      if (userId) {
        b().open("auth-user", { project: target, userId }, `User: ${userId.slice(0, 8)}`)
      } else {
        b().open("users", { project: target })
      }
    },
  })

  registerCommand({
    name: "project-config",
    alias: ["pconfig", "cfg"],
    description: "Show project configuration",
    execute: async (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      const target = await resolveTarget(project)
      if (target === null) { openConnections(); return }
      if (target) b().open("project-config", { project: target })
    },
  })

  registerCommand({
    name: "providers",
    alias: ["authproviders"],
    description: "Show auth providers configuration for a project",
    execute: async (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      const target = await resolveTarget(project)
      if (target === null) { openConnections(); return }
      if (target) b().open("providers", { project: target })
    },
  })

  registerCommand({
    name: "vsplit",
    alias: ["vs"],
    description: "Vertical split (open projects in new pane)",
    execute: () => { b().open("projects") },
  })

  registerCommand({
    name: "theme",
    alias: ["colorscheme", "colourscheme"],
    description: "Switch theme (:theme <name>, or :theme alone for picker)",
    execute: async (args) => {
      const name = args.trim()
      if (!name) {
        const { setActivePicker } = await import("./picker-state")
        setActivePicker("theme")
        return
      }
      const { loadTheme } = await import("../ui/theme")
      const { saveConfig } = await import("../config")
      const ok = await loadTheme(name)
      if (ok) {
        await saveConfig({ theme: name })
      }
    },
  })

  registerCommand({
    name: "cursor",
    alias: ["cursor-theme"],
    description: "Pick a cursor style (:cursor alone for picker)",
    execute: async () => {
      const { setActivePicker } = await import("./picker-state")
      setActivePicker("cursor")
    },
  })
}
