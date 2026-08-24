import postgres from "postgres"
import {
  capabilitySet,
  SQL_CAPABILITIES,
  type DatabaseDriver,
  type PostgresConnectOptions,
  type QueryResult,
} from "../types"
import { describePostgresOptions } from "../url"

export interface PostgresDriverSpec extends PostgresConnectOptions {
  label?: string
}

/**
 * Direct PostgreSQL driver backed by postgres.js.
 * Serves every plain-SQL capability; management-plane features are absent.
 */
export function createPostgresDriver(spec: PostgresDriverSpec): DatabaseDriver {
  const sql = postgres({
    host: spec.host,
    port: spec.port ?? 5432,
    user: spec.user,
    password: spec.password,
    database: spec.database,
    ssl: spec.ssl ? "prefer" : false,
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10,
  })

  const driver: DatabaseDriver = {
    kind: "postgres",
    capabilities: capabilitySet(SQL_CAPABILITIES),
    label: spec.label ?? describePostgresOptions(spec),

    async query(sqlText: string): Promise<QueryResult> {
      const res = (await sql.unsafe(sqlText)) as unknown
      return { rows: normalizeRows(res) }
    },

    async readOnlyQuery(sqlText: string, timeoutMs = 15000): Promise<QueryResult> {
      const rows = await sql.begin("read only", async (tx) => {
        await tx.unsafe(`SET LOCAL statement_timeout = ${Math.max(1000, timeoutMs)}`)
        return await tx.unsafe(sqlText)
      })
      return { rows: normalizeRows(rows as unknown) }
    },

    async testConnection(): Promise<void> {
      await sql`select 1`
    },

    async close(): Promise<void> {
      try {
        await sql.end({ timeout: 3 })
      } catch {}
    },
  }
  return driver
}

/**
 * postgres.js returns:
 *  - rows array for a single statement
 *  - array of row-arrays for multiple statements
 *  - arrays with extra props (count/command) for non-returning statements
 * Normalize all shapes to a flat row array.
 */
function normalizeRows(res: unknown): Record<string, unknown>[] {
  if (!Array.isArray(res)) return []
  if (res.length > 0 && Array.isArray(res[0])) {
    const merged: Record<string, unknown>[] = []
    for (const part of res as unknown[]) {
      if (Array.isArray(part)) merged.push(...(part as Record<string, unknown>[]))
    }
    return merged
  }
  return res as Record<string, unknown>[]
}
