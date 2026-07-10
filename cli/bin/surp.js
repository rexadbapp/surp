#!/usr/bin/env node
// Wrapper: exec the platform-specific precompiled surp binary downloaded by postinstall.
import { execFileSync } from "node:child_process"
import { join, dirname } from "node:path"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

function platformKey() {
  const p = process.platform
  const a = process.arch
  if (p === "darwin" && a === "arm64") return "darwin-arm64"
  if (p === "darwin" && a === "x64") return "darwin-x64"
  if (p === "linux" && a === "x64") return "linux-x64"
  if (p === "linux" && a === "arm64") return "linux-arm64"
  if (p === "win32" && a === "x64") return "windows-x64"
  console.error(`surp: unsupported platform ${p}/${a}`)
  process.exit(1)
}

const ext = process.platform === "win32" ? ".exe" : ""
const binName = `surp-${platformKey()}${ext}`
const binPath = join(__dirname, binName)

if (!existsSync(binPath)) {
  console.error("surp binary not found. Reinstall with: npm install -g surp")
  process.exit(1)
}

try {
  execFileSync(binPath, process.argv.slice(2), { stdio: "inherit" })
} catch (e) {
  process.exit(typeof e?.status === "number" ? e.status : 1)
}
