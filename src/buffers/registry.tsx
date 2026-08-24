import type { BufferType, BufferRegistryEntry, BufferProps } from "./types"
import { ProjectsBuffer } from "./projects"
import { ConnectionsBuffer } from "./connections"
import { ImportBuffer } from "./import"
import { HomeBuffer } from "./home"
import { TablesBuffer } from "./tables"
import { TableBuffer } from "./table"
import { SqlBuffer } from "./sql"
import { AgentBuffer } from "./agent"
import { LoginBuffer } from "./login"
import { AccountBuffer } from "./account"
import { HelpBuffer } from "./help"
import { LintBuffer } from "./lint"
import { SchemaBuffer } from "./schema"
import { FunctionsBuffer } from "./functions"
import { FunctionBuffer } from "./function"
import { AddFunctionBuffer } from "./add-function"
import { StorageBuffer } from "./storage"
import { BucketBuffer } from "./bucket"
import { CreateBucketBuffer } from "./create-bucket"
import { DashboardBuffer } from "./dashboard"
import { ProfileBuffer } from "./profile"
import { LogsBuffer } from "./logs"
import { SettingsBuffer } from "./settings"
import { AuthConfigBuffer } from "./auth-config"
import { UsersBuffer } from "./users"
import { ProjectConfigBuffer } from "./project-config"
import { ProvidersBuffer } from "./providers"

const registry = new Map<BufferType, BufferRegistryEntry>()

function register(entry: BufferRegistryEntry) {
  registry.set(entry.type, entry)
}

register({ type: "dashboard", component: DashboardBuffer, defaultTitle: () => "surp" })
register({ type: "projects", component: ProjectsBuffer, defaultTitle: () => "Projects" })
register({ type: "connections", component: ConnectionsBuffer, defaultTitle: () => "Connections" })
register({ type: "import", component: ImportBuffer, defaultTitle: () => "Import" })
register({ type: "home", component: HomeBuffer, defaultTitle: (d) => d?.["projectName"] ?? d?.["project"] ?? "Home" })
register({ type: "tables", component: TablesBuffer, defaultTitle: (d) => d?.["projectName"] ? `${d["projectName"]}/tables` : "Tables" })
register({ type: "table", component: TableBuffer, defaultTitle: (d) => d?.["table"] ? `${d["schema"] ?? "public"}.${d["table"]}` : "Table" })
register({ type: "sql", component: SqlBuffer, defaultTitle: (d) => d?.["table"] ? `SQL:${d["table"]}` : "SQL" })
register({ type: "agent", component: AgentBuffer, defaultTitle: () => "AI" })
register({ type: "login", component: LoginBuffer, defaultTitle: () => "Login" })
register({ type: "account", component: AccountBuffer, defaultTitle: () => "About" })
register({ type: "help",  component: HelpBuffer,  defaultTitle: () => "Help" })
register({ type: "lint",   component: LintBuffer,   defaultTitle: (d) => d?.["project"] ? `Lint: ${d["project"]}` : "Lint" })
register({ type: "schema",    component: SchemaBuffer,    defaultTitle: (d) => d?.["schema"] ? `Schema: ${d["schema"]}` : "Schema" })
register({ type: "functions", component: FunctionsBuffer, defaultTitle: (d) => d?.["project"] ? `Functions: ${d["project"]}` : "Functions" })
register({ type: "function",  component: FunctionBuffer,  defaultTitle: (d) => d?.["slug"] ? `fn:${d["slug"]}` : "Function" })
register({ type: "add-function", component: AddFunctionBuffer, defaultTitle: () => "New Function" })
register({ type: "storage",  component: StorageBuffer,  defaultTitle: (d) => d?.["project"] ? `Storage: ${d["project"]}` : "Storage" })
register({ type: "bucket",   component: BucketBuffer,   defaultTitle: (d) => d?.["bucketName"] ? `Bucket: ${d["bucketName"]}` : "Bucket" })
register({ type: "create-bucket", component: CreateBucketBuffer, defaultTitle: () => "Create Bucket" })
register({ type: "profile", component: ProfileBuffer, defaultTitle: () => "Profile" })
register({ type: "auth-config", component: AuthConfigBuffer, defaultTitle: (d) => d?.["project"] ? `Auth: ${d["project"]}` : "Auth Config" })
register({ type: "users", component: UsersBuffer, defaultTitle: (d) => d?.["project"] ? `Users: ${d["project"]}` : "Users" })
register({ type: "project-config", component: ProjectConfigBuffer, defaultTitle: (d) => d?.["project"] ? `Config: ${d["project"]}` : "Project Config" })
register({ type: "providers", component: ProvidersBuffer, defaultTitle: (d) => d?.["project"] ? `Providers: ${d["project"]}` : "Providers" })
register({ type: "settings", component: SettingsBuffer, defaultTitle: (d) => d?.["projectName"] ? `Settings: ${d["projectName"]}` : "Settings" })
register({ type: "logs",   component: LogsBuffer,   defaultTitle: (d) => d?.["project"] ? `Logs: ${d["project"]}` : "Logs" })
register({ type: "auth-users", component: UsersBuffer, defaultTitle: (d) => d?.["project"] ? `Auth Users: ${d["project"]}` : "Auth Users" })
register({ type: "auth-user",  component: UsersBuffer,  defaultTitle: (d) => d?.["email"] ?? d?.["userId"] ?? "Auth User" })

export function getBufferComponent(type: BufferType): BufferRegistryEntry | undefined {
  return registry.get(type)
}

export function renderBuffer(props: BufferProps) {
  const entry = getBufferComponent(props.meta.type)
  if (!entry) {
    return (
      <box paddingLeft={2} paddingTop={1}>
        <text fg="#f38ba8">Unknown buffer type: {props.meta.type}</text>
      </box>
    )
  }
  const Component = entry.component
  return <Component {...props} />
}
