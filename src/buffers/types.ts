import type { JSX } from "@opentui/solid/jsx-runtime"

export type BufferType = "dashboard" | "projects" | "connections" | "import" | "home" | "tables" | "table" | "sql" | "agent" | "logs" | "login" | "help" | "lint" | "functions" | "function" | "add-function" | "schema" | "storage" | "bucket" | "create-bucket" | "profile" | "account" | "auth-users" | "auth-user" | "auth-config" | "users" | "project-config" | "providers" | "settings"

export interface BufferMeta {
  id: string
  type: BufferType
  title: string
  /** Arbitrary data passed to the buffer component */
  data?: Record<string, string>
  modified?: boolean
  /** Optional status line shown in the app status bar (e.g. cursor pos) */
  status?: string
}

export interface BufferProps {
  meta: BufferMeta
  focused: boolean
  width: number
  height: number
}

export type BufferComponent = (props: BufferProps) => JSX.Element

/** Registry entry mapping a BufferType to its render component */
export interface BufferRegistryEntry {
  type: BufferType
  component: BufferComponent
  defaultTitle: (data?: Record<string, string>) => string
}

let idCounter = 0
export function newBufferId(): string {
  return `buf-${++idCounter}`
}
