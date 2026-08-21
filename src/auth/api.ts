const MGMT = "https://api.supabase.com/v1"

export interface Project {
  id: string
  name: string
  organization_id: string
  status: "ACTIVE_HEALTHY" | "ACTIVE_UNHEALTHY" | "COMING_UP" | "GOING_DOWN" | string
  region: string
  created_at: string
  database: { host: string; version: string; postgres_engine: string } | null
}

export interface Organization {
  id: string
  slug: string
  name: string
}

export interface Profile {
  gotrue_id: string
  primary_email: string
  username: string
}

export interface OrganizationMember {
  id: string
  email: string
  role_name: string
  joined_at: string
}

export interface Column {
  id: string
  name: string
  table_id: number
  data_type: string
  is_nullable: boolean
  default_value: string | null
}

export interface Table {
  id: number
  schema: string
  name: string
  comment: string | null
  columns: Column[]
}

async function mgmt<T>(token: string, path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${MGMT}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Supabase API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

async function dbQuery(
  token: string,
  ref: string,
  query: string,
): Promise<Record<string, unknown>[]> {
  return mgmt<Record<string, unknown>[]>(token, `/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  })
}

export async function listProjects(token: string): Promise<Project[]> {
  return mgmt<Project[]>(token, "/projects")
}

export async function getProject(token: string, ref: string): Promise<Project> {
  return mgmt<Project>(token, `/projects/${ref}`)
}

export async function updateProjectName(token: string, ref: string, name: string): Promise<Project> {
  return mgmt<Project>(token, `/projects/${ref}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  })
}

export async function deleteProjectAPI(token: string, ref: string): Promise<void> {
  await mgmt<unknown>(token, `/projects/${ref}`, { method: "DELETE" })
}

export async function listOrganizations(token: string): Promise<Organization[]> {
  return mgmt<Organization[]>(token, "/organizations")
}

export async function getProfile(token: string): Promise<Profile> {
  return mgmt<Profile>(token, "/profile")
}

export async function getOrganizationMembers(token: string, slug: string): Promise<OrganizationMember[]> {
  return mgmt<OrganizationMember[]>(token, `/organizations/${slug}/members`)
}

export async function listTables(token: string, ref: string, schema = "public"): Promise<Table[]> {
  const [tableRows, colRows] = await Promise.all([
    dbQuery(
      token,
      ref,
      `SELECT c.oid::text AS id, n.nspname AS schema, c.relname AS name,
              obj_description(c.oid, 'pg_class') AS comment
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = '${schema.replace(/'/g, "''")}' AND c.relkind = 'r'
       ORDER BY c.relname`,
    ),
    dbQuery(
      token,
      ref,
      `SELECT a.attrelid::text AS table_id, a.attnum::text AS id,
              a.attname AS name, format_type(a.atttypid, a.atttypmod) AS data_type,
              (NOT a.attnotnull)::bool AS is_nullable,
              pg_get_expr(d.adbin, d.adrelid) AS default_value
       FROM pg_catalog.pg_attribute a
       JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE n.nspname = '${schema.replace(/'/g, "''")}' AND c.relkind = 'r'
         AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attrelid, a.attnum`,
    ),
  ])

  const colsByTable = new Map<string, Column[]>()
  for (const row of colRows) {
    const tid = String(row.table_id)
    if (!colsByTable.has(tid)) colsByTable.set(tid, [])
    colsByTable.get(tid)!.push({
      id: String(row.id),
      name: String(row.name),
      table_id: Number(row.table_id),
      data_type: String(row.data_type),
      is_nullable: Boolean(row.is_nullable),
      default_value: row.default_value != null ? String(row.default_value) : null,
    })
  }

  return tableRows.map((row) => ({
    id: Number(row.id),
    schema: String(row.schema),
    name: String(row.name),
    comment: row.comment != null ? String(row.comment) : null,
    columns: colsByTable.get(String(row.id)) ?? [],
  }))
}

export interface SchemaColumn {
  id: string
  name: string
  table_id: string
  data_type: string
  is_nullable: boolean
  default_value: string | null
  is_pk: boolean
  is_unique: boolean
  is_identity: boolean
  fk_table?: string
}

