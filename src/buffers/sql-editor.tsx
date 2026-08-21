import { createSignal, createMemo, createEffect, onCleanup, Show, For } from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import { SyntaxStyle } from "@opentui/core"
import { SQL_KEYWORDS, tokenizeLine } from "./sql-tokenizer"
import { useMode } from "../context/mode"
import { sidebarFocusedForSql } from "../panes/sidebar"
import { COLORS } from "../ui/colors"
import { cursorTheme, resolveCursorColor } from "../ui/cursor"

const POPUP_W = 24

export interface SqlEditorProps {
  value: string
  onEdit: (v: string) => void
  onSubmit: () => void
  onModeChange?: (mode: "normal" | "insert" | "visual") => void
  onYankSelection?: (text: string) => void
  focused: boolean
  width: number
  height: number
  completions?: string[]
}

export function SqlEditor(props: SqlEditorProps) {
  const renderer = useRenderer()
  const mode = useMode()
  let textarea: any = null

  const [vimMode, setVimMode] = createSignal<"normal" | "insert" | "visual">("normal")
  const [pendingSeq, setPendingSeq] = createSignal<string | null>(null)
  const [suggIdx, setSuggIdx] = createSignal(0)
  const [curLine, setCurLine] = createSignal(0)
  const [curCol, setCurCol] = createSignal(0)
  const [scrollOff, setScrollOff] = createSignal(0)

  function emitMode(m: "normal" | "insert" | "visual") {
    setVimMode(m)
    props.onModeChange?.(m)
    if (m === "insert") mode.enterInsert()
    else if (m === "visual") mode.enterVisual()
    else mode.enterNormal()
  }

  function rehighlight() {
    if (!textarea) return
    const em = textarea.extmarks
    if (!em) return
    em.clear()
    const text = textarea.plainText
    const lines = text.split("\n")
    let offset = 0
    for (const line of lines) {
      const tokens = tokenizeLine(line)
      for (const t of tokens) {
        let sid: number | null = null
        if (t.type === "keyword") sid = sKeyword
        else if (t.type === "string") sid = sString
        else if (t.type === "number") sid = sNum
        else if (t.type === "comment") sid = sComment
        else if (t.type === "operator") sid = sOp
        else if (t.type === "paren") sid = sParen
        if (sid != null && t.text.length > 0) {
          em.create({ start: offset, end: offset + t.text.length, styleId: sid })
        }
        offset += t.text.length
      }
      offset += 1
    }
  }

  function syncContent() {
    if (textarea) props.onEdit(textarea.plainText)
    rehighlight()
  }

  function handleCursorChange(pos: { line: number; visualColumn: number }) {
    setCurLine(pos.line)
    setCurCol(pos.visualColumn)
    if (textarea) setScrollOff(textarea.scrollY)
  }

  function getWordAt(line: number, col: number): string {
    if (!textarea) return ""
    const lines = textarea.plainText.split("\n") as string[]
    return (lines[line] ?? "").slice(0, col).match(/[a-zA-Z_][a-zA-Z0-9_]*$/)?.[0] ?? ""
  }

  function currentWordLive(): string {
    if (!textarea) return ""
    const offset = textarea.cursorOffset as number
    return (textarea.plainText as string).slice(0, offset).match(/[a-zA-Z_][a-zA-Z0-9_]*$/)?.[0] ?? ""
  }

  function getSelectedText(): string {
    if (!textarea) return ""
    const sel = textarea.getSelection()
    if (!sel) return ""
    return (textarea.plainText as string).slice(sel.start, sel.end)
  }

  // Insert-mode key handling (runs inside textarea's onKeyDown, before its handleKeyPress)
  function handleInsertKey(e: KeyEvent) {
    if (vimMode() !== "insert") return
    if (e.name === "escape") {
      e.preventDefault()
      emitMode("normal")
      return
    }
    if ((e.name === "return" || e.name === "enter") && e.ctrl) {
      e.preventDefault()
      props.onSubmit()
      return
    }
    const suggs = suggestions()
    if (suggs.length > 0 && (e.name === "up" || e.name === "down") && !e.ctrl) {
      e.preventDefault()
      setSuggIdx(i => e.name === "up" ? Math.max(0, i - 1) : Math.min(suggs.length - 1, i + 1))
      return
    }
    if (e.name === "tab") {
      e.preventDefault()
      if (suggs.length > 0 && textarea) {
        const word = currentWordLive()
        const s = suggs[suggIdx()]
        if (s && word) {
          const rest = s.slice(word.length)
          if (rest) textarea.insertText(rest)
        }
      } else if (textarea) {
        textarea.insertText("  ")
      }
      return
    }
  }

  // Register raw key handler — only in normal/visual mode, NOT in insert mode
  createEffect(() => {
    if (!props.focused || mode.is("command") || sidebarFocusedForSql()) return
    if (vimMode() === "insert") return

    const kh = renderer.keyInput

    function onKey(e: KeyEvent) {
      const vm = vimMode()

      // --- NORMAL MODE ---
      if (vm === "normal") {
        const pending = pendingSeq()

        if (pending) {
          e.preventDefault()
          setPendingSeq(null)
          if (pending === "d" && e.name === "d") { textarea?.deleteLine(); return }
          if (pending === "g" && e.name === "g") { textarea?.gotoBufferHome(); return }
          if (pending === "y" && e.name === "y") {
            if (textarea) {
              const lines = textarea.plainText.split("\n") as string[]
              const offset = textarea.cursorOffset as number
              let pos = 0
              for (let i = 0; i < lines.length; i++) {
                const next = pos + lines[i]!.length + 1
                if (offset < next || i === lines.length - 1) {
                  props.onYankSelection?.(lines[i]!)
                  break
                }
                pos = next
              }
            }
            return
          }
          return
        }

        e.preventDefault()

        if (e.name === "d" && !e.ctrl && !e.meta) { setPendingSeq("d"); return }
        if (e.name === "g" && !e.ctrl && !e.meta) { setPendingSeq("g"); return }
        if (e.name === "y" && !e.ctrl && !e.meta) { setPendingSeq("y"); return }

        if (!e.ctrl) {
          if (e.name === "h" || e.name === "left") { textarea?.moveCursorLeft(); return }
          if (e.name === "j" || e.name === "down") { textarea?.moveCursorDown(); return }
          if (e.name === "k" || e.name === "up") { textarea?.moveCursorUp(); return }
          if (e.name === "l" || e.name === "right") { textarea?.moveCursorRight(); return }
        }
        if (e.name === "0" || (e.name === "home" && !e.ctrl)) { textarea?.gotoLineHome(); return }
        if (e.name === "$" || e.name === "end") { textarea?.gotoLineEnd(); return }
        if (e.name === "G" && !e.ctrl) { textarea?.gotoBufferEnd(); return }
        if (e.name === "w" && !e.ctrl) { textarea?.moveWordForward(); return }
        if (e.name === "b" && !e.ctrl) { textarea?.moveWordBackward(); return }
        if (e.name === "x" && !e.ctrl && !e.meta) { textarea?.deleteChar(); return }
        if (e.name === "u" && !e.ctrl) { textarea?.undo(); return }
        if (e.name === "r" && e.ctrl) { textarea?.redo(); return }
        if (e.name === "i" && !e.ctrl && !e.meta) { emitMode("insert"); return }
        if (e.name === "a" && !e.ctrl && !e.meta) { textarea?.moveCursorRight(); emitMode("insert"); return }
        if (e.name === "I" && !e.ctrl && !e.meta) { textarea?.gotoLineHome(); emitMode("insert"); return }
        if (e.name === "A" && !e.ctrl && !e.meta) { textarea?.gotoLineEnd(); emitMode("insert"); return }
        if (e.name === "o" && !e.ctrl && !e.meta) { textarea?.gotoLineEnd(); textarea?.newLine(); emitMode("insert"); return }
        if (e.name === "O" && !e.ctrl && !e.meta) { textarea?.gotoLineHome(); textarea?.newLine(); emitMode("insert"); return }
        if (e.name === "v" && !e.ctrl && !e.meta) { emitMode("visual"); return }
        return
      }

      // --- VISUAL MODE ---
      if (vm === "visual") {
        e.preventDefault()
        if (e.name === "escape") { emitMode("normal"); return }
        if (e.name === "y" && !e.ctrl && !e.meta) {
          const text = getSelectedText()
          if (text) props.onYankSelection?.(text)
          emitMode("normal")
          return
        }
        if (!e.ctrl) {
          if (e.name === "h" || e.name === "left") { textarea?.moveCursorLeft({ select: true }); return }
          if (e.name === "j" || e.name === "down") { textarea?.moveCursorDown({ select: true }); return }
          if (e.name === "k" || e.name === "up") { textarea?.moveCursorUp({ select: true }); return }
          if (e.name === "l" || e.name === "right") { textarea?.moveCursorRight({ select: true }); return }
        }
        if (e.name === "0" || (e.name === "home" && !e.ctrl)) { textarea?.gotoLineHome({ select: true }); return }
        if (e.name === "$" || e.name === "end") { textarea?.gotoLineEnd({ select: true }); return }
        if (e.name === "G" && !e.ctrl) { textarea?.gotoBufferEnd({ select: true }); return }
        if (e.name === "w" && !e.ctrl) { textarea?.moveWordForward({ select: true }); return }
        if (e.name === "b" && !e.ctrl) { textarea?.moveWordBackward({ select: true }); return }
        return
      }
    }

    kh.on("keypress", onKey)
    onCleanup(() => kh.off("keypress", onKey))
  })

  createEffect(() => {
    if (textarea) textarea.setViewportSize?.(props.width - 2, props.height)
  })

  // Sync external value changes (e.g. snippet loads) into the textarea
  createEffect(() => {
    const v = props.value
    if (textarea && v !== textarea.plainText) {
      textarea.replaceText(v)
      rehighlight()
    }
  })

  // Apply cursor theme to the editor
  createEffect(() => {
    const ct = cursorTheme()
    if (!textarea) return
    textarea.cursorColor = resolveCursorColor(ct, COLORS)
    textarea.cursorStyle = { style: ct.shape, blinking: ct.blinking }
  })

  let sKeyword: number, sString: number, sNum: number, sComment: number, sOp: number, sParen: number
  let ss: SyntaxStyle | null = null
  let syntaxHighlightCleanup: (() => void) | null = null

  function setupSyntaxHighlighting(el: any) {
    cleanupSyntaxHighlighting()
    ss = SyntaxStyle.create()
    sKeyword = ss.registerStyle("sqlKeyword", { fg: COLORS.mauve })
    sString  = ss.registerStyle("sqlString",  { fg: COLORS.green })
    sNum     = ss.registerStyle("sqlNumber",  { fg: COLORS.peach })
    sComment = ss.registerStyle("sqlComment", { fg: COLORS.muted })
    sOp      = ss.registerStyle("sqlOperator",{ fg: COLORS.teal })
    sParen   = ss.registerStyle("sqlParen",   { fg: COLORS.yellow })
    el.syntaxStyle = ss
    rehighlight()

    syntaxHighlightCleanup = () => {
      el.syntaxStyle = null
      ss?.destroy()
      ss = null
    }
  }

  function cleanupSyntaxHighlighting() {
    syntaxHighlightCleanup?.()
    syntaxHighlightCleanup = null
  }

  onCleanup(cleanupSyntaxHighlighting)

  const suggestions = createMemo((): string[] => {
    if (vimMode() !== "insert") return []
    const word = getWordAt(curLine(), curCol())
    if (word.length < 2) return []
    const lower = word.toLowerCase()
    const kws = SQL_KEYWORDS.filter(k => k.toLowerCase().startsWith(lower) && k !== word.toUpperCase())
    const ns = (props.completions ?? []).filter(n => n.toLowerCase().startsWith(lower))
    return [...kws, ...ns].slice(0, 6)
  })

  const popupY = createMemo(() => Math.min(curLine() - scrollOff() + 1, Math.max(0, props.height - 2)))
  const popupX = createMemo(() => Math.min(curCol() + 2, Math.max(0, props.width - POPUP_W - 2)))

  return (
    <box
      flexDirection="column"
      width={props.width}
      height={props.height}
      backgroundColor={vimMode() !== "normal" ? COLORS.overlay : COLORS.surface}
      paddingLeft={1}
      border={["left"] as any}
      borderColor={vimMode() === "visual" ? COLORS.mauve : vimMode() === "insert" ? COLORS.blue : COLORS.border}
    >
      <textarea
        ref={(el: any) => {
          textarea = el
          if (el) {
            el.setViewportSize?.(props.width - 2, props.height)
            setupSyntaxHighlighting(el)
          }
        }}
        initialValue={props.value}
        onContentChange={syncContent}
        onCursorChange={handleCursorChange}
        onKeyDown={handleInsertKey}
        focused={props.focused && vimMode() !== "normal"}
        width={props.width - 2}
        height={props.height}
        showCursor={true}
        wrapMode="word"
      />

      <Show when={suggestions().length > 0 && vimMode() === "insert"}>
        <box position="absolute" top={popupY()} left={popupX()} width={POPUP_W} backgroundColor={COLORS.surface}>
          <For each={suggestions()}>
            {(s, i) => (
              <box height={1} paddingLeft={1} backgroundColor={i() === suggIdx() ? COLORS.overlay : COLORS.surface}>
                <text fg={i() === suggIdx() ? COLORS.blue : COLORS.muted}>
                  {i() === suggIdx() ? "▶ " : "  "}{s}
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
    </box>
  )
}
