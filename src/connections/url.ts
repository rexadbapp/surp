import type { PostgresConnectOptions } from "./types"

/**
 * Parse a postgres/postgresql DSN into connect options.
 * Supports:
 *   postgres://user:pass@host:port/db?sslmode=disable
 *   postgresql://user@host/db
 * Percent-encoded userinfo is decoded. Unknown query params are ignored.
 */
export function parsePostgresUrl(rawUrl: string): PostgresConnectOptions | null {
  const trimmed = rawUrl.trim()
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  const opts: PostgresConnectOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    user: url.username ? safeDecode(url.username) : undefined,
    password: url.password ? safeDecode(url.password) : undefined,
    database: url.pathname && url.pathname.length > 1 ? safeDecode(url.pathname.slice(1)) : undefined,
  }
  if (!opts.host) return null

  const sslmode = url.searchParams.get("sslmode")?.toLowerCase()
  if (sslmode === "disable" || sslmode === "false") opts.ssl = false
  else if (sslmode) opts.ssl = true

  return opts
}

function safeDecode(v: string): string {
  try { return decodeURIComponent(v) } catch { return v }
}

/** Build a display label from connect options (password never included). */
export function describePostgresOptions(opts: PostgresConnectOptions): string {
  const creds = opts.user ? `${opts.user}@` : ""
  const db = opts.database ? `/${opts.database}` : ""
  return `${creds}${opts.host}${opts.port ? `:${opts.port}` : ""}${db}`
}
