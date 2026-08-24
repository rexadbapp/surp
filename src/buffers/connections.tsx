import { createSignal, For, Show, onMount, onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent, PasteEvent } from "@opentui/core"
import { useConnection } from "../context/connection"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import { useMode } from "../context/mode"
import { parsePostgresUrl, describePostgresOptions } from "../connections/url"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"
import { hoverProps, isHovered } from "../ui/hover"

type Mode = "list" | "form" | "url"

interface FieldDef {
  key: string
  label: string
  kind: "text" | "password" | "toggle"
  placeholder?: string
}

const FIELDS: FieldDef[] = [
  { key: "name",     label: "Name",       kind: "text",     placeholder: "(optional)" },
  { key: "host",     label: "Host / URL", kind: "text",     placeholder: "host or postgres://…" },
  { key: "port",     label: "Port",       kind: "text",     placeholder: "5432" },
  { key: "user",     label: "User",       kind: "text",     placeholder: "postgres" },
  { key: "password", label: "Password",   kind: "password" },
  { key: "database", label: "Database",   kind: "text",     placeholder: "postgres" },
  { key: "ssl",      label: "SSL",        kind: "toggle" },
  { key: "save",     label: "Save",       kind: "toggle" },
]

export function ConnectionsBuffer(props: BufferProps) {
  const connCtx = useConnection()
  const buffers = useBuffers()
  const keymap  = useKeymap()
  const mode    = useMode()
  const renderer = useRenderer()

  const initialMode: Mode = props.meta.data?.["mode"] === "form" || props.meta.data?.["mode"] === "url"
    ? (props.meta.data["mode"] as Mode)
    : "list"
  const [uiMode, setUiMode] = createSignal<Mode>(initialMode)
  const [cursor, setCursor] = createSignal(0)
  const [fieldIdx, setFieldIdx] = createSignal(0)
  const [values, setValues] = createSignal<Record<string, string>>({
    name: "", host: "", port: "", user: "", password: "", database: "", ssl: "no", save: "yes",
  })
  const [urlValue, setUrlValue] = createSignal("")
  const [urlSave, setUrlSave] = createSignal(true)

  /** list rows: 0 = new form, 1 = paste URL, then saved profiles */
  const PROFILE_OFFSET = 2

  const profiles = () => connCtx.savedProfiles()
  const activeConn = () => connCtx.active()

  // ── list actions ─────────────────────────────────────────────
  async function connectSelected() {
    const idx = cursor()
    if (idx === 0) {
      setUiMode("form")
      setFieldIdx(0)
      mode.enterInsert()
      return
    }
    if (idx === 1) {
      setUrlValue("")
      setUrlSave(true)
      setUiMode("url")
      mode.enterInsert()
      return
    }
    const p = profiles()[idx - PROFILE_OFFSET]
    if (!p) return
    const ok = await connCtx.connectSavedProfile(p.name)
    if (ok) buffers.close(props.meta.id)
  }

  function deleteSelected() {
    const p = profiles()[cursor() - PROFILE_OFFSET]
    if (p) void connCtx.deleteSavedProfile(p.id)
  }

  // ── form submit ──────────────────────────────────────────────
  async function submitForm() {
    const v = values()
    const urlish = v.host!.trim()
    if (!urlish) return
    const opts = {
      name: v.name!.trim() || undefined,
      save: v.save === "yes",
    }
    let ok: boolean
    if (/^postgres(ql)?:\/\//i.test(urlish)) {
      ok = await connCtx.connectPostgresUrl(urlish, opts)
    } else {
      ok = await connCtx.connectPostgresForm({
        ...opts,
        host: urlish,
        port: v.port! ? Number(v.port) : undefined,
        user: v.user!.trim() || undefined,
        password: v.password || undefined,
        database: v.database!.trim() || undefined,
        ssl: v.ssl === "yes",
      })
    }
    if (ok) {
      setUiMode("list")
      mode.enterNormal()
      buffers.close(props.meta.id)
    }
  }

  function cancelForm() {
    setUiMode("list")
    mode.enterNormal()
    setValues({ name: "", host: "", port: "", user: "", password: "", database: "", ssl: "no", save: "yes" })
  }

  /**
   * Paste a full DSN into Host/URL → every other field fills itself,
   * and the name is auto-derived (user@host:port/db) unless already set.
   */
  function autoFillFromHostUrl() {
    const raw = values().host ?? ""
    if (!/^postgres(ql)?:\/\//i.test(raw)) return
    const parsed = parsePostgresUrl(raw)
    if (!parsed) return
    setValues((v) => ({
      ...v,
      host: parsed.host ?? v.host,
      port: parsed.port != null ? String(parsed.port) : v.port,
      user: parsed.user ?? v.user,
      password: parsed.password ?? v.password,
      database: parsed.database ?? v.database,
      ssl: parsed.ssl != null ? (parsed.ssl ? "yes" : "no") : v.ssl,
      name: v.name || describePostgresOptions(parsed),
    }))
  }

  /** Auto-generated profile name for the URL paste mode */
  const urlAutoName = (): string | null => {
    const parsed = parsePostgresUrl(urlValue())
    return parsed ? describePostgresOptions(parsed) : null
  }

  // ── url (paste DSN) submit ───────────────────────────────────
  async function submitUrl() {
    const raw = urlValue().trim()
    if (!raw) return
    const ok = await connCtx.connectPostgresUrl(raw, { save: urlSave() })
    if (ok) {
      setUiMode("list")
      mode.enterNormal()
      setUrlValue("")
      buffers.close(props.meta.id)
    }
    // on failure connCtx.error() renders and the field stays editable
  }

  function cancelUrl() {
    setUiMode("list")
    mode.enterNormal()
    setUrlValue("")
  }

  // ── keymaps (list mode only) ─────────────────────────────────
  keymap.onAction("move_down", () => {
    if (!props.focused || uiMode() !== "list") return
    setCursor((c) => Math.min(profiles().length + 1, c + 1))
  })
  keymap.onAction("move_up", () => {
    if (!props.focused || uiMode() !== "list") return
    setCursor((c) => Math.max(0, c - 1))
  })
  keymap.onAction("select", () => {
    if (!props.focused || uiMode() !== "list") return
    void connectSelected()
  })
  keymap.onAction("delete", () => {
    if (!props.focused || uiMode() !== "list") return
    deleteSelected()
  })
  keymap.onAction("escape", () => {
    if (!props.focused || uiMode() !== "list") return
    buffers.close(props.meta.id)
  })

  // raw typing in form fields + disconnect shortcut.
  // Form mode runs in insert mode so the vim keymap stays out of the way;
  // all keys are handled here.
  onMount(() => {
    // deep-linked modes (from the home page cards) start in insert
    if (uiMode() !== "list") mode.enterInsert()
    const kh = renderer.keyInput
    function onKey(e: KeyEvent) {
      if (!props.focused) return

      // While a global mode is active (command palette etc.) it owns the
      // keyboard — list shortcuts like 'n'/'u'/'x' must not steal keystrokes.
      if (uiMode() === "list" && !mode.is("normal")) return

      // Enter can arrive as "return", "enter", or "linefeed" (\n) depending on
      // terminal/tty CR/LF translation — accept all of them.
      const isEnter = e.name === "return" || e.name === "enter" || e.name === "linefeed" || e.sequence === "\r" || e.sequence === "\n"

      // disconnect from anywhere in this buffer
      if (e.name === "x" && !e.ctrl && !e.meta && activeConn() && uiMode() === "list") {
        void connCtx.disconnect()
        return
      }

      // quick shortcuts from the list
      if (uiMode() === "list" && e.name.length === 1 && !e.ctrl && !e.meta) {
        if (e.name === "u") {
          setUrlValue("")
          setUrlSave(true)
          setUiMode("url")
          mode.enterInsert()
          return
        }
        if (e.name === "n") {
          setUiMode("form")
          setFieldIdx(0)
          mode.enterInsert()
          return
        }
      }

      // ── URL paste mode: one field, enter to connect ──────────
      if (uiMode() === "url") {
        if (isEnter && !e.ctrl && !e.meta) {
          e.stopPropagation?.()
          void submitUrl()
          return
        }
        if (e.name === "escape" && !e.ctrl && !e.meta) {
          e.stopPropagation?.()
          cancelUrl()
          return
        }
        if (e.name === "tab" && !e.ctrl && !e.meta) {
          e.stopPropagation?.()
          setUrlSave((s) => !s)
          return
        }
        if ((e.name === "backspace" || e.name === "delete") && !e.ctrl && !e.meta) {
          setUrlValue((v) => v.slice(0, -1))
          e.stopPropagation?.()
          return
        }
        if (e.name.length === 1 && !e.ctrl && !e.meta) {
          const ch = e.shift ? e.name.toUpperCase() : e.name
          setUrlValue((v) => v + ch)
          e.stopPropagation?.()
        }
        return
      }

      if (uiMode() !== "form") return

      const field = FIELDS[fieldIdx()]!
      const key = field.key

      if (isEnter && !e.ctrl && !e.meta) {
        e.stopPropagation?.()
        void submitForm()
        return
      }
      if (e.name === "escape" && !e.ctrl && !e.meta) {
        e.stopPropagation?.()
        cancelForm()
        return
      }
      if ((e.name === "tab") && !e.ctrl && !e.meta) {
        e.shift ? setFieldIdx((i) => Math.max(0, i - 1)) : setFieldIdx((i) => Math.min(FIELDS.length - 1, i + 1))
        e.stopPropagation?.()
        return
      }
      if (field.kind === "toggle" && (e.name === "space" || e.sequence === " ")) {
        setValues((v) => ({ ...v, [key]: v[key] === "yes" ? "no" : "yes" }))
        e.stopPropagation?.()
        return
      }
      if ((e.name === "backspace" || e.name === "delete") && !e.ctrl && !e.meta && field.kind !== "toggle") {
        setValues((v) => ({ ...v, [key]: (v[key] ?? "").slice(0, -1) }))
        if (key === "host") autoFillFromHostUrl()
        e.stopPropagation?.()
        return
      }
      if (e.name.length === 1 && !e.ctrl && !e.meta && field.kind !== "toggle") {
        const ch = e.shift ? e.name.toUpperCase() : e.name
        setValues((v) => ({ ...v, [key]: (v[key] ?? "") + ch }))
        if (key === "host") autoFillFromHostUrl()
        e.stopPropagation?.()
      }
    }
    kh.on("keypress", onKey)

    // cmd+v / ctrl+v → terminal bracketed paste arrives as a dedicated event
    const decoder = new TextDecoder()
    function onPaste(event: PasteEvent) {
      if (!props.focused) return
      const text = decoder.decode(event.bytes)
      if (!text) return
      if (uiMode() === "url") {
        setUrlValue((v) => v + text)
        event.preventDefault()
      } else if (uiMode() === "form") {
        const field = FIELDS[fieldIdx()]!
        if (field.kind === "toggle") return
        setValues((v) => ({ ...v, [field.key]: (v[field.key] ?? "") + text }))
        if (field.key === "host") autoFillFromHostUrl()
        event.preventDefault()
      }
    }
    kh.on("paste", onPaste)

    onCleanup(() => {
      kh.off("keypress", onKey)
      kh.off("paste", onPaste)
    })
  })

  const formW = () => Math.min(64, Math.max(40, props.width - 8))

  /** Long DSNs scroll from the right so the tail (db name) stays visible */
  function displayUrl(): string {
    const v = urlValue()
    const max = Math.max(10, formW() - 10)
    return v.length > max ? "…" + v.slice(v.length - max + 1) : v
  }

  function fieldValue(field: FieldDef): string {
    const raw = values()[field.key] ?? ""
    if (field.kind === "password" && raw) return "•".repeat(Math.min(raw.length, 16))
    if (field.kind === "toggle") return raw === "yes" ? "enabled" : "disabled"
    return raw
  }

  function fieldFg(field: FieldDef): string {
    const filled = (values()[field.key] ?? "").length > 0
    if (field.kind === "toggle") return values()[field.key] === "yes" ? COLORS.green : COLORS.muted
    return filled ? COLORS.text : COLORS.muted
  }

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>

      {/* Header */}
      <box paddingLeft={1} height={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.teal} attributes={1}>Connections  </text>
        <Show when={activeConn()}>
          {(c) => (
            <>
              <text fg={c().kind === "postgres" ? COLORS.blue : COLORS.green}>● </text>
              <text fg={COLORS.text}>{c().label}</text>
              <text fg={COLORS.muted}>  ·  x disconnect</text>
            </>
          )}
        </Show>
        <Show when={!activeConn()}>
          <text fg={COLORS.muted}>not connected</text>
        </Show>
      </box>

      <Show when={connCtx.error()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.red}>{connCtx.error()}</text>
        </box>
      </Show>
      <Show when={connCtx.connecting()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.yellow}>connecting…</text>
        </box>
      </Show>

      {/* ── List mode ─────────────────────────────────────────── */}
      <Show when={uiMode() === "list"}>
        <For each={["__new", "__url", ...profiles().map((p) => p.id)]}>
          {(_, i) => {
            const active = () => props.focused && i() === cursor()
            const id = () => i() === 0 ? "conn-row-new" : i() === 1 ? "conn-row-url" : `conn-row-${profiles()[i() - PROFILE_OFFSET]!.id}`
            const hovered = () => isHovered(id())
            if (i() === 0) {
              return (
                <box
                  flexDirection="row" paddingLeft={1} height={1}
                  backgroundColor={active() ? COLORS.overlay : hovered() ? COLORS.surface : COLORS.background}
                  {...hoverProps(id(), "Create a new connection (field-by-field)")}
                  onMouseUp={() => setCursor(0)}
                >
                  <text fg={COLORS.green}>{active() ? "▶ " : "  "}+ new connection…</text>
                  <text fg={COLORS.muted}>  (n)</text>
                </box>
              )
            }
            if (i() === 1) {
              return (
                <box
                  flexDirection="row" paddingLeft={1} height={1}
                  backgroundColor={active() ? COLORS.overlay : hovered() ? COLORS.surface : COLORS.background}
                  {...hoverProps(id(), "Paste a postgres:// connection string")}
                  onMouseUp={() => { setCursor(1); void connectSelected() }}
                >
                  <text fg={COLORS.teal}>{active() ? "▶ " : "  "}+ paste connection string…</text>
                  <text fg={COLORS.muted}>  (u)</text>
                </box>
              )
            }
            const p = () => profiles()[i() - PROFILE_OFFSET]!
            const isConnected = () => connCtx.active()?.id === p().id
            return (
              <box
                flexDirection="row" paddingLeft={1} height={1}
                backgroundColor={active() ? COLORS.overlay : hovered() ? COLORS.surface : COLORS.background}
                {...hoverProps(id(), `↵ connect to ${p().name}`)}
                onMouseUp={() => { setCursor(i()); void connectSelected() }}
              >
                <text fg={active() ? COLORS.blue : COLORS.text} width={28}>
                  {active() ? "▶ " : "  "}{p().name}
                </text>
                <Show when={isConnected()}>
                  <text fg={COLORS.green}>● </text>
                </Show>
                <text fg={COLORS.subtext}>
                  {p().user ? `${p().user}@` : ""}{p().host}{p().database ? `/${p().database}` : ""}
                </text>
              </box>
            )
          }}
        </For>

        {/* Disconnect row when connected */}
        <Show when={activeConn()}>
          <box height={1} />
          <box paddingLeft={1} height={1}>
            <text fg={COLORS.muted}>press x to disconnect from {activeConn()!.label}</text>
          </box>
        </Show>

        <box height={1} marginTop={1} paddingLeft={1} backgroundColor={COLORS.surface}>
          <text fg={COLORS.muted}>↵ connect · u paste URL · n new form · d delete · esc close</text>
        </box>
      </Show>

      {/* ── URL paste mode ────────────────────────────────────── */}
      <Show when={uiMode() === "url"}>
        <box flexDirection="column" paddingLeft={2} paddingTop={1} width={formW()}>
          <box height={1}>
            <text fg={COLORS.mauve} attributes={1}>Paste connection string</text>
          </box>
          <box height={1}><text fg={COLORS.muted}>postgres://user:pass@host:5432/db?sslmode=disable</text></box>
          <box height={1} />
          <box flexDirection="row" height={1} {...hoverProps("conn-field-dsn")}>
            <text fg={COLORS.text}>DSN  </text>
            <text fg={urlValue() ? COLORS.text : COLORS.muted}>
              {displayUrl()}{urlValue() ? "" : " paste here"}█
            </text>
          </box>
          <box height={1} />
          <box flexDirection="row" height={1}>
            <text fg={COLORS.text} width={14}>Save profile</text>
            <text fg={urlSave() ? COLORS.green : COLORS.muted}>{urlSave() ? "yes" : "no"}</text>
            <text fg={COLORS.muted}>  tab to toggle</text>
          </box>
          <Show when={urlSave() && urlAutoName()}>
            <box flexDirection="row" height={1}>
              <text fg={COLORS.muted} width={14}> </text>
              <text fg={COLORS.teal}>↳ {urlAutoName()}</text>
            </box>
          </Show>
          <box height={1} />
          <box height={1}>
            <text fg={COLORS.muted}>↵ connect · tab toggle save · esc cancel</text>
          </box>
        </box>
      </Show>

      {/* ── Form mode ─────────────────────────────────────────── */}
      <Show when={uiMode() === "form"}>
        <box flexDirection="column" paddingLeft={2} paddingTop={1} width={formW()}>
          <box height={1} paddingBottom={0}>
            <text fg={COLORS.mauve} attributes={1}>New Postgres connection</text>
          </box>
          <box height={1}><text fg={COLORS.muted}>tip: paste a postgres:// URL into Host/URL</text></box>
          <box height={1} />
          <For each={FIELDS}>
            {(field, i) => {
              const isActive = () => i() === fieldIdx()
              return (
                <box flexDirection="row" height={1} {...hoverProps(`conn-field-${field.key}`)}>
                  <box width={14} height={1}>
                    <text fg={isActive() ? COLORS.yellow : COLORS.text} attributes={isActive() ? 1 : 0}>
                      {field.label}
                    </text>
                  </box>
                  <box
                    width={formW() - 14} height={1}
                    backgroundColor={isActive() ? COLORS.overlay : COLORS.surface}
                    paddingLeft={1}
                    onMouseUp={() => setFieldIdx(i())}
                  >
                    <text fg={fieldFg(field)}>
                      {fieldValue(field)}
                      {field.kind === "toggle"
                        ? ""
                        : !(values()[field.key] ?? "").length
                          ? ` ${field.placeholder ?? ""}`
                          : ""}
                      {isActive() ? "█" : ""}
                    </text>
                  </box>
                </box>
              )
            }}
          </For>
          <box height={1} />
          <box height={1}>
            <text fg={COLORS.muted}>tab next field · space toggle · ↵ connect · esc cancel</text>
          </box>
        </box>
      </Show>

    </box>
  )
}
