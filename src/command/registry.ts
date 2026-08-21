export interface Command {
  name: string
  description: string
  /** Short alias (like nvim :q, :w) */
  alias?: string[]
  execute: (args: string) => void | Promise<void>
}

const registry = new Map<string, Command>()

export function registerCommand(cmd: Command): void {
  registry.set(cmd.name, cmd)
  for (const alias of cmd.alias ?? []) {
    registry.set(alias, cmd)
  }
}

export function getCommand(name: string): Command | undefined {
  return registry.get(name)
}

export function getAllCommands(): Command[] {
  const seen = new Set<Command>()
  const result: Command[] = []
  for (const cmd of registry.values()) {
    if (!seen.has(cmd)) {
      seen.add(cmd)
      result.push(cmd)
    }
  }
  return result
}

/** Filter commands by substring match on name or alias. Prefix matches sort first. */
export function filterCommands(query: string): Command[] {
  if (!query) return getAllCommands()
  const q = query.toLowerCase()
  const out = getAllCommands().filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.alias?.some((a) => a.toLowerCase().includes(q)),
  )
  // prefix matches first
  out.sort((a, b) => {
    const aP = a.name.toLowerCase().startsWith(q) || a.alias?.some((a) => a.toLowerCase().startsWith(q))
    const bP = b.name.toLowerCase().startsWith(q) || b.alias?.some((a) => a.toLowerCase().startsWith(q))
    return aP === bP ? 0 : aP ? -1 : 1
  })
  return out
}

export function executeCommandLine(line: string): Promise<void> {
  const [name, ...rest] = line.trim().split(/\s+/)
  if (!name) return Promise.resolve()
  const args = rest.join(" ")
  const cmd = getCommand(name)
  if (!cmd) {
    console.error(`surp: unknown command: ${name}`)
    return Promise.resolve()
  }
  return Promise.resolve(cmd.execute(args))
}
