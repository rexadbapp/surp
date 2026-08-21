import { createContext, useContext, createSignal, type Accessor, type ParentProps } from "solid-js"

export type Mode = "normal" | "command" | "insert" | "visual"

export interface ModeContextValue {
  mode: Accessor<Mode>
  enterNormal: () => void
  enterCommand: () => void
  enterInsert: () => void
  enterVisual: () => void
  is: (m: Mode) => boolean
}

const ModeContext = createContext<ModeContextValue>()

export function ModeProvider(props: ParentProps) {
  const [mode, setMode] = createSignal<Mode>("normal")

  const ctx: ModeContextValue = {
    mode,
    enterNormal: () => setMode("normal"),
    enterCommand: () => setMode("command"),
    enterInsert: () => setMode("insert"),
    enterVisual: () => setMode("visual"),
    is: (m) => mode() === m,
  }

  return <ModeContext.Provider value={ctx}>{props.children}</ModeContext.Provider>
}

export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error("useMode must be used within ModeProvider")
  return ctx
}
