#!/usr/bin/env bun
/**
 * Build pipeline for surp:
 * 1. Bundle with Solid plugin (Bun.build API)
 * 2. Obfuscate with javascript-obfuscator (HIGH)
 * 3. Compile to standalone binary with bun --compile
 *
 * Usage:
 *   node scripts/build.mjs                  # build for host platform
 *   node scripts/build.mjs --target=bun-darwin-arm64
 *   node scripts/build.mjs --target=bun-darwin-x64
 *   node scripts/build.mjs --target=bun-linux-x64
 *   node scripts/build.mjs --target=bun-windows-x64
 *   node scripts/build.mjs --skip-obfuscate  # skip obfuscation (dev)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createHash } from "crypto"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

// Parse args
const args = process.argv.slice(2)
const TARGET = args.find((a) => a.startsWith("--target="))?.split("=")[1] || ""
const OUTFILE = args.find((a) => a.startsWith("--outfile="))?.split("=")[1] || ""
const SKIP_OBFUSCATE = args.includes("--skip-obfuscate")
const OBF_ONLY = args.includes("--obf-only")

// Inject version from package.json so the binary reports the right version
let APP_VERSION = "0.0.0"
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
  APP_VERSION = pkg.version || APP_VERSION
} catch {}

const OUT_DIR = join(ROOT, "dist")

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  // ── 1. Bundle ──
  console.log("[build] bundling src/index.tsx...")

  // Import the OpenTUI Solid plugin
  const { default: solidPlugin } = await import("@opentui/solid/bun-plugin")

  // @opentui/core dynamically imports platform-specific native .dylib;
  // must stay external so runtime resolution works.
  const external = [
    "@opentui/core-darwin-arm64",
    "@opentui/core-darwin-x64",
    "@opentui/core-linux-arm64",
    "@opentui/core-linux-arm64-musl",
    "@opentui/core-linux-x64",
    "@opentui/core-linux-x64-musl",
    "@opentui/core-win32-arm64",
    "@opentui/core-win32-x64",
  ]

  const buildResult = await Bun.build({
    entrypoints: [join(ROOT, "src", "index.tsx")],
    outdir: OUT_DIR,
    target: "bun",
    format: "esm",
    plugins: [solidPlugin],
    minify: {
      whitespace: true,
      syntax: true,
      identifiers: false,
    },
    external,
    sourcemap: "none",
    // Inline SURP_VERSION so CURRENT_VERSION default in config picks it up
    define: { "process.env.SURP_VERSION": JSON.stringify(APP_VERSION) },
  })

  if (!buildResult.success) {
    console.error("[build] bundling failed:")
    for (const err of buildResult.logs) {
      console.error(`  ${err}`)
    }
    process.exit(1)
  }

  const mainJs = join(OUT_DIR, "index.js")
  const bundleSize = existsSync(mainJs)
    ? (readFileSync(mainJs).length / 1024 / 1024).toFixed(1)
    : "?"
  console.log(`[build] bundle written to ${mainJs} (${bundleSize} MB, ${buildResult.outputs.length} outputs)`)

  if (OBF_ONLY) return

  // ── 2. Obfuscate ──
  if (!SKIP_OBFUSCATE) {
    console.log("[build] obfuscating with javascript-obfuscator (HIGH)...")
    const JavaScriptObfuscator = (await import("javascript-obfuscator")).default

    const code = readFileSync(mainJs, "utf8")
    const result = JavaScriptObfuscator.obfuscate(code, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.4,
      debugProtection: false,
      disableConsoleOutput: false,
      identifierNamesGenerator: "hexadecimal",
      identifiersPrefix: "_s",
      renameGlobals: false,
      selfDefending: false,
      simplify: true,
      splitStrings: true,
      splitStringsChunkLength: 10,
      stringArray: true,
      stringArrayEncoding: ["base64"],
      stringArrayThreshold: 0.75,
      target: "node",
      transformObjectKeys: false,
      unicodeEscapeSequence: false,
      renameProperties: false,
    })
    writeFileSync(mainJs, result.getObfuscatedCode())
    console.log(`[build] obfuscation done (${(result.getObfuscatedCode().length / 1024 / 1024).toFixed(1)} MB)`)
  } else {
    console.log("[build] skipping obfuscation")
  }

  // ── 3. Compile ──
  const targetFlag = TARGET ? `--target=${TARGET}` : ""
  const outName = OUTFILE
    ? OUTFILE
    : `surp${process.platform === "win32" ? ".exe" : ""}`
  const outPath = OUTFILE
    ? (OUTFILE.includes("/") || OUTFILE.includes("\\") ? OUTFILE : join(OUT_DIR, OUTFILE))
    : join(OUT_DIR, outName)

  console.log(`[build] compiling to binary...`)
  const proc = Bun.spawnSync([
    "bun",
    "build",
    "--compile",
    ...(targetFlag ? [targetFlag] : []),
    mainJs,
    "--outfile",
    outPath,
  ], {
    cwd: ROOT,
    stdio: ["inherit", "inherit", "inherit"],
  })

  if (proc.exitCode !== 0) {
    console.error("[build] compilation failed")
    process.exit(proc.exitCode ?? 1)
  }

  console.log(`[build] binary written: ${outPath}`)
  console.log("[build] done")
}

main().catch((err) => {
  console.error("[build] error:", err)
  process.exit(1)
})
