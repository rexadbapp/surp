import fs from "fs"
import os from "os"
import path from "path"

export interface LocalSnippet {
  id: string
  name: string
  sql: string
  created_at: string
}

function snippetsFile(ref: string): string {
  const dir = path.join(os.homedir(), ".surp")
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `snippets-${ref}.json`)
}

export function readLocalSnippets(ref: string): LocalSnippet[] {
  try {
    return JSON.parse(fs.readFileSync(snippetsFile(ref), "utf8")) as LocalSnippet[]
  } catch {
    return []
  }
}

export function saveLocalSnippet(ref: string, name: string, sql: string): LocalSnippet {
  const list = readLocalSnippets(ref)
  const snippet: LocalSnippet = { id: `local-${Date.now()}`, name, sql, created_at: new Date().toISOString() }
  list.unshift(snippet)
  fs.writeFileSync(snippetsFile(ref), JSON.stringify(list, null, 2))
  return snippet
}

export function deleteLocalSnippet(ref: string, id: string): void {
  const list = readLocalSnippets(ref).filter(s => s.id !== id)
  fs.writeFileSync(snippetsFile(ref), JSON.stringify(list, null, 2))
}
