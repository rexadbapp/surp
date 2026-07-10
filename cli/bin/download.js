#!/usr/bin/env node
// postinstall: download the precompiled surp binary for this platform from GitHub Releases.
// No source code is shipped in this npm package.
import { createWriteStream } from "node:fs"
import { mkdir, chmod, access, readFile, rm } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { get as httpsGet } from "node:https"
import { get as httpGet } from "node:http"
import { execSync } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = "rexadbapp/surp"

function platformKey() {
  const p = process.platform
  const a = process.arch
  if (p === "darwin" && a === "arm64") return "darwin-arm64"
  if (p === "darwin" && a === "x64") return "darwin-x64"
  if (p === "linux" && a === "x64") return "linux-x64"
  if (p === "linux" && a === "arm64") return "linux-arm64"
  if (p === "win32" && a === "x64") return "windows-x64"
  throw new Error(`surp: unsupported platform ${p}/${a}`)
}

// Map platform key to opentui native package name used in GitHub Release tarball
function nativePkgName(key) {
  if (key === "windows-x64") return "core-win32-x64"
  return `core-${key}`
}

async function main() {
  const pkg = JSON.parse(await readFile(join(__dirname, "..", "package.json"), "utf8"))
  const version = pkg.version
  const key = platformKey()
  const ext = process.platform === "win32" ? ".exe" : ""
  const assetName = `surp-${key}${ext}`
  const url = `https://github.com/${REPO}/releases/download/v${version}/${assetName}`
  const outPath = join(__dirname, assetName)

  // Skip binary + native pkg if already present
  const nativePkg = nativePkgName(key)
  const nativeDir = join(__dirname, "node_modules", "@opentui", nativePkg)
  const nativeReady = await access(nativeDir).then(() => true).catch(() => false)

  let binaryReady = false
  try {
    await access(outPath)
    binaryReady = true
  } catch {}

  if (binaryReady && nativeReady) {
    console.log(`surp: already installed (${assetName} + ${nativePkg})`)
    return
  }

  await mkdir(dirname(outPath), { recursive: true })

  if (!binaryReady) {
    console.log(`surp: downloading ${assetName} (v${version})...`)
    await download(url, outPath)
    if (process.platform !== "win32") await chmod(outPath, 0o755)
  }

  if (!nativeReady) {
    const tarballName = `${nativePkg}.tar.gz`
    const tarballUrl = `https://github.com/${REPO}/releases/download/v${version}/${tarballName}`
    const tarballPath = join(__dirname, tarballName)
    try {
      console.log(`surp: downloading ${tarballName} (native addon)...`)
      await download(tarballUrl, tarballPath)
      execSync(`tar -xzf ${JSON.stringify(tarballPath)} -C ${JSON.stringify(__dirname)}`)
      await rm(tarballPath)
      console.log(`surp: native addon extracted ✓`)
    } catch (e) {
      // Backwards compat: older releases may not have tarball
      console.error(`surp: native addon download failed (${e.message}), binary may not work`)
      console.error("surp: manually download from https://github.com/rexadbapp/surp/releases")
    }
  }

  console.log("surp: installed ✓")
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith("https") ? httpsGet : httpGet
    get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).href
        res.resume()
        return download(next, dest).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        reject(new Error(`surp: download failed (HTTP ${res.statusCode}) for ${url}`))
        return
      }
      const file = createWriteStream(dest)
      res.pipe(file)
      file.on("finish", () => file.close(() => resolve()))
      file.on("error", reject)
    }).on("error", reject)
  })
}

main().catch((err) => {
  console.error(err.message || err)
  console.error("surp: install failed — get a binary from https://github.com/rexadbapp/surp/releases")
  process.exit(1)
})
