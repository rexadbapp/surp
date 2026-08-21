import { createSignal, For, Show, onMount } from "solid-js"
import { useAuth } from "../context/auth"
import { useBuffers } from "../context/buffers"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import { listProjects, type Project } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

let projectsCache: Project[] | null = null

const STATUS_COLOR: Record<string, string> = {
  ACTIVE_HEALTHY: COLORS.green,
  ACTIVE_UNHEALTHY: COLORS.yellow,
  COMING_UP: COLORS.teal,
  GOING_DOWN: COLORS.red,
}

export function ProjectsBuffer(props: BufferProps) {
  const auth = useAuth()
  const buffers = useBuffers()
  const keymap = useKeymap()
  const yank = useYank()
  const [projects, setProjects] = createSignal<Project[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [cursor, setCursor] = createSignal(0)

  async function load() {
    const token = auth.token()
    if (!token) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const list = await listProjects(token)
      setProjects(list)
      projectsCache = list
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    if (projectsCache) { setProjects(projectsCache); setLoading(false) }
    else void load()
  })

  keymap.onAction("move_up", () => {
    if (!props.focused) return
    setCursor((c) => Math.max(0, c - 1))
  })
  keymap.onAction("move_down", () => {
    if (!props.focused) return
    setCursor((c) => Math.min(projects().length - 1, c + 1))
  })
  keymap.onAction("yank", () => {
    if (!props.focused) return
    const p = projects()[cursor()]
    if (p) yank.yank(p.id, p.name)
  })
  keymap.onAction("yank_row", () => {
    if (!props.focused) return
    const p = projects()[cursor()]
    if (p) yank.yank(`${p.name} ${p.id}`, "project")
  })
  keymap.onAction("select", () => {
    if (!props.focused) return
    const p = projects()[cursor()]
    if (p) buffers.open("home", { project: p.id, projectName: p.name }, p.name)
  })
  keymap.onAction("refresh", () => {
    if (!props.focused) return
    projectsCache = null
    void load()
  })

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      {/* Header */}
      <box paddingLeft={1} paddingRight={1} backgroundColor={COLORS.overlay} height={1}>
        <text fg={COLORS.subtext} attributes={1}>Projects</text>
      </box>

      {/* Loading */}
      <Show when={loading()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.subtext}>Loading...</text>
        </box>
      </Show>

      {/* Error */}
      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.red}>{error()}</text>
        </box>
      </Show>

      {/* Empty */}
      <Show when={!loading() && !error() && projects().length === 0}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.subtext}>No projects found. Check your token with :login</text>
        </box>
      </Show>

      {/* List */}
      <Show when={!loading()}>
        <For each={projects()}>
          {(project, i) => {
            const active = () => props.focused && i() === cursor()
            const statusColor = () => STATUS_COLOR[project.status] ?? COLORS.subtext
            return (
              <box
                flexDirection="row"
                paddingLeft={1}
                paddingRight={1}
                height={1}
                backgroundColor={active() ? COLORS.overlay : COLORS.background}
                onMouseUp={() => { setCursor(i()); buffers.open("home", { project: project.id, projectName: project.name }, project.name) }}
              >
                <text fg={active() ? COLORS.blue : COLORS.text} width={30}>
                  {active() ? "▶ " : "  "}{project.name}
                </text>
                <text fg={COLORS.muted} width={14}>{project.id}</text>
                <text fg={statusColor()} width={16}>{project.status}</text>
                <text fg={COLORS.subtext}>{project.region}</text>
              </box>
            )
          }}
        </For>
      </Show>
    </box>
  )
}
