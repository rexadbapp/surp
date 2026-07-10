#!/usr/bin/env bun
/**
 * Release script for surp.
 *
 * Flow:
 *   1. Prompt for release version (defaults to package.json version)
 *   2. If version differs from package.json, offer to bump package.json + src config + cli
 *   3. Build surp for ALL platforms (obfuscated) into dist/release/<version>/
 *   4. Generate latest.json (update metadata for the in-app self-updater)
 *   5. If a GitHub release for this version already exists, prompt to delete & recreate
 *   6. Upload binaries + latest.json via `gh release create`
 *   7. Optionally `npm publish` the cli/ downloader package
 *
 * Usage:
 *   bun run scripts/release.mjs
 *
 * Env:
 *   SURP_UPDATE_REPO  — GitHub "owner/repo" for releases (default: rexadbapp/surp)
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { createInterface } from "node:readline/promises"
import { execSync } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const REPO = process.env["SURP_UPDATE_REPO"] || "rexadbapp/surp"

const rl = createInterface({ input: process.stdin, output: process.stdout })

async function ask(q, def) {
  const a = (await rl.question(`${q}${def ? ` (${def})` : ""}: `)).trim()
  return a || def || ""
}
async function confirm(q, def = false) {
  const a = (await rl.question(`${q} ${def ? "(Y/n)" : "(y/N)"}: `)).trim().toLowerCase()
  return a ? a === "y" : def
}

const PLATFORMS = [
  { name: "darwin-arm64", target: "bun-darwin-arm64", ext: "" },
  { name: "darwin-x64", target: "bun-darwin-x64", ext: "" },
  { name: "linux-x64", target: "bun-linux-x64", ext: "" },
  { name: "windows-x64", target: "bun-windows-x64", ext: ".exe" },
]

async function sha256(path) {
  const buf = await readFile(path)
  return createHash("sha256").update(buf).digest("hex")
}

async function updateConfigVersion(version) {
  const cfgPath = join(ROOT, "src", "backend", "config.ts")
  if (!existsSync(cfgPath)) return
  const src = await readFile(cfgPath, "utf8")
  const next = src.replace(
    /process\.env\.SURP_VERSION\s*\?\?\s*"[^"]*"/,
    `process.env.SURP_VERSION ?? "${version}"`,
  )
  if (next !== src) await writeFile(cfgPath, next)
}

async function updateCliVersion(version) {
  const cliPkg = join(ROOT, "cli", "package.json")
  if (!existsSync(cliPkg)) return
  const pkg = JSON.parse(await readFile(cliPkg, "utf8"))
  pkg.version = version
  await writeFile(cliPkg, JSON.stringify(pkg, null, 2) + "\n")
}

async function main() {
  console.log(`[release] target repo: ${REPO}`)

  const pkgPath = join(ROOT, "package.json")
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"))
  const currentVersion = pkg.version

  const releaseVersion = await ask("Release version", currentVersion)
  if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) {
    console.error("[release] invalid version — use semver (e.g. 0.2.0)")
    process.exit(1)
  }

  if (releaseVersion !== currentVersion) {
    if (await confirm(`Bump package.json ${currentVersion} → ${releaseVersion}?`)) {
      pkg.version = releaseVersion
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
      await updateConfigVersion(releaseVersion)
      await updateCliVersion(releaseVersion)
      console.log(`[release] bumped version to ${releaseVersion}`)
    } else {
      console.log(`[release] keeping package.json at ${currentVersion}; releasing as ${releaseVersion}`)
    }
  }

  const tag = `v${releaseVersion}`

  // Check for existing release
  let exists = false
  try {
    execSync(`gh release view ${tag} --repo ${REPO}`, { stdio: "ignore" })
    exists = true
  } catch {}
  if (exists) {
    if (await confirm(`Release ${tag} already exists. Delete & recreate?`)) {
      execSync(`gh release delete ${tag} -y --repo ${REPO}`, { stdio: ["ignore", "inherit", "inherit"] })
    } else {
      console.log("[release] aborted")
      process.exit(0)
    }
  }

  // Build all platforms
  const releaseDir = join(ROOT, "dist", "release", releaseVersion)
  await rm(releaseDir, { recursive: true, force: true })
  await mkdir(releaseDir, { recursive: true })

  const assets = []
  for (const p of PLATFORMS) {
    const outName = `surp-${p.name}${p.ext}`
    const outPath = join(releaseDir, outName)
    console.log(`[release] building ${p.name} (${p.target})...`)
    const proc = Bun.spawnSync(
      ["bun", "run", "scripts/build.mjs", `--target=${p.target}`, `--outfile=${outPath}`],
      { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] },
    )
    if (proc.exitCode !== 0) {
      console.error(`[release] build failed for ${p.name}`)
      process.exit(1)
    }
    const hash = await sha256(outPath)
    assets.push(outPath)
    await writeFile(outPath + ".sha256", hash + "\n")
    console.log(`[release]   sha256: ${hash}`)

    // Tar.gz the platform-specific native package alongside the binary
    const pkgName = `core-${p.name === "windows-x64" ? "win32-x64" : p.name}`
    const pkgDir = join(releaseDir, "node_modules", "@opentui", pkgName)
    if (existsSync(pkgDir)) {
      const tarball = join(releaseDir, `${pkgName}.tar.gz`)
      // Preserve node_modules/@opentui/core-* path inside tar
      const tarProc = Bun.spawnSync([
        "tar", "-czf", tarball,
        "-C", releaseDir,
        `node_modules/@opentui/${pkgName}`,
      ])
      if (tarProc.exitCode === 0) {
        assets.push(tarball)
        console.log(`[release]   packaged ${tarball}`)
      }
    }
  }

  // latest.json for the in-app self-updater
  const platforms = {}
  for (const p of PLATFORMS) {
    const outName = `surp-${p.name}${p.ext}`
    const outPath = join(releaseDir, outName)
    platforms[p.name] = {
      url: `https://github.com/${REPO}/releases/download/${tag}/${outName}`,
      sha256: await sha256(outPath),
      size: (await readFile(outPath)).length,
    }
  }
  const manifest = {
    version: releaseVersion,
    notes: `surp v${releaseVersion}`,
    pub_date: new Date().toISOString(),
    platforms,
  }
  const manifestPath = join(releaseDir, "latest.json")
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  assets.push(manifestPath)
  console.log(`[release] wrote ${manifestPath}`)

  // Create the GitHub release
  const notesFile = join(releaseDir, "release-notes.md")
  await writeFile(notesFile, `surp v${releaseVersion}\n\nSee latest.json for update metadata.\n`)
  assets.push(notesFile)

  console.log(`[release] creating GitHub release ${tag}...`)
  execSync(
    `gh release create ${tag} --repo ${REPO} --title "surp ${releaseVersion}" --notes-file ${JSON.stringify(notesFile)} ${assets.map((a) => JSON.stringify(a)).join(" ")}`,
    { stdio: ["ignore", "inherit", "inherit"] },
  )
  console.log(`[release] ✅ published ${tag}`)

  // npm publish the downloader package
  if (existsSync(join(ROOT, "cli", "package.json"))) {
    if (await confirm("Publish npm package (cli/)?")) {
      execSync("npm publish", { cwd: join(ROOT, "cli"), stdio: "inherit" })
      console.log("[release] ✅ npm package published")
    }
  }

  rl.close()
}

main().catch((err) => {
  console.error("[release] error:", err)
  rl.close()
  process.exit(1)
})
