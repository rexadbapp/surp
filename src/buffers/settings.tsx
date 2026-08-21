import { createSignal, onMount, onCleanup, Show, For } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import { useAuth } from "../context/auth"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import { useMode } from "../context/mode"
import { useBuffers } from "../context/buffers"
import { getProject, updateProjectName, deleteProjectAPI, type Project } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"
import { HRule } from "../ui/border"

const REGION_NAMES: Record<string, string> = {
  "ap-east-1": "AP East (Hong Kong)",
  "ap-northeast-1": "AP Northeast (Tokyo)",
  "ap-northeast-2": "AP Northeast (Seoul)",
  "ap-south-1": "AP South (Mumbai)",
  "ap-southeast-1": "AP Southeast (Singapore)",
  "ap-southeast-2": "AP Southeast (Sydney)",
  "ca-central-1": "Canada (Central)",
  "eu-central-1": "EU Central (Frankfurt)",
  "eu-north-1": "EU North (Stockholm)",
  "eu-west-1": "EU West (Ireland)",
  "eu-west-2": "EU West (London)",
  "eu-west-3": "EU West (Paris)",
  "sa-east-1": "South America (São Paulo)",
  "us-east-1": "US East (N. Virginia)",
  "us-east-2": "US East (Ohio)",
  "us-west-1": "US West (N. California)",
  "us-west-2": "US West (Oregon)",
}
const STATUS_DOT: Record<string, string> = {
  ACTIVE_HEALTHY: "●", ACTIVE_UNHEALTHY: "●",
  COMING_UP: "◌", GOING_DOWN: "○",
}
const STATUS_LABEL: Record<string, string> = {
  ACTIVE_HEALTHY: "Healthy", ACTIVE_UNHEALTHY: "Unhealthy",
  COMING_UP: "Starting…", GOING_DOWN: "Stopping…",
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    })
  } catch { return iso }
}

