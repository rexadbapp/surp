import path from "node:path"
import { homedir } from "node:os"
import { createSignal } from "solid-js"
import type { KeyEvent, PasteEvent } from "@opentui/core"
import type { AuthPrompt, AuthInteraction } from "@earendil-works/pi-ai"
import { ModelRuntime } from "@earendil-works/pi-coding-agent"
import { activePicker, setActivePicker } from "../command/picker-state"
import { setAgentModel, pushAgentNotice } from "./session"

export interface ProviderRow {
  id: string
  name: string
  configured: boolean
  source?: string
}

type Phase = "loading" | "list" | "prompt" | "working" | "done" | "error"

const [phase, setPhase] = createSignal<Phase>("loading")
const [rows, setRows] = createSignal<ProviderRow[]>([])
const [query, setQuery] = createSignal("")
const [selectedIdx, setSelectedIdx] = createSignal(0)
const [offset, setOffset] = createSignal(0)
const [promptMsg, setPromptMsg] = createSignal("")
const [secret, setSecret] = createSignal(false)
const [inputValue, setInputValue] = createSignal("")
const [status, setStatus] = createSignal("")

export function filteredProviders(): ProviderRow[] {
  const q = query().trim().toLowerCase()
  const all = rows()
  if (!q) return all
  return all.filter(
    (r) => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q),
  )
}

export {
  phase as loginPhase,
  query as loginQuery,
  rows as loginProviders,
  selectedIdx as loginSelectedIdx,
  offset as loginOffset,
  promptMsg as loginPromptMsg,
  secret as loginSecret,
  inputValue as loginInputValue,
  status as loginStatus,
}

const HOME = process.env.DBAGENT_HOME ?? path.join(homedir(), ".dbagent")

function isOpen() {
  return activePicker() === "provider-login"
}

export function closeProviderLogin() {
  setActivePicker(null)
}

// ── data ─────────────────────────────────────────────────────────────────────

let runtime: ModelRuntime | null = null

/**
 * Runtime for the dialogs. NOT cached across opens: a fresh create() re-reads
 * auth.json (picks up credentials added externally, e.g. via the pi/kilo CLI)
 * and, with allowModelNetwork, refreshes the model catalog so newly released
 * models show up.
 */
export async function getRuntime(): Promise<ModelRuntime> {
  runtime = await ModelRuntime.create({
    authPath: path.join(HOME, "auth.json"),
    modelsPath: path.join(HOME, "models.json"),
    allowModelNetwork: true,
    modelRefreshTimeoutMs: 10_000,
  })
  return runtime
}

async function readConfiguredModel(): Promise<string | undefined> {
  const fromEnv = process.env.DBAGENT_MODEL ?? process.env.SURP_AGENT_MODEL
  if (fromEnv) return fromEnv
  try {
    const { readFile } = await import("node:fs/promises")
    const raw = JSON.parse(await readFile(path.join(HOME, "config.json"), "utf8")) as { model?: string }
    return raw.model || undefined
  } catch {
    return undefined
  }
}

// ── open / flow ──────────────────────────────────────────────────────────────

class CancelledError extends Error {}

interface PendingPrompt {
  resolve: (value: string) => void
  reject: (reason?: unknown) => void
}
let pending: PendingPrompt | null = null
let flowToken = 0

function setError(message: string) {
  setStatus(message)
  setPhase("error")
}

export async function openProviderLogin(): Promise<void> {
  setActivePicker("provider-login")
  setPhase("loading")
  setStatus("")
  try {
    const rt = await getRuntime()
    const list: ProviderRow[] = []
    for (const p of rt.getProviders()) {
      if (!p.auth?.apiKey?.login) continue
      const st = rt.getProviderAuthStatus(p.id)
      list.push({ id: p.id, name: p.name ?? p.id, configured: st.configured, source: st.source })
    }
    list.sort((a, b) => Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name))
    setRows(list)
    setQuery("")
    setSelectedIdx(0)
    setOffset(0)
    setPhase("list")
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err))
  }
}

