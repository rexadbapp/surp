import { createContext, useContext, createSignal, type Accessor, type ParentProps } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { type BufferMeta, type BufferType, newBufferId } from "../buffers/types"
import { clearHover } from "../ui/hover"

export interface BuffersContextValue {
  list: BufferMeta[]
  active: Accessor<string | null>
  open: (type: BufferType, data?: Record<string, string>, title?: string) => string
  close: (id: string) => void
  focus: (id: string) => void
  nextBuffer: () => void
  prevBuffer: () => void
  activeBuffer: () => BufferMeta | undefined
  setStatus: (id: string, status: string) => void
}

const BuffersContext = createContext<BuffersContextValue>()

function defaultTitle(type: BufferType, data?: Record<string, string>): string {
  switch (type) {
    case "dashboard": return "surp"
    case "projects": return "Projects"
    case "connections": return "Connections"
    case "import": return "Import"
    case "home": return data?.["projectName"] ?? data?.["project"] ?? "Home"
    case "tables": return data?.schema ? `${data.project}/${data.schema}` : data?.project ?? "Tables"
    case "table": return data?.table ? `${data.schema ?? "public"}.${data.table}` : "Table"
    case "sql": return data?.project ? `SQL:${data.project}` : "SQL"
    case "logs": return "Logs"
    case "login": return "Login"
    case "account": return "About"
    case "help": return "Help"
    case "lint":   return data?.project ? `Lint: ${data.project}` : "Lint"
    case "schema": return data?.schema ? `Schema: ${data.schema}` : "Schema"
    case "functions": return data?.project ? `Functions: ${data.project}` : "Functions"
    case "function":  return data?.slug ? `fn:${data.slug}` : "Function"
    case "add-function": return "New Function"
    case "storage":   return data?.project ? `Storage: ${data.project}` : "Storage"
    case "bucket":    return data?.bucketName ? `Bucket: ${data.bucketName}` : "Bucket"
    case "create-bucket": return "Create Bucket"
    case "profile": return "Profile"
    case "settings": return data?.projectName ? `Settings: ${data.projectName}` : "Settings"
    case "auth-config": return data?.project ? `Auth: ${data.project}` : "Auth Config"
    case "users": return data?.project ? `Users: ${data.project}` : "Users"
    case "project-config": return data?.project ? `Config: ${data.project}` : "Project Config"
    case "providers": return data?.project ? `Providers: ${data.project}` : "Providers"
    case "auth-users": return data?.project ? `Auth Users: ${data.project}` : "Auth Users"
    case "auth-user":  return data?.email ?? data?.userId ?? "Auth User"
  }
}

export function BuffersProvider(props: ParentProps) {
  const [list, setList] = createStore<BufferMeta[]>([])
  const [active, setActive] = createSignal<string | null>(null)

  // Every buffer activation change drops hover state — otherwise a tooltip
  // from the previous tab could appear after switching with a stationary cursor.
  const activate = (id: string | null) => {
    clearHover()
    setActive(id)
  }

  const open = (type: BufferType, data?: Record<string, string>, title?: string): string => {
    const id = newBufferId()
    const meta: BufferMeta = {
      id,
      type,
      title: title ?? defaultTitle(type, data),
      data,
    }
    setList(produce((l) => l.push(meta)))
    activate(id)
    return id
  }

  const close = (id: string) => {
    const idx = list.findIndex((b) => b.id === id)
    if (idx === -1) return
    setList(produce((l) => l.splice(idx, 1)))
    // Focus adjacent buffer
    if (active() === id) {
      const next = list[idx] ?? list[idx - 1]
      activate(next?.id ?? null)
    }
  }

  const focus = (id: string) => activate(id)

  const nextBuffer = () => {
    const idx = list.findIndex((b) => b.id === active())
    if (idx === -1) return
    const next = list[(idx + 1) % list.length]
    if (next) activate(next.id)
  }

  const prevBuffer = () => {
    const idx = list.findIndex((b) => b.id === active())
    if (idx === -1) return
    const prev = list[(idx - 1 + list.length) % list.length]
    if (prev) activate(prev.id)
  }

  const activeBuffer = () => list.find((b) => b.id === active())

  const setStatus = (id: string, status: string) => {
    const idx = list.findIndex((b) => b.id === id)
    if (idx === -1) return
    setList(produce((l) => { l[idx]!.status = status }))
  }

  const ctx: BuffersContextValue = {
    list,
    active,
    open,
    close,
    focus,
    nextBuffer,
    prevBuffer,
    activeBuffer,
    setStatus,
  }

  return <BuffersContext.Provider value={ctx}>{props.children}</BuffersContext.Provider>
}

export function useBuffers(): BuffersContextValue {
  const ctx = useContext(BuffersContext)
  if (!ctx) throw new Error("useBuffers must be used within BuffersProvider")
  return ctx
}