export function SettingsBuffer(props: BufferProps) {
  const auth = useAuth()
  const keymap = useKeymap()
  const yank = useYank()
  const renderer = useRenderer()
  const mode = useMode()
  const buffers = useBuffers()

  const ref = () => String(props.meta.data?.["project"] ?? "")
  const projectName = () => String(props.meta.data?.["projectName"] ?? ref())

  const [project, setProject] = createSignal<Project | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [saving, setSaving] = createSignal(false)
  const [saveMsg, setSaveMsg] = createSignal<string | null>(null)
  const [editingName, setEditingName] = createSignal(false)
  const [nameInput, setNameInput] = createSignal("")
  const [deleteConfirm, setDeleteConfirm] = createSignal(false)
  const [deleting, setDeleting] = createSignal(false)
  const [deleteErr, setDeleteErr] = createSignal<string | null>(null)

  async function load(force = false) {
    const token = auth.token()
    const r = ref()
    if (!token || !r) return
    setLoading(true); setError(null)
    try {
      const p = await getProject(token, r)
      setProject(p)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => void load())

  keymap.onAction("refresh", () => { if (props.focused) void load(true) })

  keymap.onAction("yank", () => {
    if (!props.focused) return
    if (editingName() || deleteConfirm()) return
    const p = project()
    if (p) yank.yank(p.id, "ref")
  })

  onMount(() => {
    const kh = renderer.keyInput
    function onKey(event: KeyEvent) {
      if (!props.focused || mode.is("command")) return

      if (editingName()) {
        if (event.name === "escape") { setEditingName(false); setSaveMsg(null); return }
        if (event.name === "return" || event.name === "enter") { void handleSaveName(); return }
        if (event.name === "backspace") { setNameInput(c => c.slice(0, -1)); return }
        if (event.name.length === 1 && !event.ctrl && !event.meta) {
          setNameInput(c => c + event.name)
        }
        return
      }

      if (deleteConfirm()) {
        if (event.name === "y") { void handleDelete(); return }
        if (event.name === "n" || event.name === "escape") { setDeleteConfirm(false); setDeleteErr(null); return }
        return
      }

      if (event.name === "e") { startEditName(); return }
      if (event.name === "d") { setDeleteConfirm(true); return }
    }
    kh.on("keypress", onKey)
    onCleanup(() => kh.off("keypress", onKey))
  })

  function startEditName() {
    const p = project()
    if (!p) return
    setNameInput(p.name)
    setEditingName(true)
    setSaveMsg(null)
  }

  async function handleSaveName() {
    const token = auth.token()
    const r = ref()
    const name = nameInput().trim()
    if (!token || !r || !name) return
    setSaving(true); setSaveMsg(null)
    try {
      const p = await updateProjectName(token, r, name)
      setProject(p)
      setEditingName(false)
      setSaveMsg("Project name updated")
    } catch (e) {
      setSaveMsg(`Error: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const token = auth.token()
    const r = ref()
    if (!token || !r) return
    setDeleting(true); setDeleteErr(null)
    try {
      await deleteProjectAPI(token, r)
      buffers.close(props.meta.id)
    } catch (e) {
      setDeleteErr(String(e))
      setDeleting(false)
    }
  }

  const actions = () => {
    const items: { key: string; desc: string }[] = []
    if (!editingName() && !deleteConfirm()) {
      items.push({ key: "e", desc: "Edit project name" })
      items.push({ key: "y", desc: "Copy project ref" })
      items.push({ key: "r", desc: "Refresh" })
      items.push({ key: "d", desc: "Delete project" })
    }
    return items
  }

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      <box height={1} paddingLeft={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.peach} attributes={1}>settings  </text>
        <text fg={COLORS.text}>{projectName()}</text>
        <Show when={loading()}>
          <text fg={COLORS.yellow}>  loading…</text>
        </Show>
        <Show when={saving()}>
          <text fg={COLORS.yellow}>  saving…</text>
        </Show>
      </box>

      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.red}>{error()}</text>
        </box>
      </Show>

      <Show when={saveMsg() && !editingName()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={saveMsg()!.startsWith("Error") ? COLORS.red : COLORS.green}>{saveMsg()}</text>
        </box>
      </Show>

      <Show when={project()}>
        {(p) => {
          const region = () => REGION_NAMES[p().region] ?? p().region
          const dbVer = () => p().database?.version ?? "—"
          const dbEng = () => p().database?.postgres_engine ?? ""

          return (
            <Show when={!editingName() && !deleteConfirm()}>
              <box flexDirection="column" paddingLeft={2} paddingTop={1} width={props.width}>
                <text fg={COLORS.blue} attributes={1}>General</text>
                <box height={1} />

                <box flexDirection="row" height={1}>
                  <text fg={COLORS.muted} width={16}>Name:</text>
                  <text fg={COLORS.text}>{p().name}</text>
                </box>
                <box flexDirection="row" height={1}>
                  <text fg={COLORS.muted} width={16}>Project ID:</text>
                  <text fg={COLORS.yellow}>{p().id}</text>
                  <text fg={COLORS.muted}>  (y: copy)</text>
                </box>
                <box flexDirection="row" height={1}>
                  <text fg={COLORS.muted} width={16}>Region:</text>
                  <text fg={COLORS.text}>{region()}</text>
                </box>
                <box flexDirection="row" height={1}>
                  <text fg={COLORS.muted} width={16}>Status:</text>
                  <text fg={COLORS.green}>{STATUS_DOT[p().status] ?? "●"} {STATUS_LABEL[p().status] ?? p().status}</text>
                </box>
                <box flexDirection="row" height={1}>
                  <text fg={COLORS.muted} width={16}>Postgres:</text>
                  <text fg={COLORS.text}>{dbVer()}</text>
                  <Show when={dbEng()}>
                    <text fg={COLORS.subtext}>  ({dbEng()})</text>
                  </Show>
                </box>
                <box flexDirection="row" height={1}>
                  <text fg={COLORS.muted} width={16}>Created:</text>
                  <text fg={COLORS.text}>{formatDate(p().created_at)}</text>
                </box>

                <box height={1} />
                <HRule width={props.width - 4} />
                <box height={1} />

                <text fg={COLORS.red} attributes={1}>Danger Zone</text>
                <box height={1} />

                <box flexDirection="row" height={1}>
                  <text fg={COLORS.yellow} width={24}>d</text>
                  <text fg={COLORS.text}>Delete this project</text>
                </box>

                <box height={1} />
                <HRule width={props.width - 4} />
                <box height={1} />

                <text fg={COLORS.blue} attributes={1}>Actions</text>
                <box height={1} />
                <For each={actions()}>
                  {(a) => (
                    <box flexDirection="row" height={1}>
                      <text fg={COLORS.yellow} width={24}>{a.key}</text>
                      <text fg={COLORS.text}>{a.desc}</text>
                    </box>
                  )}
                </For>
              </box>
            </Show>
          )
        }}
      </Show>

      <Show when={editingName()}>
        <box flexDirection="column" paddingLeft={3} paddingTop={2}>
          <text fg={COLORS.blue} attributes={1}>Edit project name</text>
          <box height={1} />
          <box flexDirection="row" height={1}>
            <text fg={COLORS.muted} width={8}>Name:</text>
            <box width={40} height={1} backgroundColor={COLORS.overlay} paddingLeft={1}>
              <text fg={nameInput() ? COLORS.text : COLORS.muted}>
                {nameInput() || "project name"}{"█"}
              </text>
            </box>
          </box>
          <box height={1} />
          <Show when={saveMsg()}>
            <box height={1}>
              <text fg={saveMsg()!.startsWith("Error") ? COLORS.red : COLORS.green}>{saveMsg()}</text>
            </box>
            <box height={1} />
          </Show>
          <text fg={COLORS.muted}>Enter to save · Esc to cancel</text>
        </box>
      </Show>

      <Show when={deleteConfirm()}>
        <box flexDirection="column" paddingLeft={3} paddingTop={2}>
          <text fg={COLORS.red} attributes={1}>Delete project</text>
          <box height={1} />
          <text fg={COLORS.text}>Are you sure you want to delete "{projectName()}"?</text>
          <text fg={COLORS.red}>This action cannot be undone.</text>
          <box height={1} />
          <Show when={deleteErr()}>
            <box height={1}><text fg={COLORS.red}>{deleteErr()}</text></box>
            <box height={1} />
          </Show>
          <Show when={deleting()}>
            <box height={1}><text fg={COLORS.yellow}>Deleting project…</text></box>
            <box height={1} />
          </Show>
          <box flexDirection="row" height={1}>
            <text fg={COLORS.yellow} width={16}>y</text>
            <text fg={COLORS.text}>Confirm delete</text>
          </box>
          <box flexDirection="row" height={1}>
            <text fg={COLORS.yellow} width={16}>n</text>
            <text fg={COLORS.text}>Cancel</text>
          </box>
        </box>
      </Show>
    </box>
  )
}
