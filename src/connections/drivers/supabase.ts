import {
  capabilitySet,
  SUPABASE_CAPABILITIES,
  type DatabaseDriver,
  type QueryResult,
} from "../types"
import { mgmtDbQuery } from "../../auth/api"

export interface SupabaseDriverSpec {
  token: string
  ref: string
  label?: string
}

/**
 * Supabase driver — wraps the Management API's SQL execution endpoint.
 * Advertises every capability since projects/functions/logs/auth-config
 * are reachable when a token+ref are present.
 */
export function createSupabaseDriver(spec: SupabaseDriverSpec): DatabaseDriver {
  const label = spec.label ?? spec.ref

  return {
    kind: "supabase",
    capabilities: capabilitySet(SUPABASE_CAPABILITIES),
    label,

    async query(sqlText: string): Promise<QueryResult> {
      const rows = await mgmtDbQuery(spec.token, spec.ref, sqlText)
      return { rows }
    },

    async testConnection(): Promise<void> {
      await mgmtDbQuery(spec.token, spec.ref, "select 1")
    },

    async close(): Promise<void> {
      // stateless HTTP transport — nothing to release
    },
  }
}