async function startLogin(row: ProviderRow): Promise<void> {
  const token = ++flowToken
  setPhase("working")
  setStatus(`signing in to ${row.name}…`)
  try {
    const rt = await getRuntime()
    await rt.login(row.id, "api_key", {
      prompt: async (p: AuthPrompt) => {
        if (token !== flowToken) throw new CancelledError("cancelled")
        return await ask(p)
      },
      notify: (ev: Parameters<AuthInteraction["notify"]>[0]) => {
        if (token !== flowToken) return
        if ("message" in ev) setStatus(ev.message)
        else if (ev.type === "auth_url") setStatus(`open ${ev.url}`)
      },
    })
    if (token !== flowToken) return
    await afterLogin(rt, row)
  } catch (err) {
    if (token !== flowToken) return
    if (err instanceof CancelledError) {
      setPhase("list")
      setStatus("")
      return
    }
    setError(`${row.name}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function ask(p: AuthPrompt): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject }
    setPromptMsg(p.message)
    setSecret(p.type === "secret")
    setInputValue("")
    setPhase("prompt")
  })
}

async function afterLogin(rt: ModelRuntime, row: ProviderRow): Promise<void> {
  const avail = await rt.getAvailable(row.id)
  const configuredModel = await readConfiguredModel()
  closeProviderLogin()
  if (!configuredModel && avail.length > 0) {
    // First provider ever configured — make it the default so the next
    // message just works. setAgentModel resets the chat itself.
    const err = await setAgentModel(`${row.id}/${avail[0]!.id}`)
    if (err) pushAgentNotice(err, "error")
    return
  }
  pushAgentNotice(
    `logged in to ${row.name} (${row.id})${avail.length > 0 ? ` — ${avail.length} models available` : ""}` +
      (configuredModel ? "" : ""),
  )
}

// ── key handling (singleton, like the palette) ────────────────────────────────

function isPrintable(e: KeyEvent): boolean {
  if (e.name === "space") return !e.ctrl && !e.meta
  return e.name.length === 1 && !e.ctrl && !e.meta
}
function toChar(e: KeyEvent): string {
  if (e.shift && e.name === ";") return ":"
  if (e.shift && e.name.length === 1) return e.name.toUpperCase()
  return e.name
}

const LIST_H = 12

function ensureVisible(): void {
  const n = filteredProviders().length
  if (n === 0) {
    setSelectedIdx(0)
    setOffset(0)
    return
  }
  const c = Math.min(selectedIdx(), n - 1)
  setSelectedIdx(c)
  setOffset((o) => {
    const clamped = Math.min(o, Math.max(0, n - LIST_H))
    if (c < clamped) return c
    if (c >= clamped + LIST_H) return c - LIST_H + 1
    return clamped
  })
}

let installed = false

export function installProviderLoginHandler(kh: {
  on(type: string, fn: (event: any) => void): void
}): void {
  if (installed) return
  installed = true

  function cancelFlow() {
    flowToken++
    const p = pending
    pending = null
    p?.reject(new CancelledError("cancelled"))
  }

  async function onKeypress(raw: KeyEvent) {
    if (!isOpen()) return
    raw.stopPropagation?.()

    const ph = phase()

    if (ph === "prompt") {
      if (raw.name === "escape") {
        const p = pending
        pending = null
        setInputValue("")
        setPhase("list")
        p?.reject(new CancelledError("cancelled"))
        return
      }
      if (raw.name === "return" || raw.name === "enter") {
        const value = inputValue()
        const p = pending
        pending = null
        setInputValue("")
        setPhase("working")
        p?.resolve(value)
        return
      }
      if ((raw.name === "backspace" || raw.name === "delete") && !raw.ctrl && !raw.meta) {
        setInputValue((v) => v.slice(0, -1))
        return
      }
      if (raw.ctrl && raw.name === "u") {
        setInputValue("")
        return
      }
      if (isPrintable(raw)) {
        setInputValue((v) => (v + toChar(raw)).slice(0, 400))
      }
      return
    }

    // list / error / done / loading / working
    if (raw.name === "escape") {
      if (ph === "list" && query()) {
        setQuery("")
        ensureVisible()
        return
      }
      cancelFlow()
      closeProviderLogin()
      return
    }
    if (ph !== "list") return

    if ((raw.name === "backspace" || raw.name === "delete") && !raw.ctrl && !raw.meta) {
      setQuery((q) => q.slice(0, -1))
      ensureVisible()
      return
    }
    if (raw.ctrl && raw.name === "u") {
      setQuery("")
      ensureVisible()
      return
    }
    if (isPrintable(raw)) {
      setQuery((q) => (q + toChar(raw)).slice(0, 60))
      setSelectedIdx(0)
      setOffset(0)
      return
    }
    if (raw.name === "up") {
      setSelectedIdx((c) => Math.max(0, c - 1))
      ensureVisible()
      return
    }
    if (raw.name === "down") {
      setSelectedIdx((c) => Math.min(filteredProviders().length - 1, c + 1))
      ensureVisible()
      return
    }
    if (raw.name === "return" || raw.name === "enter") {
      const view = filteredProviders()
      if (view.length > 0) void startLogin(view[Math.min(selectedIdx(), view.length - 1)]!)
    }
  }

  function onPaste(event: PasteEvent) {
    if (!isOpen()) return
    if (phase() !== "prompt") return
    event.preventDefault?.()
    const text = new TextDecoder().decode(event.bytes).replace(/[\r\n]+/g, "")
    if (text) setInputValue((v) => (v + text).slice(0, 400))
  }

  kh.on("keypress", onKeypress)
  kh.on("paste", onPaste)
}
