import { createSignal, Show, For, onMount } from "solid-js"
import { useAuth } from "../context/auth"
import { useKeymap } from "../context/keymap"
import { getProject, type Project } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

const configCache = new Map<string, Project>()

export function ProjectConfigBuffer(props: BufferProps) {
  const auth = useAuth()
  const keymap = useKeymap()

  const [project, setProject] = createSignal<Project | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)

  const projectRef = () => props.meta.data?.["project"] ?? ""

  async function load() {
    const token = auth.token()
    const ref = projectRef()
    if (!token || !ref) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const p = await getProject(token, ref)
      setProject(p)
      configCache.set(props.meta.id, p)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    const cached = configCache.get(props.meta.id)
    if (cached) { setProject(cached); setLoading(false) }
    else void load()
  })

  keymap.onAction("refresh", () => {
    if (!props.focused) return
    configCache.delete(props.meta.id)
    void load()
  })

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      <box height={1} paddingLeft={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.peach} attributes={1}>Project Config  </text>
        <text fg={COLORS.muted}>{projectRef()}</text>
        <Show when={loading()}>
          <text fg={COLORS.yellow}>  loading…</text>
        </Show>
        <text fg={COLORS.muted}>  ·  r: refresh</text>
      </box>

      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1}><text fg={COLORS.red}>{error()}</text></box>
      </Show>

      <Show when={!loading() && !project() && !error()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.subtext}>No project selected.</text>
        </box>
      </Show>

      <Show when={project()}>
        {(p) => {
          const entries = configToRows(p())
          return (
            <box flexDirection="column" paddingLeft={2} paddingTop={1}>
              <text fg={COLORS.blue} attributes={1}>Project Settings</text>
              <box height={1} />
              <For each={entries}>
                {([label, val]) => (
                  <box flexDirection="row" height={1}>
                    <text fg={COLORS.muted} width={22}>{label}</text>
                    <text fg={COLORS.text}>{val}</text>
                  </box>
                )}
              </For>
            </box>
          )
        }}
      </Show>
    </box>
  )
}

function configToRows(p: Project): [string, string][] {
  return [
    ["Name", p.name],
    ["ID / Ref", p.id],
    ["Status", p.status],
    ["Region", p.region],
    ["Organization", p.organization_id],
    ["Created", new Date(p.created_at).toLocaleString()],
    ["DB Host", p.database?.host ?? "—"],
    ["DB Version", p.database?.version ?? "—"],
    ["DB Engine", p.database?.postgres_engine ?? "—"],
  ]
}
