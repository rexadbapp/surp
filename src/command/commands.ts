import { registerCommand } from "./registry"
import type { BuffersContextValue } from "../context/buffers"
import type { AuthContextValue } from "../context/auth"
import type { ModeContextValue } from "../context/mode"

let _buffers: BuffersContextValue | null = null
let _auth: AuthContextValue | null = null
let _mode: ModeContextValue | null = null
let _destroy: (() => void) | null = null

export function setDestroyer(fn: () => void) {
  _destroy = fn
}

export function initCommands(
  buffers: BuffersContextValue,
  auth: AuthContextValue,
  mode: ModeContextValue,
) {
  _buffers = buffers
  _auth = auth
  _mode = mode
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
    description: "Open project home page",
    execute: (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      const projectName = active?.data?.["projectName"] ?? project
      if (project) b().open("home", { project, projectName }, projectName)
    },
  })

  registerCommand({
    name: "tables",
    description: "Open tables browser for a project",
    execute: (args) => {
      const active = b().activeBuffer()
      const [project, schema] = args.split(/\s+/)
      const ref = project || (active?.data?.["project"] ?? "")
      const sch = schema || (active?.data?.["schema"] ?? "public")
      if (ref) b().open("tables", { project: ref, schema: sch })
    },
  })

  registerCommand({
    name: "sql",
    description: "Open SQL editor",
    execute: (args) => {
      const [project] = args.split(/\s+/)
      b().open("sql", project ? { project } : undefined)
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
    description: "Open schema visualizer for the current project",
    execute: (args) => {
      const active = b().activeBuffer()
      const parts = args.trim().split(/\s+/)
      const project = parts[0] || String(active?.data?.["project"] ?? "")
      const schema  = parts[1] || String(active?.data?.["schema"]  ?? "public")
      if (project) b().open("schema", { project, schema }, `Schema: ${schema}`)
    },
  })

  registerCommand({
    name: "functions",
    alias: ["fns"],
    description: "Open edge functions list for a project",
    execute: (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      if (project) b().open("functions", { project })
    },
  })

  registerCommand({
    name: "create-function",
    alias: ["newfn"],
    description: "Create a new edge function for a project",
    execute: (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      if (project) b().open("add-function", { project })
    },
  })

  registerCommand({
    name: "storage",
    alias: ["st"],
    description: "Open storage buckets for a project",
    execute: (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      if (project) b().open("storage", { project }, `Storage: ${project}`)
    },
  })

  registerCommand({
    name: "create-bucket",
    alias: ["newbucket"],
    description: "Create a new storage bucket",
    execute: (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      if (project) b().open("create-bucket", { project })
    },
  })

  registerCommand({
    name: "logs",
    description: "Open logs viewer for a project",
    execute: (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      if (project) b().open("logs", { project }, `Logs: ${project}`)
    },
  })

  registerCommand({
    name: "lint",
    description: "Run Supabase linter (splinter) on a project",
    execute: (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      b().open("lint", project ? { project } : undefined)
    },
  })

  registerCommand({
    name: "settings",
    alias: ["config"],
    description: "Open project settings / configuration",
    execute: (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      const projectName = active?.data?.["projectName"] ?? project
      if (project) b().open("settings", { project, projectName }, projectName)
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
    execute: (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      if (project) b().open("auth-config", { project })
    },
  })

  registerCommand({
    name: "users",
    alias: ["authusers", "ausers", "auser"],
    description: "List/detail auth users for a project.  `users <project>` list,  `users <project> <userId>` detail",
    execute: (args) => {
      const active = b().activeBuffer()
      const parts = args.trim().split(/\s+/)
      const project = parts[0] || (active?.data?.["project"] ?? "")
      const userId = parts[1]
      if (!project) return
      if (userId) {
        b().open("auth-user", { project, userId }, `User: ${userId.slice(0, 8)}`)
      } else {
        b().open("users", { project })
      }
    },
  })

  registerCommand({
    name: "project-config",
    alias: ["pconfig", "cfg"],
    description: "Show project configuration",
    execute: (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      if (project) b().open("project-config", { project })
    },
  })

  registerCommand({
    name: "providers",
    alias: ["authproviders"],
    description: "Show auth providers configuration for a project",
    execute: (args) => {
      const active = b().activeBuffer()
      const project = args.trim() || (active?.data?.["project"] ?? "")
      if (project) b().open("providers", { project })
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
