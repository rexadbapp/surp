import { createSignal, onMount, Show } from "solid-js"
import { useAuth } from "../context/auth"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import { getProject, type Project } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

const projectCache = new Map<string, Project>()

const STATUS_COLOR: Record<string, string> = {
  ACTIVE_HEALTHY:   COLORS.green,
  ACTIVE_UNHEALTHY: COLORS.yellow,
  COMING_UP:        COLORS.teal,
  GOING_DOWN:       COLORS.red,
}
const STATUS_DOT: Record<string, string> = {
  ACTIVE_HEALTHY:   "●",
  ACTIVE_UNHEALTHY: "●",
  COMING_UP:        "◌",
  GOING_DOWN:       "○",
}
const STATUS_LABEL: Record<string, string> = {
  ACTIVE_HEALTHY:   "Healthy",
  ACTIVE_UNHEALTHY: "Unhealthy",
  COMING_UP:        "Starting…",
  GOING_DOWN:       "Stopping…",
}

const REGION_NAMES: Record<string, string> = {
  "ap-east-1":      "AP East (Hong Kong)",
  "ap-northeast-1": "AP Northeast (Tokyo)",
  "ap-northeast-2": "AP Northeast (Seoul)",
  "ap-south-1":     "AP South (Mumbai)",
  "ap-southeast-1": "AP Southeast (Singapore)",
  "ap-southeast-2": "AP Southeast (Sydney)",
  "ca-central-1":   "Canada (Central)",
  "eu-central-1":   "EU Central (Frankfurt)",
  "eu-north-1":     "EU North (Stockholm)",
  "eu-west-1":      "EU West (Ireland)",
  "eu-west-2":      "EU West (London)",
  "eu-west-3":      "EU West (Paris)",
  "sa-east-1":      "South America (São Paulo)",
  "us-east-1":      "US East (N. Virginia)",
  "us-east-2":      "US East (Ohio)",
  "us-west-1":      "US West (N. California)",
  "us-west-2":      "US West (Oregon)",
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    })
  } catch { return iso }
}

function trunc(s: string, w: number) { return s.length <= w ? s : s.slice(0, w - 1) + "…" }

interface CardProps {
  label: string
  value: string
  sub?: string
  valueColor?: string
  width: number
}

function Card(p: CardProps) {
  const inner = p.width - 2
  return (
    <box width={p.width} height={5} backgroundColor={COLORS.surface} flexDirection="column">
      <box height={1} />
      <box height={1} paddingLeft={2}>
        <text fg={COLORS.muted}>{trunc(p.label, inner)}</text>
      </box>
      <box height={1} paddingLeft={2}>
        <text fg={p.valueColor ?? COLORS.text} attributes={1}>{trunc(p.value, inner)}</text>
      </box>
      <box height={1} paddingLeft={2}>
        <text fg={COLORS.muted}>{p.sub ? trunc(p.sub, inner) : ""}</text>
      </box>
      <box height={1} />
    </box>
  )
}

export function HomeBuffer(props: BufferProps) {
  const auth   = useAuth()
  const keymap = useKeymap()
  const yank   = useYank()

  const ref         = () => String(props.meta.data?.["project"] ?? "")
  const projectName = () => String(props.meta.data?.["projectName"] ?? ref())
  const url         = () => `https://${ref()}.supabase.co`

  const [project, setProject] = createSignal<Project | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [error,   setError]   = createSignal<string | null>(null)

  async function load(force = false) {
    const token = auth.token()
    const r = ref()
    if (!token || !r) return
    if (!force) {
      const cached = projectCache.get(r)
      if (cached) { setProject(cached); return }
    }
    setLoading(true); setError(null)
    try {
      const p = await getProject(token, r)
      projectCache.set(r, p)
      setProject(p)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => void load())

  keymap.onAction("yank", () => {
    if (!props.focused) return
    yank.yank(url(), "url")
  })
  keymap.onAction("yank_row", () => {
    if (!props.focused) return
    const p = project()
    yank.yank(p ? `${p.name}\n${url()}\n${p.id}` : url(), "project")
  })
  keymap.onAction("refresh", () => { if (props.focused) void load(true) })

  // Two equal-width cards separated by a 2-col gap
  const cardW = () => Math.floor((props.width - 2) / 2) - 1

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>

      {/* Header bar */}
      <box height={1} paddingLeft={1} backgroundColor={COLORS.overlay} flexDirection="row">
        <text fg={COLORS.green} attributes={1}>home  </text>
        <text fg={COLORS.text}>{projectName()}</text>
        <Show when={loading()}>
          <text fg={COLORS.yellow}>  loading…</text>
        </Show>
        <text fg={COLORS.muted}>  ·  y: copy url  r: refresh</text>
      </box>

      <Show when={error()}>
        <box paddingLeft={2} paddingTop={1}>
          <text fg={COLORS.red}>{error()}</text>
        </box>
      </Show>

      {/* Body */}
      <box flexDirection="column" paddingTop={2} alignItems="center">

        {/* Title + URL */}
        <box height={1}>
          <text fg={COLORS.text} attributes={1}>{projectName()}</text>
        </box>
        <box height={1}>
          <text fg={COLORS.muted}>{url()}</text>
        </box>
        <box height={2} />

        <Show when={project()}>
          {(p) => {
            const region = () => REGION_NAMES[p().region] ?? p().region
            const dbVer  = () => p().database?.version ?? "—"
            const dbEng  = () => p().database?.postgres_engine ?? ""
            const status = () => `${STATUS_DOT[p().status] ?? "●"} ${STATUS_LABEL[p().status] ?? p().status}`

            return (
              <box flexDirection="column">

                {/* Row 1: STATUS / REGION */}
                <box flexDirection="row">
                  <Card
                    label="STATUS"
                    value={status()}
                    valueColor={STATUS_COLOR[p().status] ?? COLORS.text}
                    width={cardW()}
                  />
                  <box width={2} />
                  <Card label="REGION" value={region()} width={cardW()} />
                </box>

                <box height={1} />

                {/* Row 2: DATABASE / CREATED */}
                <box flexDirection="row">
                  <Card
                    label="DATABASE"
                    value={dbVer()}
                    sub={dbEng() || undefined}
                    width={cardW()}
                  />
                  <box width={2} />
                  <Card label="CREATED" value={formatDate(p().created_at)} width={cardW()} />
                </box>

                <box height={1} />

                {/* Row 3: PROJECT ID / ORG */}
                <box flexDirection="row">
                  <Card label="PROJECT ID" value={p().id} sub="y: copy ref" width={cardW()} />
                  <box width={2} />
                  <Card label="ORGANIZATION" value={p().organization_id} width={cardW()} />
                </box>

              </box>
            )
          }}
        </Show>

      </box>
    </box>
  )
}