export interface SchemaTable {
  id: string
  schema: string
  name: string
  columns: SchemaColumn[]
}

export async function listSchemaFull(
  token: string,
  ref: string,
  schema = "public",
): Promise<SchemaTable[]> {
  const s = schema.replace(/'/g, "''")
  const [tableRows, colRows] = await Promise.all([
    dbQuery(
      token, ref,
      `SELECT c.oid::text AS id, n.nspname AS schema, c.relname AS name
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = '${s}' AND c.relkind = 'r'
       ORDER BY c.relname`,
    ),
    dbQuery(
      token, ref,
      `SELECT
         a.attrelid::text AS table_id,
         a.attnum::text   AS id,
         a.attname        AS name,
         format_type(a.atttypid, a.atttypmod) AS data_type,
         (NOT a.attnotnull)::bool AS is_nullable,
         pg_get_expr(d.adbin, d.adrelid) AS default_value,
         (a.attidentity IN ('a', 'd'))::bool AS is_identity,
         (EXISTS (
           SELECT 1 FROM pg_catalog.pg_constraint con
           WHERE con.conrelid = a.attrelid AND con.contype = 'p'
             AND a.attnum = ANY(con.conkey)
         ))::bool AS is_pk,
         (EXISTS (
           SELECT 1 FROM pg_catalog.pg_constraint con
           WHERE con.conrelid = a.attrelid AND con.contype = 'u'
             AND a.attnum = ANY(con.conkey)
         ))::bool AS is_unique,
         (SELECT ref_cl.relname
          FROM pg_catalog.pg_constraint con
          JOIN pg_catalog.pg_class ref_cl ON ref_cl.oid = con.confrelid
          WHERE con.conrelid = a.attrelid AND con.contype = 'f'
            AND a.attnum = ANY(con.conkey)
          LIMIT 1
         ) AS fk_table
       FROM pg_catalog.pg_attribute a
       JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_catalog.pg_attrdef d
         ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE n.nspname = '${s}' AND c.relkind = 'r'
         AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attrelid, a.attnum`,
    ),
  ])

  const colsByTable = new Map<string, SchemaColumn[]>()
  for (const row of colRows) {
    const tid = String(row.table_id)
    if (!colsByTable.has(tid)) colsByTable.set(tid, [])
    colsByTable.get(tid)!.push({
      id:            String(row.id),
      name:          String(row.name),
      table_id:      tid,
      data_type:     String(row.data_type),
      is_nullable:   Boolean(row.is_nullable),
      default_value: row.default_value != null ? String(row.default_value) : null,
      is_identity:   Boolean(row.is_identity),
      is_pk:         Boolean(row.is_pk),
      is_unique:     Boolean(row.is_unique),
      fk_table:      row.fk_table != null ? String(row.fk_table) : undefined,
    })
  }

  return tableRows.map((row) => ({
    id:      String(row.id),
    schema:  String(row.schema),
    name:    String(row.name),
    columns: colsByTable.get(String(row.id)) ?? [],
  }))
}

export interface LintIssue {
  name: string
  title: string
  level: "ERROR" | "WARN" | "INFO"
  facing: string
  categories: string[]
  description: string
  detail: string
  remediation: string
  metadata: Record<string, unknown>
  cache_key: string
}

let _splinterSql: string | null = null
function splinterSql(): string {
  if (_splinterSql) return _splinterSql
  // Load the bundled splinter.sql (strip the `set local search_path` preamble)
  const raw = require("fs").readFileSync(
    new URL("./splinter.sql", import.meta.url),
    "utf8",
  ) as string
  _splinterSql = raw.replace(/^set\s+local\s+search_path\s*=\s*'';\s*/i, "").trim()
  return _splinterSql
}

function parseCategories(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === "string") {
    const inner = val.replace(/^\{|\}$/g, "").trim()
    return inner ? inner.split(",").map((s) => s.trim()).filter(Boolean) : []
  }
  return []
}

