import { createSignal, createEffect, For, Show, onMount } from "solid-js"
import { useAuth } from "../context/auth"
import { useKeymap } from "../context/keymap"
import { useYank } from "../context/yank"
import { getStorageObjects, deleteStorageObject, fetchStorageObjectPreview, type StorageObject } from "../auth/api"
import type { BufferProps } from "./types"
import { COLORS } from "../ui/colors"

const objCache = new Map<string, StorageObject[]>()

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    })
  } catch { return iso }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function isTextMime(mime: string): boolean {
  const m = mime.toLowerCase()
  return m.startsWith("text/") || m === "application/json" || m === "application/javascript" || m === "application/xml" || m === "application/yaml"
}
function isImageMime(mime: string): boolean { return mime.toLowerCase().startsWith("image/") }
function isVideoMime(mime: string): boolean { return mime.toLowerCase().startsWith("video/") }
function trunc(s: string, w: number) { return s.length <= w ? s : s.slice(0, Math.max(0, w - 1)) + "…" }
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")
}

export function BucketBuffer(props: BufferProps) {
  const auth = useAuth()
  const keymap = useKeymap()
  const yank = useYank()

  const projectRef = () => String(props.meta.data?.["project"] ?? "")
  const bucketId = () => String(props.meta.data?.["bucketId"] ?? "")
  const bucketName = () => String(props.meta.data?.["bucketName"] ?? bucketId())

  const [objects, setObjects] = createSignal<StorageObject[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [cursor, setCursor] = createSignal(0)
  const [previewText, setPreviewText] = createSignal<string | null>(null)
  const [previewPixels, setPreviewPixels] = createSignal<number[] | null>(null)
  const [previewPw, setPreviewPw] = createSignal(0)
  const [previewPh, setPreviewPh] = createSignal(0)
  const [previewLoading, setPreviewLoading] = createSignal(false)

  const cacheKey = () => `${projectRef()}/${bucketId()}`
  const leftWidth = () => Math.max(18, Math.floor(props.width * 0.38))
  const rightWidth = () => props.width - leftWidth()
  let previewReqId = 0

  async function load(force = false) {
    const token = auth.token()
    const ref = projectRef()
    const bId = bucketId()
    if (!token || !ref || !bId) { setLoading(false); return }
    if (!force) {
      const cached = objCache.get(cacheKey())
      if (cached) { setObjects(cached); setLoading(false); return }
    }
    setLoading(true)
    setError(null)
    try {
      const list = await getStorageObjects(token, ref, bId)
      objCache.set(cacheKey(), list)
      setObjects(list)
      setCursor(0)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  onMount(() => void load())

  createEffect(() => {
    const obj = objects()[cursor()]
    setPreviewText(null)
    setPreviewPixels(null)
    setPreviewPw(0)
    setPreviewPh(0)
    setPreviewLoading(false)
    if (!obj) return
    const mime = obj.metadata?.mimetype ?? ""
    const id = ++previewReqId
    setPreviewLoading(true)

    if (isTextMime(mime)) {
      fetchStorageObjectPreview(projectRef(), bucketId(), obj.name, 4096)
        .then((text) => {
          if (id === previewReqId) setPreviewText(text || "(empty)")
        })
        .catch(() => {})
        .finally(() => {
          if (id === previewReqId) setPreviewLoading(false)
        })
    } else if (isImageMime(mime)) {
      const url = `https://${projectRef()}.supabase.co/storage/v1/object/public/${bucketId()}/${obj.name}`
      setPreviewPixels(null)
      imageToPixels(url, rightWidth() - 2)
        .then((data) => {
          if (id === previewReqId && data) {
            setPreviewPixels(data.p)
            setPreviewPw(data.w)
            setPreviewPh(data.h)
          }
        })
        .catch(() => {})
        .finally(() => {
          if (id === previewReqId) setPreviewLoading(false)
        })
    } else {
      setPreviewLoading(false)
    }
  })

  keymap.onAction("move_up", () => {
    if (!props.focused) return
    setCursor((c) => Math.max(0, c - 1))
  })
  keymap.onAction("move_down", () => {
    if (!props.focused) return
    setCursor((c) => Math.min(objects().length - 1, c + 1))
  })
  keymap.onAction("yank", () => {
    if (!props.focused) return
    const obj = objects()[cursor()]
    if (obj) {
      const url = `https://${projectRef()}.supabase.co/storage/v1/object/public/${bucketId()}/${obj.name}`
      yank.yank(url, obj.name)
    }
  })
  keymap.onAction("yank_row", () => {
    if (!props.focused) return
    const obj = objects()[cursor()]
    if (obj) {
      const url = `https://${projectRef()}.supabase.co/storage/v1/object/public/${bucketId()}/${obj.name}`
      const size = obj.metadata?.size ? formatSize(obj.metadata.size) : "—"
      const mime = obj.metadata?.mimetype ?? "—"
      yank.yank(`${obj.name}  ${size}  ${mime}  ${url}`, "object")
    }
  })
  keymap.onAction("select", () => {
    if (!props.focused) return
    const obj = objects()[cursor()]
    if (obj) {
      const url = `https://${projectRef()}.supabase.co/storage/v1/object/public/${bucketId()}/${obj.name}`
      yank.yank(url, obj.name)
    }
  })
  keymap.onAction("delete", () => {
    if (!props.focused) return
    const obj = objects()[cursor()]
    if (!obj) return
    const token = auth.token()
    const ref = projectRef()
    const bId = bucketId()
    if (!token || !ref || !bId) return
    deleteStorageObject(token, ref, bId, obj.name).then(() => {
      objCache.delete(cacheKey())
      void load(true)
    }).catch((e) => setError(String(e)))
  })
  keymap.onAction("refresh", () => {
    if (!props.focused) return
    objCache.delete(cacheKey())
    void load(true)
  })

  const totalSize = () => {
    let total = 0
    for (const obj of objects()) {
      if (obj.metadata?.size) total += obj.metadata.size
    }
    return total
  }

  const selected = () => objects()[cursor()]

  async function imageToPixels(url: string, maxWidth: number): Promise<{ p: number[]; w: number; h: number } | null> {
    const inputPath = `/tmp/surp-img-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const ppmPath = `/tmp/surp-ppm-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      const resp = await fetch(url)
      if (!resp.ok) return null
      const buf = await resp.arrayBuffer()
      await Bun.write(inputPath, new Uint8Array(buf))

      const res = Bun.spawnSync(["sips", "-s", "format", "pbm", "--resampleWidth", String(Math.min(maxWidth, 80)), inputPath, "--out", ppmPath])
      if (res.exitCode !== 0) return null

      const ppmBuf = Bun.file(ppmPath)
      const ppmBytes = await ppmBuf.arrayBuffer()
      const txt = new TextDecoder().decode(ppmBytes)

      const lines = txt.split("\n")
      let i = 0
      while (i < lines.length && (lines[i].trim() === "" || lines[i].startsWith("#"))) i++
      if (i >= lines.length || lines[i].trim() !== "P3") return null
      i++

      while (i < lines.length && lines[i].trim() === "") i++
      while (i < lines.length && lines[i].startsWith("#")) { i++ }
      while (i < lines.length && lines[i].trim() === "") i++

      const dimParts = lines[i]?.trim().split(/\s+/)
      if (!dimParts || dimParts.length < 2) return null
      const w = parseInt(dimParts[0])
      const h = parseInt(dimParts[1])
      if (isNaN(w) || isNaN(h) || w < 1 || h < 1) return null
      i++

      while (i < lines.length && lines[i].trim() === "") i++
      const maxVal = parseInt(lines[i]?.trim())
      if (isNaN(maxVal) || maxVal < 1) return null
      i++

      const allTokens = lines.slice(i).join(" ").trim().split(/\s+/).filter(t => t !== "")
      const expected = w * h * 3
      if (allTokens.length < expected) return null

      const scale = maxVal === 255 ? 1 : 255 / maxVal
      const pixels: number[] = new Array(w * h * 3)
      for (let j = 0; j < w * h * 3; j++) {
        pixels[j] = Math.round(parseInt(allTokens[j]) * scale)
      }
      return { p: pixels, w, h }
    } catch {
      return null
    } finally {
      try { await Bun.write(inputPath, new Uint8Array(0)); await Bun.spawnSync(["rm", "-f", inputPath, ppmPath]) } catch {}
    }
  }

  function renderPreview(obj: StorageObject, pw: number) {
    const mime = obj.metadata?.mimetype ?? ""
    const size = obj.metadata?.size != null ? formatSize(obj.metadata.size) : "—"
    const metaLines = [
      { label: "Name", value: obj.name },
      { label: "MIME", value: mime || "—" },
      { label: "Size", value: size },
      { label: "Created", value: formatDate(obj.created_at) },
      { label: "Updated", value: formatDate(obj.updated_at) },
    ]

    if (isImageMime(mime)) {
      return (
        <box flexDirection="column" width={pw} paddingLeft={1} paddingTop={1}>
          <For each={metaLines}>
            {(line) => (
              <box height={1}>
                <text fg={COLORS.muted} width={8}>{line.label}</text>
                <text fg={COLORS.text}>{trunc(line.value, pw - 10)}</text>
              </box>
            )}
          </For>
          <box height={1} />
          <box width={pw - 2} height={1} backgroundColor={COLORS.border} />
          <Show when={previewLoading()}>
            <box height={1} paddingTop={1}><text fg={COLORS.yellow}>rendering image…</text></box>
          </Show>
          <Show when={!previewLoading() && previewPixels() !== null}>
            <box flexDirection="column" paddingTop={1} overflow={"hidden" as any}>
              {(function() {
                const p = previewPixels()!
                const w = previewPw()
                const h = previewPh()
                const rows: any[] = []
                for (let y = 0; y < h; y += 2) {
                  const cells: any[] = []
                  for (let x = 0; x < w; x++) {
                    const ti = (y * w + x) * 3
                    const topCol = rgbToHex(p[ti], p[ti + 1], p[ti + 2])
                    if (y + 1 < h) {
                      const bi = ((y + 1) * w + x) * 3
                      const botCol = rgbToHex(p[bi], p[bi + 1], p[bi + 2])
                      cells.push(<box width={1} height={1} backgroundColor={botCol}><text fg={topCol}>▀</text></box>)
                    } else {
                      cells.push(<box width={1} height={1} backgroundColor={COLORS.surface}><text fg={topCol}>▀</text></box>)
                    }
                  }
                  rows.push(<box height={1} flexDirection="row">{cells}</box>)
                }
                return rows
              })()}
            </box>
          </Show>
          <Show when={!previewLoading() && previewPixels() === null && !loading()}>
            <box height={1} paddingTop={1}><text fg={COLORS.subtext}>(rendering…)</text></box>
          </Show>
        </box>
      )
    }

    if (isVideoMime(mime)) {
      return (
        <box flexDirection="column" width={pw} paddingLeft={1} paddingTop={1}>
          <For each={metaLines}>
            {(line) => (
              <box height={1}>
                <text fg={COLORS.muted} width={8}>{line.label}</text>
                <text fg={COLORS.text}>{trunc(line.value, pw - 10)}</text>
              </box>
            )}
          </For>
          <box height={1} />
          <box height={1}><text fg={COLORS.subtext}>(video preview not supported in TUI)</text></box>
        </box>
      )
    }

    if (isTextMime(mime)) {
      return (
        <box flexDirection="column" width={pw} paddingLeft={1} paddingTop={1}>
          <For each={metaLines}>
            {(line) => (
              <box height={1}>
                <text fg={COLORS.muted} width={8}>{line.label}</text>
                <text fg={COLORS.text}>{trunc(line.value, pw - 10)}</text>
              </box>
            )}
          </For>
          <box height={1} />
          <box width={pw - 2} height={1} backgroundColor={COLORS.border} />
          <Show when={previewLoading()}>
            <box height={1} paddingTop={1}><text fg={COLORS.yellow}>loading preview…</text></box>
          </Show>
          <Show when={!previewLoading() && previewText() !== null}>
            <box flexDirection="column" paddingTop={1} overflow={"hidden" as any}>
              <For each={previewText()!.split("\n")}>
                {(line) => (
                  <box height={1}><text fg={COLORS.text}>{trunc(line, pw - 2)}</text></box>
                )}
              </For>
            </box>
          </Show>
          <Show when={!previewLoading() && previewText() === null && !loading()}>
            <box height={1} paddingTop={1}><text fg={COLORS.subtext}>(no preview content)</text></box>
          </Show>
        </box>
      )
    }

    return (
      <box flexDirection="column" width={pw} paddingLeft={1} paddingTop={1}>
        <For each={metaLines}>
          {(line) => (
            <box height={1}>
              <text fg={COLORS.muted} width={8}>{line.label}</text>
              <text fg={COLORS.text}>{trunc(line.value, pw - 10)}</text>
            </box>
          )}
        </For>
        <box height={1} />
        <box height={1}><text fg={COLORS.subtext}>(no preview for this file type)</text></box>
      </box>
    )
  }

  return (
    <box flexDirection="column" width={props.width} height={props.height} flexGrow={1}>
      <box paddingLeft={1} paddingRight={1} backgroundColor={COLORS.overlay} height={1} flexDirection="row">
        <text fg={COLORS.green} attributes={1}>Bucket  </text>
        <text fg={COLORS.text}>{bucketName()}</text>
        <text fg={COLORS.blue}>  {projectRef()}</text>
        <Show when={loading()}>
          <text fg={COLORS.yellow}>  loading…</text>
        </Show>
        <Show when={!loading() && !error()}>
          <text fg={COLORS.muted}>  {objects().length} object{objects().length !== 1 ? "s" : ""}</text>
          <Show when={objects().length > 0}>
            <text fg={COLORS.muted}>  ({formatSize(totalSize())})</text>
          </Show>
        </Show>
      </box>

      <box flexDirection="row" width={props.width} flexGrow={1}>
        <box flexDirection="column" width={leftWidth()} backgroundColor={COLORS.background}>
          <Show when={loading()}>
            <box paddingLeft={2} paddingTop={1}><text fg={COLORS.subtext}>Loading...</text></box>
          </Show>
          <Show when={error()}>
            <box paddingLeft={2} paddingTop={1}><text fg={COLORS.red}>{trunc(error()!, leftWidth() - 2)}</text></box>
          </Show>
          <Show when={!loading() && !error() && objects().length === 0}>
            <box paddingLeft={2} paddingTop={1}><text fg={COLORS.subtext}>This bucket is empty.</text></box>
          </Show>
          <Show when={!loading()}>
            <For each={objects()}>
              {(obj, i) => {
                const active = () => props.focused && i() === cursor()
                const size = obj.metadata?.size != null ? formatSize(obj.metadata.size) : ""
                return (
                  <box
                    flexDirection="row"
                    paddingLeft={1}
                    height={1}
                    backgroundColor={active() ? COLORS.overlay : COLORS.background}
                  >
                    <text fg={active() ? COLORS.blue : COLORS.text} width={leftWidth() - 9}>
                      {active() ? "▶ " : "  "}{trunc(obj.name, leftWidth() - 11)}
                    </text>
                    <text fg={COLORS.muted} width={8}>{size}</text>
                  </box>
                )
              }}
            </For>
          </Show>
        </box>

        <box width={1} backgroundColor={COLORS.border} />

        <box flexDirection="column" width={rightWidth()} backgroundColor={COLORS.surface}>
          <Show when={!selected()}>
            <box paddingLeft={2} paddingTop={2}><text fg={COLORS.muted}>Select an object to preview</text></box>
          </Show>
          <Show when={selected()}>
            {(sel) => renderPreview(sel(), rightWidth())}
          </Show>
        </box>
      </box>
    </box>
  )
}
