import { readFile, writeFile, mkdir } from "node:fs/promises"
import { homedir, platform } from "node:os"
import path from "node:path"

const SURP_CONFIG_DIR = path.join(homedir(), ".config", "surp")
const SURP_TOKEN_FILE = path.join(SURP_CONFIG_DIR, "token")

function supabaseConfigDir(): string {
  if (platform() === "darwin") {
    return path.join(homedir(), "Library", "Application Support", "supabase")
  }
  return path.join(homedir(), ".config", "supabase")
}

export async function readToken(): Promise<string | null> {
  if (process.env["SUPABASE_ACCESS_TOKEN"]) {
    return process.env["SUPABASE_ACCESS_TOKEN"]
  }
  // Try Supabase CLI's stored token
  try {
    const t = await readFile(path.join(supabaseConfigDir(), "access-token"), "utf8")
    if (t.trim()) return t.trim()
  } catch {}
  // Try surp's own config
  try {
    const t = await readFile(SURP_TOKEN_FILE, "utf8")
    if (t.trim()) return t.trim()
  } catch {}
  return null
}

export async function saveToken(token: string): Promise<void> {
  await mkdir(SURP_CONFIG_DIR, { recursive: true })
  await writeFile(SURP_TOKEN_FILE, token.trim(), { mode: 0o600 })
}

export async function clearToken(): Promise<void> {
  try {
    const { unlink } = await import("node:fs/promises")
    await unlink(SURP_TOKEN_FILE)
  } catch {}
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.supabase.com/v1/projects", {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.ok
  } catch {
    return false
  }
}
