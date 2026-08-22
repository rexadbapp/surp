import type { ConnectionKind, DatabaseDriver } from "./types"
import { createPostgresDriver, type PostgresDriverSpec } from "./drivers/postgres"
import { createSupabaseDriver, type SupabaseDriverSpec } from "./drivers/supabase"

/** Per-kind specs passed to driver factories */
export interface DriverSpecMap {
  postgres: PostgresDriverSpec
  supabase: SupabaseDriverSpec
}

type DriverFactory<K extends ConnectionKind> = (spec: DriverSpecMap[K]) => DatabaseDriver

/**
 * Registry of driver factories keyed by connection kind.
 * New sources register themselves here — nothing else in the app changes.
 */
const factories: { [K in ConnectionKind]?: DriverFactory<K> } = {
  postgres: (spec) => createPostgresDriver(spec),
  supabase: (spec) => createSupabaseDriver(spec),
}

export function registerDriver<K extends ConnectionKind>(
  kind: K,
  factory: DriverFactory<K>,
): void {
  factories[kind] = factory as never
}

export function hasDriver(kind: ConnectionKind): boolean {
  return factories[kind] != null
}

export function createDriver<K extends ConnectionKind>(
  kind: K,
  spec: DriverSpecMap[K],
): DatabaseDriver {
  const factory = factories[kind] as ((s: never) => DatabaseDriver) | undefined
  if (!factory) throw new Error(`No driver registered for kind "${kind}"`)
  return factory(spec as never)
}
