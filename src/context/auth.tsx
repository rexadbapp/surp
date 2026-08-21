import { createContext, useContext, createSignal, onMount, type ParentProps } from "solid-js"
import { readToken, saveToken, clearToken, validateToken } from "../auth/index"

export interface AuthState {
  token: string | null
  loading: boolean
  error: string | null
}

export interface AuthContextValue {
  get state(): AuthState
  login: (token: string) => Promise<boolean>
  /** Set a token that has already been verified (e.g. from OAuth flow) */
  setToken: (token: string) => Promise<void>
  logout: () => Promise<void>
  token: () => string | null
  isLoggedIn: () => boolean
}

const AuthContext = createContext<AuthContextValue>()

export function AuthProvider(props: ParentProps) {
  const [state, setState] = createSignal<AuthState>({
    token: null,
    loading: true,
    error: null,
  })

  const patch = (p: Partial<AuthState>) => setState((s) => ({ ...s, ...p }))

  onMount(async () => {
    try {
      const token = await readToken()
      patch({ token, loading: false })
    } catch (e) {
      patch({ loading: false, error: String(e) })
    }
  })

  const login = async (token: string): Promise<boolean> => {
    patch({ loading: true, error: null })
    const valid = await validateToken(token)
    if (!valid) {
      patch({ loading: false, error: "Invalid token. Check your Supabase personal access token." })
      return false
    }
    await saveToken(token)
    patch({ token, loading: false })
    return true
  }

  const setToken = async (token: string) => {
    await saveToken(token)
    patch({ token, loading: false, error: null })
  }

  const logout = async () => {
    await clearToken()
    patch({ token: null, loading: false, error: null })
  }

  const ctx: AuthContextValue = {
    get state() { return state() },
    login,
    setToken,
    logout,
    token: () => state().token,
    isLoggedIn: () => state().token !== null,
  }

  return <AuthContext.Provider value={ctx}>{props.children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
