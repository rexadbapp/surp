import { readFile, writeFile, mkdir, chmod } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import type { PostgresProfile } from "./types"

/**
 * Saved connection profiles + pinned Supabase projects.
 * Stored at ~/.config/surp/connections.json with 0600 permissions
 * (passwords are plaintext by design — same trust level as ~/.pgpass;
 * the file is never world-readable).
 */

const CONFIG_DIR = path.join(homedir(), ".config", "surp")
const STORE_FILE = path.join(CONFIG_DIR, "connections.json")

/** A Supabase project imported onto the home page */
export interface PinnedProject {
  ref: string
  name: string
  accountId: string
}

interface StoreShape {
  profiles?: PostgresProfile[]
  pinned?: PinnedProject[]
}

function newId(): string {
  return `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

async function readStore(): Promise<StoreShape> {
  try {
    const raw = await readFile(STORE_FILE, "utf8")
    return JSON.parse(raw) as StoreShape
  } catch {
    return {}
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  const data = JSON.stringify(store, null, 2)
  await writeFile(STORE_FILE, data)
  try {
    await chmod(STORE_FILE, 0o600)
  } catch {}
}

export async function listProfiles(): Promise<PostgresProfile[]> {
  const store = await readStore()
  return store.profiles ?? []
}

/** Upsert a profile. If one with the same name exists it is replaced. */
export async function saveProfile(
  input: Omit<PostgresProfile, "id" | "createdAt"> & { id?: string },
): Promise<PostgresProfile> {
  const store = await readStore()
  const profiles = store.profiles ?? []
  const existingIdx = input.id
    ? profiles.findIndex((p) => p.id === input.id)
    : profiles.findIndex((p) => p.name === input.name)

  const profile: PostgresProfile = {
    ...input,
    id: existingIdx >= 0 ? profiles[existingIdx]!.id : newId(),
    createdAt: existingIdx >= 0 ? profiles[existingIdx]!.createdAt : new Date().toISOString(),
  }

  if (existingIdx >= 0) profiles[existingIdx] = profile
  else profiles.push(profile)

  await writeStore({ ...store, profiles })
  return profile
}

export async function deleteProfile(id: string): Promise<void> {
  const store = await readStore()
  const profiles = (store.profiles ?? []).filter((p) => p.id !== id)
  await writeStore({ ...store, profiles })
}

// ── pinned Supabase projects ───────────────────────────────────

export async function listPinned(): Promise<PinnedProject[]> {
  const store = await readStore()
  return store.pinned ?? []
}

/** Set the entire pin list (import screen checks/unchecks, we persist the result). */
export async function setPinned(pinned: PinnedProject[]): Promise<void> {
  const store = await readStore()
  await writeStore({ ...store, pinned })
}
