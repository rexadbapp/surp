import { UPDATE_REPO, CURRENT_VERSION } from "../version"

export type UpdateManifest = {
  version: string
  notes: string
  pub_date: string
  platforms: Record<string, {
    url: string
    sha256: string
  }>
}

function platformKey(): string {
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  const os = process.platform === "darwin" ? "darwin"
    : process.platform === "win32" ? "windows"
    : "linux"
  return `${os}-${arch}`
}

export type UpdateCheckResult =
  | { available: true; manifest: UpdateManifest; currentVersion: string; platformKey: string }
  | { available: false; currentVersion: string }

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!UPDATE_REPO) {
    return { available: false, currentVersion: CURRENT_VERSION }
  }

  // Fetch latest.json from GitHub releases
  const url = `https://github.com/${UPDATE_REPO}/releases/latest/download/latest.json`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return { available: false, currentVersion: CURRENT_VERSION }

    const manifest = (await res.json()) as UpdateManifest
    const pk = platformKey()

    // Compare versions
    if (compareVersions(manifest.version, CURRENT_VERSION) > 0 && manifest.platforms[pk]) {
      return { available: true, manifest, currentVersion: CURRENT_VERSION, platformKey: pk }
    }

    return { available: false, currentVersion: CURRENT_VERSION }
  } catch {
    return { available: false, currentVersion: CURRENT_VERSION }
  }
}

export async function performUpdate(result: UpdateCheckResult & { available: true }): Promise<void> {
  const asset = result.manifest.platforms[result.platformKey]
  if (!asset) throw new Error(`No binary for platform: ${result.platformKey}`)

  // Download the update
  const res = await fetch(asset.url, { signal: AbortSignal.timeout(120000) })
  if (!res.ok) throw new Error(`Update download failed: ${res.status}`)
  const buffer = await res.arrayBuffer()

  // Verify SHA-256
  const hash = await crypto.subtle.digest("SHA-256", buffer)
  const hashHex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  if (hashHex !== asset.sha256) {
    throw new Error(`SHA-256 mismatch: expected ${asset.sha256}, got ${hashHex}`)
  }

  // Write to temp file, then replace the running binary
  const currentPath = process.execPath
  const tmpPath = currentPath + ".new"
  await Bun.write(tmpPath, buffer)
  await fsChmod(tmpPath, 0o755)

  // On macOS, execPath might point inside the .app bundle
  // For a standalone bun-compiled binary, we can replace directly
  try {
    await fsRename(tmpPath, currentPath)
  } catch {
    // If that fails (e.g. cross-device), try copy + unlink
    await fsCopy(tmpPath, currentPath)
    await fsUnlink(tmpPath)
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

// Tiny wrappers to avoid heavy imports
const fsChmod = (p: string, mode: number) =>
  import("node:fs/promises").then((m) => m.chmod(p, mode))
const fsRename = (a: string, b: string) =>
  import("node:fs/promises").then((m) => m.rename(a, b))
const fsCopy = (a: string, b: string) =>
  import("node:fs/promises").then((m) => m.copyFile(a, b))
const fsUnlink = (p: string) =>
  import("node:fs/promises").then((m) => m.unlink(p))