async function fetchAuthLeakedPasswordCheck(token: string, ref: string): Promise<LintIssue | null> {
  try {
    const cfg = await mgmt<Record<string, unknown>>(token, `/projects/${ref}/config/auth`)
    if (cfg["password_hibp_enabled"] === true) return null
    return {
      name: "auth_leaked_password_protection",
      title: "Leaked Password Protection Disabled",
      level: "WARN",
      facing: "EXTERNAL",
      categories: ["SECURITY"],
      description: "Leaked password protection is currently disabled.",
      detail: "Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org. Enable this feature to enhance security.",
      remediation: "https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection",
      metadata: { type: "auth", entity: "Auth" },
      cache_key: "auth_leaked_password_protection",
    }
  } catch {
    return null
  }
}

export async function lintProject(token: string, ref: string): Promise<LintIssue[]> {
  const [rows, authCheck] = await Promise.all([
    dbQuery(token, ref, splinterSql()),
    fetchAuthLeakedPasswordCheck(token, ref),
  ])
  const seen = new Set<string>()
  const issues: LintIssue[] = []
  for (const row of rows) {
    const meta = (row.metadata && typeof row.metadata === "object") ? row.metadata as Record<string, unknown> : {}
    const key = String(row.cache_key ?? "")
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    issues.push({
      name:        String(row.name        ?? ""),
      title:       String(row.title       ?? ""),
      level:       (["ERROR", "WARN", "INFO"].includes(String(row.level)) ? row.level : "INFO") as "ERROR" | "WARN" | "INFO",
      facing:      String(row.facing      ?? "EXTERNAL"),
      categories:  parseCategories(row.categories),
      description: String(row.description ?? ""),
      detail:      String(row.detail      ?? ""),
      remediation: String(row.remediation ?? ""),
      metadata:    meta,
      cache_key:   String(row.cache_key   ?? ""),
    })
  }
  if (authCheck) issues.push(authCheck)
  return issues
}

export interface EdgeFunction {
  id: string
  slug: string
  name: string
  status: string
  version: number
  entrypoint_path: string | null
  verify_jwt: boolean | null
  import_map: boolean | null
  import_map_path: string | null
  static_patterns: string[]
  created_at: string
  updated_at: string
}

export async function listFunctions(token: string, ref: string): Promise<EdgeFunction[]> {
  return mgmt<EdgeFunction[]>(token, `/projects/${ref}/functions`)
}

export async function getFunction(token: string, ref: string, slug: string): Promise<EdgeFunction> {
  return mgmt<EdgeFunction>(token, `/projects/${ref}/functions/${slug}`)
}

export interface CreateFunctionPayload {
  name: string
  slug: string
  verify_jwt?: boolean
  entrypoint_path?: string
  import_map?: boolean
  /** Source code for the function body */
  body?: string
}

export async function createFunction(
  token: string, ref: string, payload: CreateFunctionPayload,
): Promise<EdgeFunction> {
  const form = new FormData()
  const metadata: Record<string, unknown> = { name: payload.name }
  if (payload.verify_jwt != null) metadata.verify_jwt = payload.verify_jwt
  if (payload.entrypoint_path) metadata.entrypoint_path = payload.entrypoint_path
  if (payload.import_map != null) metadata.import_map = payload.import_map
  form.set("metadata", JSON.stringify(metadata))
  if (payload.body) form.set("file", new Blob([payload.body], { type: "text/typescript" }), "index.ts")
  const res = await fetch(
    `${MGMT}/projects/${ref}/functions/deploy?slug=${encodeURIComponent(payload.slug)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Supabase API ${res.status}: ${text}`)
  }
  return res.json() as Promise<EdgeFunction>
}

export async function deleteFunctionAPI(token: string, ref: string, slug: string): Promise<void> {
  await mgmt<unknown>(token, `/projects/${ref}/functions/${slug}`, { method: "DELETE" })
}

export async function getFunctionBody(token: string, ref: string, slug: string): Promise<string> {
  const res = await fetch(`${MGMT}/projects/${ref}/functions/${slug}/body`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.text()
}

export interface FunctionLog {
  id: string
  timestamp: string
  event_message: string
  metadata: Record<string, unknown>
}

export interface FunctionStat {
  hour: string | null
  invocations: number
  errors: number
}

async function analyticsQuery<T>(token: string, ref: string, sql: string): Promise<T[]> {
  const now   = Date.now()
  const start = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const end   = new Date(now).toISOString()
  const params = new URLSearchParams({ sql, iso_timestamp_start: start, iso_timestamp_end: end })
  const res = await fetch(`${MGMT}/projects/${ref}/analytics/endpoints/logs.all?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Analytics ${res.status}: ${text}`)
  }
  const json = await res.json() as { result?: T[]; error?: string }
  if (json.error) throw new Error(json.error)
  return json.result ?? []
}

