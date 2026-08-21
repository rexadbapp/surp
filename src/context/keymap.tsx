import {
  createContext,
  useContext,
  createSignal,
  onMount,
  onCleanup,
  type ParentProps,
  type Accessor,
} from "solid-js"
import { useRenderer } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import { type Action, buildActionMap, matchSequence, keyToString } from "../keybindings"
import { useMode } from "./mode"
import { useBuffers } from "./buffers"
import { useYank } from "./yank"
import type { KeybindingsConfig } from "../config"

export interface KeymapContextValue {
  pendingSequence: Accessor<string[]>
  /** Register an action handler for normal mode. Returns unregister fn. */
  onAction: (action: Action, handler: () => void) => () => void
}

const KeymapContext = createContext<KeymapContextValue>()

export function KeymapProvider(props: ParentProps<{ keybindings: KeybindingsConfig }>) {
  const renderer = useRenderer()
  const mode = useMode()
  const buffers = useBuffers()
  const yank = useYank()
  const [pending, setPending] = createSignal<string[]>([])
  const actionMap = buildActionMap(props.keybindings)
  const handlers = new Map<Action, Set<() => void>>()

  let timer: ReturnType<typeof setTimeout> | null = null
  let deferredAction: Action | null = null  // full match waiting out a partial ambiguity

  function resetSequence(fireDeferred = false) {
    const action = fireDeferred ? deferredAction : null
    deferredAction = null
    setPending([])
    if (timer) { clearTimeout(timer); timer = null }
    if (action) dispatchAction(action)
  }

  function dispatchAction(action: Action) {
    // If the user has text selected via mouse drag, y yanks that selection globally
    if (action === "yank" && renderer.hasSelection) {
      const text = renderer.getSelection()?.getSelectedText()
      if (text) {
        yank.yank(text, "selection")
        renderer.clearSelection()
        return
      }
    }

    const set = handlers.get(action)
    // Snapshot before iterating — components mounted during dispatch must not fire in this cycle
    if (set) for (const h of [...set]) h()

    // Built-in buffer actions
    switch (action) {
      case "next_buffer": buffers.nextBuffer(); break
      case "prev_buffer": buffers.prevBuffer(); break
      case "command_mode": mode.enterCommand(); break
      case "quit_buffer": {
        const b = buffers.activeBuffer()
        if (b) buffers.close(b.id)
        break
      }
      case "escape": mode.enterNormal(); break
    }
  }

  function handleNormalKey(event: KeyEvent) {
    const key = keyToString(event)
    // When mid-sequence with ctrl held, also try the bare key (no ctrl).
    // This lets users hold ctrl through sequences: ctrl+w ctrl+h → pane_left.
    const candidates =
      event.ctrl && pending().length > 0
        ? [key, keyToString({ ...event, ctrl: false })]
        : [key]

    for (const k of candidates) {
      const seq = [...pending(), k]
      const { fullAction, hasPartial } = matchSequence(seq, actionMap)

      if (hasPartial) {
        // Ambiguous — longer binding may follow. Wait out the timer.
        // If there's already a full match (e.g. "y" while "yy" also exists),
        // remember it so the timeout can fire it if no further key arrives.
        setPending(seq)
        deferredAction = fullAction
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => resetSequence(true), 500)
        return
      }

      if (fullAction) {
        resetSequence()
        dispatchAction(fullAction)
        return
      }
    }

    resetSequence()
  }

  onMount(() => {
    const kh = renderer.keyInput

    function onKeypress(event: KeyEvent) {
      const m = mode.mode()

      if (m === "normal") {
        handleNormalKey(event)
        return
      }
      // command/insert mode handled by palette/editor components directly
    }

    kh.on("keypress", onKeypress)
    onCleanup(() => kh.off("keypress", onKeypress))
  })

  const onAction = (action: Action, handler: () => void): (() => void) => {
    if (!handlers.has(action)) handlers.set(action, new Set())
    handlers.get(action)!.add(handler)
    onCleanup(() => handlers.get(action)?.delete(handler))
    return () => handlers.get(action)?.delete(handler)
  }

  const ctx: KeymapContextValue = { pendingSequence: pending, onAction }

  return <KeymapContext.Provider value={ctx}>{props.children}</KeymapContext.Provider>
}

export function useKeymap(): KeymapContextValue {
  const ctx = useContext(KeymapContext)
  if (!ctx) throw new Error("useKeymap must be used within KeymapProvider")
  return ctx
}
