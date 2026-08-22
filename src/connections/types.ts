/**
 * Core connection abstractions.
 *
 * A "driver" is anything surp can run SQL against. Every SQL-backed feature
 * (tables, schema, rows, lint, storage objects, auth users) goes through
 * `DatabaseDriver.query`. Features that cannot be expressed as plain SQL
 * (management APIs, logs) are gated behind capabilities so drivers only
 * advertise what they actually support.
 *
 * Adding a new source (MySQL, SQLite, ...) = new file in ./drivers +
 * one registerDriver() call. No other layer changes.
 */

export type ConnectionKind = "postgres" | "supabase"

/** Feature gates — each buffer/command checks what it needs. */
export type Capability =
  // plain-SQL features (any SQL driver can serve these)
  | "sql"
  | "tables"
  | "schema"
  | "rows"
  | "lint"
  | "storage"
  | "auth-users"
  // management-plane features (supabase driver only today)
  | "projects"
  | "functions"
  | "logs"
  | "auth-config"

export interface QueryResult {
  rows: Record<string, unknown>[]
}

export interface DatabaseDriver {
  readonly kind: ConnectionKind
  readonly capabilities: ReadonlySet<Capability>
  /** Human-readable label for status bars/titles */
  readonly label: string
  query(sqlText: string): Promise<QueryResult>
  /** Cheap connectivity probe; throw on failure */
  testConnection(): Promise<void>
  /** Release pools/sockets; must be idempotent */
  close(): Promise<void>
}

/** Options for a direct postgres connection */
export interface PostgresConnectOptions {
  host: string
  port?: number
  user?: string
  password?: string
  database?: string
  ssl?: boolean
}

/** A named, saveable postgres profile */
export interface PostgresProfile extends PostgresConnectOptions {
  id: string
  name: string
  createdAt: string
}

/** Identity of the active connection exposed to buffers */
export interface ActiveConnection {
  id: string
  kind: ConnectionKind
  label: string
  driver: DatabaseDriver
  /** Present when the driver wraps a Supabase project (enables mgmt-only features) */
  supabase?: { token: string; ref: string }
}

export const SQL_CAPABILITIES: Capability[] = [
  "sql", "tables", "schema", "rows", "lint", "storage", "auth-users",
]

export const SUPABASE_CAPABILITIES: Capability[] = [
  ...SQL_CAPABILITIES,
  "projects", "functions", "logs", "auth-config",
]

export function capabilitySet(caps: Capability[]): ReadonlySet<Capability> {
  return new Set(caps)
}