export async function getFunctionLogs(
  token: string, ref: string, fnId: string,
): Promise<FunctionLog[]> {
  const id = fnId.replace(/'/g, "''")
  return analyticsQuery<FunctionLog>(token, ref,
    `SELECT id, timestamp, event_message, metadata
     FROM edge_logs
     WHERE metadata.function_id = '${id}'
     ORDER BY timestamp DESC
     LIMIT 200`,
  )
}

export async function getFunctionStats(
  token: string, ref: string, fnId: string,
): Promise<FunctionStat[]> {
  const id = fnId.replace(/'/g, "''")
  return analyticsQuery<FunctionStat>(token, ref,
    `SELECT
       toStartOfHour(timestamp) AS hour,
       count() AS invocations,
       countIf(toInt32OrNull(metadata.status) >= 500) AS errors
     FROM edge_logs
     WHERE metadata.function_id = '${id}'
       AND timestamp >= now() - toIntervalHour(24)
     GROUP BY hour
     ORDER BY hour ASC`,
  )
}

export interface StorageBucket {
  id: string
  name: string
  owner: string
  public: boolean
  created_at: string
  updated_at: string
  file_size_limit: number | null
  allowed_mime_types: string[] | null
  object_count: number
}

export interface StorageObject {
  id: string
  name: string
  bucket_id: string
  owner: string
  created_at: string
  updated_at: string
  last_accessed_at: string
  metadata: {
    size?: number
    mimetype?: string
    [key: string]: unknown
  }
}

export async function getStorageBuckets(token: string, ref: string): Promise<StorageBucket[]> {
  return mgmt<StorageBucket[]>(token, `/projects/${ref}/storage/buckets`)
}

export async function createStorageBucket(token: string, ref: string, name: string, isPublic: boolean): Promise<void> {
  const escaped = name.replace(/'/g, "''")
  await dbQuery(token, ref,
    `INSERT INTO storage.buckets (id, name, public) VALUES ('${escaped}', '${escaped}', ${isPublic})`,
  )
}

export async function deleteStorageBucket(token: string, ref: string, id: string): Promise<void> {
  await mgmt<unknown>(token, `/projects/${ref}/storage/buckets/${id}`, { method: "DELETE" })
}

export async function emptyStorageBucket(token: string, ref: string, id: string): Promise<void> {
  await mgmt<unknown>(token, `/projects/${ref}/storage/buckets/${id}/empty`, { method: "POST" })
}

export async function getStorageObjects(token: string, ref: string, bucketId: string): Promise<StorageObject[]> {
  const escapedId = bucketId.replace(/'/g, "''")
  const rows = await dbQuery(token, ref, `SELECT id::text, name, bucket_id, owner::text, created_at::text, updated_at::text, last_accessed_at::text, metadata::text FROM storage.objects WHERE bucket_id = '${escapedId}' ORDER BY name`)
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    bucket_id: String(row.bucket_id),
    owner: String(row.owner),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    last_accessed_at: String(row.last_accessed_at),
    metadata: typeof row.metadata === "string" ? (() => { try { return JSON.parse(row.metadata as string) } catch { return {} } })() : (row.metadata ?? {}) as StorageObject["metadata"],
  }))
}

export async function deleteStorageObject(token: string, ref: string, bucketId: string, name: string): Promise<void> {
  const eBucket = bucketId.replace(/'/g, "''")
  const eName = name.replace(/'/g, "''")
  await dbQuery(token, ref, `DELETE FROM storage.objects WHERE bucket_id = '${eBucket}' AND name = '${eName}'`)
}

export async function fetchStorageObjectPreview(
  ref: string,
  bucketId: string,
  objectName: string,
  maxBytes = 4096,
): Promise<string> {
  const url = `https://${ref}.supabase.co/storage/v1/object/public/${bucketId}/${objectName}`
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${maxBytes - 1}` },
    })
    if (!res.ok) return ""
    return await res.text()
  } catch {
    return ""
  }
}

export interface LogRow {
  id: string
  timestamp: string
  log_type: string
  method: string
  pathname: string
  status: string
  level: string
  event_message: string
}

function microToISO(micros: unknown): string {
  if (typeof micros === "number" && micros > 1e15) return new Date(micros / 1000).toISOString()
  return String(micros ?? "")
}

function str(v: unknown, fallback = ""): string {
  if (v == null) return fallback
  return String(v)
}

const EDGE_COLS = `id, el.timestamp as timestamp, 'edge' as log_type,
  CAST(edge_logs_response.status_code AS STRING) as status,
  CASE WHEN edge_logs_response.status_code BETWEEN 200 AND 299 THEN 'success'
       WHEN edge_logs_response.status_code BETWEEN 400 AND 499 THEN 'warning'
       WHEN edge_logs_response.status_code >= 500 THEN 'error'
       ELSE 'success' END as level,
  edge_logs_request.path as pathname,
  null as event_message,
  edge_logs_request.method as method`

const EDGE_FROM = `edge_logs as el
  CROSS JOIN UNNEST(metadata) as edge_logs_metadata
  CROSS JOIN UNNEST(edge_logs_metadata.request) as edge_logs_request
  CROSS JOIN UNNEST(edge_logs_metadata.response) as edge_logs_response`

const EDGE_WHERE = `edge_logs_request.path NOT LIKE '%/rest/%'
  AND edge_logs_request.path NOT LIKE '%/storage/%'`

export async function getEdgeLogs(
  token: string, ref: string, limit = 200,
): Promise<LogRow[]> {
  const rows = await analyticsQuery<Record<string, unknown>>(token, ref,
    `SELECT ${EDGE_COLS}
     FROM ${EDGE_FROM}
     WHERE ${EDGE_WHERE}
     ORDER BY el.timestamp DESC
     LIMIT ${limit}`,
  )
  return rows.map(r => ({
    id: str(r.id),
    timestamp: microToISO(r.timestamp),
    log_type: str(r.log_type),
    method: str(r.method),
    pathname: str(r.pathname),
    status: str(r.status),
    level: str(r.level),
    event_message: str(r.event_message),
  }))
}

export async function getPostgresLogs(
  token: string, ref: string, limit = 200,
): Promise<LogRow[]> {
  const rows = await analyticsQuery<Record<string, unknown>>(token, ref,
    `SELECT id, pgl.timestamp as timestamp, 'postgres' as log_type,
       CAST(pgl_parsed.sql_state_code AS STRING) as status,
       CASE WHEN pgl_parsed.error_severity = 'LOG' THEN 'success'
            WHEN pgl_parsed.error_severity = 'WARNING' THEN 'warning'
            WHEN pgl_parsed.error_severity IN ('FATAL', 'ERROR') THEN 'error'
            ELSE null END as level,
       null as pathname,
       event_message,
       null as method
     FROM postgres_logs as pgl
     CROSS JOIN UNNEST(pgl.metadata) as pgl_metadata
     CROSS JOIN UNNEST(pgl_metadata.parsed) as pgl_parsed
     ORDER BY pgl.timestamp DESC
     LIMIT ${limit}`,
  )
  return rows.map(r => ({
    id: str(r.id),
    timestamp: microToISO(r.timestamp),
    log_type: str(r.log_type),
    method: str(r.method),
    pathname: str(r.pathname),
    status: str(r.status),
    level: str(r.level),
    event_message: str(r.event_message),
  }))
}

export async function getAuthLogs(
  token: string, ref: string, limit = 200,
): Promise<LogRow[]> {
  const rows = await analyticsQuery<Record<string, unknown>>(token, ref,
    `SELECT el_in_al.id as id, al.id as source_id,
       el_in_al.timestamp as timestamp, 'auth' as log_type,
       CAST(el_in_al_response.status_code AS STRING) as status,
       CASE WHEN el_in_al_response.status_code BETWEEN 200 AND 299 THEN 'success'
            WHEN el_in_al_response.status_code BETWEEN 400 AND 499 THEN 'warning'
            WHEN el_in_al_response.status_code >= 500 THEN 'error'
            ELSE 'success' END as level,
       el_in_al_request.path as pathname,
       null as event_message,
       el_in_al_request.method as method
     FROM auth_logs as al
     CROSS JOIN UNNEST(metadata) as al_metadata
     LEFT JOIN (edge_logs as el_in_al
       CROSS JOIN UNNEST(metadata) as el_in_al_metadata
       CROSS JOIN UNNEST(el_in_al_metadata.response) as el_in_al_response
       CROSS JOIN UNNEST(el_in_al_response.headers) as el_in_al_response_headers
       CROSS JOIN UNNEST(el_in_al_metadata.request) as el_in_al_request
     ) ON al_metadata.request_id = el_in_al_response_headers.cf_ray
     WHERE al_metadata.request_id IS NOT NULL
     ORDER BY el_in_al.timestamp DESC
     LIMIT ${limit}`,
  )
  return rows.map(r => ({
    id: str(r.id),
    timestamp: microToISO(r.timestamp),
    log_type: str(r.log_type),
    method: str(r.method),
    pathname: str(r.pathname),
    status: str(r.status),
    level: str(r.level),
    event_message: str(r.event_message),
  }))
}

export interface SqlSnippet {
  id: string
  name: string
  content: { sql: string; schema_version?: string }
  inserted_at: string
  updated_at: string
}

export async function listSnippets(token: string, ref: string): Promise<SqlSnippet[]> {
  const params = new URLSearchParams({ project_ref: ref })
  const resp = await mgmt<{ data: SqlSnippet[] }>(token, `/snippets?${params}`)
  return resp.data ?? []
}

export interface AuthConfig {
  SITE_URL: string
  JWT_EXPIRY: number
  JWT_AUD: string
  JWT_SECRET: string | null
  DISABLE_SIGNUP: boolean
  PASSWORD_MIN_LENGTH: number
  PASSWORD_REQUIRED_CHARACTERS: string
  SECURITY_CAPTCHA_ENABLED: boolean
  SECURITY_CAPTCHA_PROVIDER: string | null
  SECURITY_CAPTCHA_SECRET: string | null
  SECURITY_MANUALLY_VERIFY_EMAIL: boolean
  SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: number
  SMTP_ADMIN_EMAIL: string | null
  SMTP_HOST: string | null
  SMTP_PORT: number | null
  SMTP_USER: string | null
  SMTP_PASS: string | null
  SMTP_SENDER_NAME: string | null
  EXTERNAL_ANONYMOUS_USERS_ENABLED: boolean
  MAILER_AUTOCONFIRM: boolean
  MAILER_SECURE_EMAIL_CHANGE_ENABLED: boolean
  URI_ALLOW_LIST: string[]
  password_hibp_enabled: boolean
  provider_github_enabled: boolean
  provider_google_enabled: boolean
  provider_apple_enabled: boolean
  provider_azure_enabled: boolean
  provider_facebook_enabled: boolean
  provider_twitter_enabled: boolean
  provider_discord_enabled: boolean
  provider_slack_enabled: boolean
  provider_keycloak_enabled: boolean
  provider_linkedin_enabled: boolean
  provider_notion_enabled: boolean
  provider_spotify_enabled: boolean
  provider_workos_enabled: boolean
  provider_zoom_enabled: boolean
  provider_twitch_enabled: boolean
  provider_gitlab_enabled: boolean
  [key: string]: unknown
}

export async function getAuthConfig(token: string, ref: string): Promise<AuthConfig> {
  return mgmt<AuthConfig>(token, `/projects/${ref}/config/auth`)
}

export interface AuthUser {
  id: string
  email: string
  phone: string | null
  created_at: string
  updated_at: string
  last_sign_in_at: string | null
  confirmed_at: string | null
  email_confirmed_at: string | null
  phone_confirmed_at: string | null
  providers: string[]
  banned_until: string | null
  is_sso_user: boolean
  role: string
}

export async function listAuthUsers(token: string, ref: string): Promise<AuthUser[]> {
  const rows = await dbQuery(token, ref,
    `SELECT id::text, email, phone, created_at::text, updated_at::text,
            last_sign_in_at::text, confirmed_at::text,
            email_confirmed_at::text, phone_confirmed_at::text,
            COALESCE(raw_app_meta_data->>'providers', '[]') AS providers,
            banned_until::text, is_sso_user::text, role
     FROM auth.users
     ORDER BY created_at DESC
     LIMIT 200`,
  )
  return rows.map((row) => ({
    id: String(row.id),
    email: String(row.email ?? ""),
    phone: row.phone != null ? String(row.phone) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    last_sign_in_at: row.last_sign_in_at != null ? String(row.last_sign_in_at) : null,
    confirmed_at: row.confirmed_at != null ? String(row.confirmed_at) : null,
    email_confirmed_at: row.email_confirmed_at != null ? String(row.email_confirmed_at) : null,
    phone_confirmed_at: row.phone_confirmed_at != null ? String(row.phone_confirmed_at) : null,
    providers: JSON.parse(String(row.providers ?? "[]")),
    banned_until: row.banned_until != null ? String(row.banned_until) : null,
    is_sso_user: String(row.is_sso_user) === "true",
    role: String(row.role ?? ""),
  }))
}

export interface AuthUserDetail {
  id: string
  email: string
  phone: string | null
  role: string
  created_at: string
  updated_at: string
  last_sign_in_at: string | null
  confirmed_at: string | null
  email_confirmed_at: string | null
  phone_confirmed_at: string | null
  banned_until: string | null
  is_sso_user: boolean
  providers: string[]
  user_metadata: Record<string, unknown>
  app_metadata: Record<string, unknown>
  identities: { id: string; provider: string; created_at: string }[]
}

export async function getAuthUserDB(token: string, ref: string, userId: string): Promise<AuthUserDetail | null> {
  const escapedId = userId.replace(/'/g, "''")
  const rows = await dbQuery(token, ref,
    `SELECT
       id::text, email, phone, role,
       created_at::text, updated_at::text,
       last_sign_in_at::text, confirmed_at::text,
       email_confirmed_at::text, phone_confirmed_at::text,
       banned_until::text, is_sso_user::text,
       COALESCE(raw_app_meta_data->>'providers', '[]') AS providers,
       raw_user_meta_data::text AS user_metadata,
       raw_app_meta_data::text AS app_metadata
     FROM auth.users
     WHERE id = '${escapedId}'`,
  )
  if (rows.length === 0) return null
  const row = rows[0]

  const identityRows = await dbQuery(token, ref,
    `SELECT id::text, provider, created_at::text
     FROM auth.identities
     WHERE user_id = '${escapedId}'`,
  )
  const identities = identityRows.map((r) => ({
    id: String(r.id),
    provider: String(r.provider),
    created_at: String(r.created_at),
  }))

  return {
    id: String(row.id),
    email: String(row.email ?? ""),
    phone: row.phone != null ? String(row.phone) : null,
    role: String(row.role ?? ""),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    last_sign_in_at: row.last_sign_in_at != null ? String(row.last_sign_in_at) : null,
    confirmed_at: row.confirmed_at != null ? String(row.confirmed_at) : null,
    email_confirmed_at: row.email_confirmed_at != null ? String(row.email_confirmed_at) : null,
    phone_confirmed_at: row.phone_confirmed_at != null ? String(row.phone_confirmed_at) : null,
    banned_until: row.banned_until != null ? String(row.banned_until) : null,
    is_sso_user: String(row.is_sso_user) === "true",
    providers: JSON.parse(String(row.providers ?? "[]")),
    user_metadata: parseJsonObj(String(row.user_metadata ?? "{}")),
    app_metadata: parseJsonObj(String(row.app_metadata ?? "{}")),
    identities,
  }
}

function parseJsonObj(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) }
  catch { return {} }
}

export async function deleteAuthUser(
  token: string,
  ref: string,
  userId: string,
): Promise<void> {
  await mgmt<unknown>(token, `/projects/${ref}/auth/users/${userId}`, { method: "DELETE" })
}

export async function runQuery(
  token: string,
  ref: string,
  query: string,
): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  try {
    const rows = await dbQuery(token, ref, query)
    return { rows }
  } catch (e) {
    return { rows: [], error: String(e) }
  }
}
