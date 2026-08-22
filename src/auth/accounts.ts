import { readFile, writeFile, mkdir, chmod, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { readToken } from "./index"

/**
 * Named Supabase accounts. Metadata lives in ~/.config/surp/accounts.json;
 * each account's access token is a separate 0600 file under tokens/.
 * The implicit "primary" account maps to the existing single-token flow
 * (:login / SUPABASE_ACCESS_TOKEN / Supabase CLI).
 */

const CONFIG_DIR = path.join(homedir(), ".config", "surp")
const ACCOUNTS_FILE = path.join(CONFIG_DIR, "accounts.json")
const TOKENS_DIR = path.join(CONFIG_DIR, "tokens")

export const PRIMARY_ACCOUNT_ID = "primary"

export interface SupabaseAccount {
  id: string
  name: string
  createdAt: string
}

export interface AccountRef {
  /** account id — "primary" resolves through the legacy single-token flow */
  id: string
  name: string
}

function newId(): string {
  return `sb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

async function readAccountsFile(): Promise<SupabaseAccount[]> {
  try {
    const raw = await readFile(ACCOUNTS_FILE, "utf8")
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed.accounts) ? parsed.accounts : []
  } catch {
    return []
  }
}

async function writeAccountsFile(accounts: SupabaseAccount[]): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(ACCOUNTS_FILE, JSON.stringify({ accounts }, null, 2))
}

/** All known accounts, primary first. */
export async function listAccounts(): Promise<AccountRef[]> {
  const extra = await readAccountsFile()
  return [
    { id: PRIMARY_ACCOUNT_ID, name: "primary" },
    ...extra.map((a) => ({ id: a.id, name: a.name })),
  ]
}

/** Resolve the access token for an account ("primary" → legacy token chain). */
export async function readAccountToken(accountId: string): Promise<string | null> {
  if (accountId === PRIMARY_ACCOUNT_ID) return readToken()
  try {
    const t = await readFile(path.join(TOKENS_DIR, accountId), "utf8")
    return t.trim() || null
  } catch {
    return null
  }
}

/** Create/update a named account. Returns its id. */
export async function saveAccount(name: string, token: string): Promise<SupabaseAccount> {
  const accounts = await readAccountsFile()
  const existing = accounts.find((a) => a.name === name.trim())
  const account: SupabaseAccount = existing ?? {
    id: newId(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  }
  if (!existing) accounts.push(account)
  await writeAccountsFile(accounts)

  await mkdir(TOKENS_DIR, { recursive: true })
  const tokenFile = path.join(TOKENS_DIR, account.id)
  await writeFile(tokenFile, token.trim(), { mode: 0o600 })
  try {
    await chmod(tokenFile, 0o600)
  } catch {}
  return account
}

export async function deleteAccount(id: string): Promise<void> {
  if (id === PRIMARY_ACCOUNT_ID) return
  const accounts = (await readAccountsFile()).filter((a) => a.id !== id)
  await writeAccountsFile(accounts)
  try {
    await unlink(path.join(TOKENS_DIR, id))
  } catch {}
}
